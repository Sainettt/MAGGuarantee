// Employee-directory logic: who MAGSpace says a person is, which role that maps
// to, and the provisioning / deprovisioning that follows (docs/24 §A2).
//
// The sign-in orchestration itself lives in `AuthService.loginWithGoogle` — this
// service owns every decision that depends on the directory, so the reconcile
// cron and the login path cannot drift apart.
//
// A note on audit actors. `AuditWriter` refuses an `actor: 'system'` row whose
// action is not `system.`-prefixed, and rightly so: operators must be able to
// filter background activity out of their dashboards. Provisioning happens on
// behalf of the person signing in, so it is attributed to them; a refusal or a
// deprovisioning has no authenticated actor and is therefore `system.`-tagged.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AssignableRole, Role } from '@magguarantee/shared';

import type { Env } from '../../config/env.schema';
import { AuditWriter } from '../audit/audit.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { UsersRepository, type UserRow } from '../users/users.repository';
import {
  DirectoryUnavailableError,
  EmployeeNotFoundError,
  MagspaceClient,
  type MagspaceEmployee,
} from './magspace.client';
import { StanowiskoRoleMappingRepository } from './stanowisko-role-mapping.repository';

/** Outcome of asking MAGSpace about one address. */
export type DirectoryLookup =
  | { kind: 'found'; employee: MagspaceEmployee }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

/** Why an account lost its access. Recorded verbatim in the audit row. */
export type DeprovisionReason =
  | 'not_found'
  | 'inactive'
  | 'unmapped'
  | 'reconcile_not_found'
  | 'reconcile_inactive'
  | 'reconcile_unmapped';

/**
 * How long one (employee, stanowisko) pair stays quiet after the admins have
 * been told about it. Long enough that a person retrying the button all morning
 * produces one mail, short enough that a genuinely forgotten request resurfaces
 * the next working day.
 */
const ACCESS_REQUEST_DEDUP_SEC = 24 * 60 * 60;

/** Safety rail on the login-slug allocator; see `allocateLogin`. */
const MAX_LOGIN_SUFFIX = 50;

@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);

  constructor(
    private readonly magspace: MagspaceClient,
    private readonly mappings: StanowiskoRoleMappingRepository,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly audit: AuditWriter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** True when both halves of the integration are configured. */
  get isConfigured(): boolean {
    return this.magspace.isConfigured;
  }

  // ── Directory lookups ──────────────────────────────────

  /**
   * Asks MAGSpace about one address, folding both failure modes into the
   * result type. They are NOT interchangeable and the caller must branch:
   * `not_found` is a verdict ("not our employee"), `unavailable` is an absence
   * of one, and an absent verdict must never cost an existing user their access.
   */
  async resolveEmployee(email: string): Promise<DirectoryLookup> {
    try {
      const employee = await this.magspace.lookupByEmail(email);
      return { kind: 'found', employee };
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) return { kind: 'not_found' };
      if (err instanceof DirectoryUnavailableError) return { kind: 'unavailable' };
      throw err;
    }
  }

  /**
   * Role for a stanowisko, or null when it has no mapping — which includes the
   * `stanowisko: null` case (MAGSpace has an employee card with no position
   * assigned yet). Both mean the same thing here: no access, fail-closed.
   */
  async roleFor(
    stanowisko: MagspaceEmployee['stanowisko'],
  ): Promise<AssignableRole | null> {
    if (!stanowisko) return null;
    const mapping = await this.mappings.findByCode(stanowisko.code);
    return mapping?.role ?? null;
  }

  // ── Provisioning ───────────────────────────────────────

  /**
   * Creates or refreshes the local account for an employee who just proved
   * their Google identity.
   *
   * `roleOverride` wins over `role` whenever it is set: an admin granted that
   * person a role by hand precisely because their stanowisko must not decide it
   * (docs/24 §4). Everything else — name, e-mail, active, the directory link —
   * is refreshed from MAGSpace on every sign-in, which is what makes a rename
   * or a re-hire propagate without anyone touching the admin UI.
   */
  async provisionOrSync(args: {
    existing: UserRow | null;
    employee: MagspaceEmployee;
    role: AssignableRole;
    googleSub: string;
  }): Promise<UserRow> {
    const { existing, employee, googleSub } = args;
    const now = new Date();
    const name = `${employee.firstName} ${employee.lastName}`.trim() || null;

    if (!existing) {
      const login = await this.allocateLogin(employee.email);
      const created = await this.users.createFromDirectory({
        login,
        email: employee.email,
        name,
        role: args.role,
        googleSub,
        magspaceEmployeeId: employee.id,
        directorySyncedAt: now,
      });
      await this.audit.log({
        action: 'provisionUserFromDirectory',
        targetType: 'User',
        targetKey: created.login,
        after: { role: created.role, email: created.email, managedBy: 'magspace' },
        metadata: { stanowiskoCode: employee.stanowisko?.code ?? null },
        actor: { userId: created.id, userRole: created.role as Role },
      });
      this.logger.log({
        msg: 'user provisioned from directory',
        userId: created.id,
        role: created.role,
        stanowiskoCode: employee.stanowisko?.code ?? null,
      });
      return created;
    }

    // An admin-granted role is never overwritten by the mapping.
    const effectiveRole = existing.roleOverride ?? args.role;
    const changed =
      existing.role !== effectiveRole ||
      existing.name !== name ||
      existing.email !== employee.email ||
      !existing.active ||
      existing.googleSub !== googleSub ||
      existing.magspaceEmployeeId !== employee.id ||
      existing.managedBy !== 'magspace';

    const updated = await this.users.update(existing.id, {
      email: employee.email,
      name,
      role: effectiveRole,
      active: true,
      managedBy: 'magspace',
      googleSub,
      magspaceEmployeeId: employee.id,
      directorySyncedAt: now,
    });

    if (changed) {
      await this.audit.log({
        action: 'syncUserFromDirectory',
        targetType: 'User',
        targetKey: updated.login,
        before: { role: existing.role, name: existing.name, active: existing.active },
        after: { role: updated.role, name: updated.name, active: updated.active },
        metadata: {
          stanowiskoCode: employee.stanowisko?.code ?? null,
          roleFromOverride: existing.roleOverride !== null,
        },
        actor: { userId: updated.id, userRole: updated.role as Role },
      });
    }
    return updated;
  }

  /**
   * Links a Google account to an existing local user on first sign-in. Used for
   * the `managedBy = 'local'` path (admins), which never consults MAGSpace.
   */
  async linkGoogleAccount(user: UserRow, googleSub: string): Promise<UserRow> {
    const updated = await this.users.update(user.id, { googleSub });
    await this.audit.log({
      action: 'linkGoogleAccount',
      targetType: 'User',
      targetKey: user.login,
      actor: { userId: user.id, userRole: user.role as Role },
    });
    return updated;
  }

  /**
   * Revokes a user's access: deactivate, then kill every live refresh token.
   *
   * Both halves matter. `JwtAccessStrategy.validate` re-reads the user on every
   * request, so `active = false` stops the current access token within one
   * request; revoking the refresh tokens stops it from being minted again.
   *
   * The row is NOT soft-deleted — a terminated employee's audit trail, opieka
   * links and verification history must stay intact and re-hirable.
   */
  async deprovision(user: UserRow, reason: DeprovisionReason): Promise<void> {
    if (user.active) {
      await this.users.update(user.id, { active: false, directorySyncedAt: new Date() });
    }
    const revoked = await this.refreshTokens.revokeAllForUser(user.id);
    await this.audit.log({
      action: 'system.deprovisionUserFromDirectory',
      targetType: 'User',
      targetKey: user.login,
      before: { active: user.active, role: user.role },
      after: { active: false },
      reason,
      metadata: { revokedTokens: revoked },
      actor: 'system',
    });
    this.logger.log({
      msg: 'user deprovisioned by directory',
      userId: user.id,
      reason,
      revokedTokens: revoked,
    });
  }

  // ── Refusals ───────────────────────────────────────────

  /**
   * Records that an employee was refused for lack of a role and — at most once
   * per 24 h per (employee, stanowisko) — tells the admins so one of them can
   * grant a role by hand.
   *
   * This is the designed onboarding path for the mixed stanowiska, not an
   * exception path: see docs/24 §4. Failures here are swallowed on purpose — a
   * notification problem must not turn into a 500 on someone's login screen,
   * and the audit row is written first so nothing is lost either way.
   */
  async notifyAccessRequested(employee: MagspaceEmployee): Promise<void> {
    const stanowiskoCode = employee.stanowisko?.code ?? null;
    await this.audit
      .log({
        action: 'system.denyDirectoryAccess',
        targetType: 'User',
        targetKey: employee.email,
        reason: 'no role mapped for stanowisko',
        metadata: { stanowiskoCode, magspaceEmployeeId: employee.id },
        actor: 'system',
      })
      .catch((err: unknown) => {
        this.logger.error({
          msg: 'failed to audit a directory access denial',
          error: err instanceof Error ? err.message : String(err),
        });
      });

    try {
      const key = `sso:no-role:${employee.id}:${stanowiskoCode ?? 'none'}`;
      // SET NX semantics via the raw client: `setex` would refresh the window on
      // every attempt and, with someone retrying daily, mail would never resend.
      const claimed = await this.redis.client.set(
        key,
        '1',
        'EX',
        ACCESS_REQUEST_DEDUP_SEC,
        'NX',
      );
      if (claimed !== 'OK') return;

      const admins = await this.users.listByRole('admin');
      if (admins.length === 0) {
        this.logger.warn({
          msg: 'employee needs a role but there is no active admin to tell',
          stanowiskoCode,
        });
        return;
      }

      const appUrl = this.config.get('APP_URL', { infer: true }).replace(/\/+$/u, '');
      const props = {
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeEmail: employee.email,
        stanowiskoName: employee.stanowisko?.name ?? null,
        stanowiskoCode,
        attemptedAtLabel: formatWarsawTimestamp(new Date()),
        usersUrl: `${appUrl}/employee/users`,
      };
      // Per-admin, so one bad address cannot swallow the rest.
      await Promise.allSettled(
        admins.map((admin) =>
          this.mail.enqueueSsoAccessRequested(admin.email, {
            ...props,
            adminName: admin.name ?? admin.login,
          }),
        ),
      );
    } catch (err) {
      this.logger.error({
        msg: 'failed to notify admins about a pending access request',
        stanowiskoCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────

  /**
   * Derives a free `login` from the address' local part — `jan.kowalski` for
   * `jan.kowalski@magtrans.eu`. On a collision it appends `-2`, `-3`, …, the
   * same shape as `Driver.loginSlug` (`drivers.service.ts`).
   *
   * `login` is UNIQUE at the database level, so this is best-effort: two
   * simultaneous first sign-ins could both pick the same free slug, and the
   * loser gets a unique-violation. That is acceptable — retrying the button
   * lands on the next suffix — and it is exactly how driver creation behaves.
   */
  async allocateLogin(email: string): Promise<string> {
    const base = sanitiseLogin(email.split('@')[0] ?? '');
    if (!(await this.users.existsLogin(base))) return base;
    for (let i = 2; i <= MAX_LOGIN_SUFFIX; i += 1) {
      const candidate = `${base}-${i}`;
      if (!(await this.users.existsLogin(candidate))) return candidate;
    }
    // 50 people sharing one local part is not a thing that happens; if it does,
    // an admin creating the account by hand is the right escape hatch.
    throw new Error(`Could not allocate a free login for "${email}"`);
  }
}

/**
 * Local part → a login the `LoginSchema` regex (`[a-zA-Z0-9._-]`, 2-64) accepts.
 * MAGSpace already generates ASCII addresses, so this is a guard rail rather
 * than a transformation.
 */
function sanitiseLogin(localPart: string): string {
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/(^[.\-]+|[.\-]+$)/gu, '')
    .slice(0, 48);
  // Two chars is the schema minimum; an address whose local part survives as
  // one character is pathological, but a 400 on it would be worse than a stub.
  return cleaned.length >= 2 ? cleaned : `user-${cleaned || 'x'}`;
}

/** dd.MM.yyyy HH:mm in the business timezone, for the notification e-mail. */
function formatWarsawTimestamp(at: Date): string {
  const parts = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}
