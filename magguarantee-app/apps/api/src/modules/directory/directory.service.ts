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
// The admin grant is the exception that proves the rule: it has a real actor,
// so it is audited by the `@Audit` interceptor on the route, not from here.

import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  SSO_DIRECTORY_UNAVAILABLE,
  SSO_GRANT_ACCOUNT_CONFLICT,
  SSO_GRANT_EMPLOYEE_INACTIVE,
  SSO_GRANT_NOT_EMPLOYEE,
  type AssignableRole,
  type Role,
  type SsoAccessGrantOutcome,
  type SsoGrantConflictReason,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import { isPrismaUniqueViolation } from '../../common/errors/prisma-error';
import type { Env } from '../../config/env.schema';
import { AuditWriter } from '../audit/audit.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { assertLiderPair } from '../users/lider-pair';
import { overridePruneFor, pruneAuditEntry } from '../users/permission-overrides';
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

/** What an admin grant did, and to which row. */
export interface AccessGrant {
  user: UserRow;
  outcome: SsoAccessGrantOutcome;
}

/**
 * What a stanowisko grants: the role and the leader flag on top of it
 * (docs/28 §2). The pair is valid by construction — the mapping row is guarded
 * by CHECK `stanowisko_role_mapping_lider_requires_lider_role`.
 */
export interface DirectoryAccess {
  role: AssignableRole;
  lider: boolean;
}

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
   * Role and leader flag for a stanowisko, or null when it has no mapping —
   * which includes the `stanowisko: null` case (MAGSpace has an employee card
   * with no position assigned yet). Both mean the same thing here: no access,
   * fail-closed.
   */
  async accessFor(
    stanowisko: MagspaceEmployee['stanowisko'],
  ): Promise<DirectoryAccess | null> {
    if (!stanowisko) return null;
    const mapping = await this.mappings.findByCode(stanowisko.code);
    return mapping ? { role: mapping.role, lider: mapping.lider } : null;
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
   *
   * `lider` is the mapping's flag and follows the same ownership rule as the
   * role (docs/28 §2): applied when the role comes from the mapping, ignored
   * — the stored flag stays — when `roleOverride` is set.
   *
   * The per-user permission overrides (docs/25 §3 B6) are never taken from
   * MAGSpace: a new account starts without any, and a sync only prunes the
   * entries its `(role, lider)` change no longer admits
   * (`system.pruneUserPermissions`).
   */
  async provisionOrSync(args: {
    existing: UserRow | null;
    employee: MagspaceEmployee;
    role: AssignableRole;
    lider: boolean;
    googleSub: string;
  }): Promise<UserRow> {
    return args.existing
      ? this._syncExisting({ ...args, existing: args.existing })
      : this._provisionNew(args);
  }

  /** First Google sign-in of someone we have no row for: JIT-create it. */
  private async _provisionNew(args: {
    employee: MagspaceEmployee;
    role: AssignableRole;
    lider: boolean;
    googleSub: string;
  }): Promise<UserRow> {
    const { employee, googleSub } = args;
    const login = await this.allocateLogin(employee.email);
    const created = await this.users.createFromDirectory({
      login,
      email: employee.email,
      name: displayName(employee),
      role: args.role,
      lider: args.lider,
      googleSub,
      authProvider: 'google',
      magspaceEmployeeId: employee.id,
      directorySyncedAt: new Date(),
    });
    await this.audit.log({
      action: 'provisionUserFromDirectory',
      targetType: 'User',
      targetKey: created.login,
      after: {
        role: created.role,
        lider: created.lider,
        email: created.email,
        managedBy: 'magspace',
      },
      metadata: { stanowiskoCode: employee.stanowisko?.code ?? null },
      actor: { userId: created.id, userRole: created.role as Role },
    });
    this.logger.log({
      msg: 'user provisioned from directory',
      userId: created.id,
      role: created.role,
      lider: created.lider,
      stanowiskoCode: employee.stanowisko?.code ?? null,
    });
    return created;
  }

  /** Refreshes an existing account from the directory on sign-in. */
  private async _syncExisting(args: {
    existing: UserRow;
    employee: MagspaceEmployee;
    role: AssignableRole;
    lider: boolean;
    googleSub: string;
  }): Promise<UserRow> {
    const { existing, employee, googleSub } = args;
    const name = displayName(employee);
    // An admin-granted role is never overwritten by the mapping — and neither
    // is the leader flag that goes with it.
    const fromOverride = existing.roleOverride !== null;
    const effectiveRole = existing.roleOverride ?? args.role;
    const effectiveLider = fromOverride ? existing.lider : args.lider;
    const changed =
      existing.role !== effectiveRole ||
      existing.lider !== effectiveLider ||
      existing.name !== name ||
      existing.email !== employee.email ||
      !existing.active ||
      existing.googleSub !== googleSub ||
      existing.magspaceEmployeeId !== employee.id ||
      existing.managedBy !== 'magspace';

    // docs/25 B6 — the directory never sets the override lists; it only prunes
    // what the pair it is about to write no longer admits, in this UPDATE.
    const next = { role: effectiveRole, lider: effectiveLider };
    const prune = overridePruneFor(existing, next);

    const updated = await this.users.update(existing.id, {
      email: employee.email,
      name,
      // One UPDATE for the pair: the CHECK `user_lider_requires_lider_role`
      // sees only the final (role, lider).
      role: effectiveRole,
      lider: effectiveLider,
      active: true,
      managedBy: 'magspace',
      // `google` = has signed in with Google at least once — true from here on,
      // including for accounts an admin created or granted ahead of time.
      authProvider: 'google',
      googleSub,
      magspaceEmployeeId: employee.id,
      directorySyncedAt: new Date(),
      ...(prune ? prune.data : {}),
    });

    if (changed) {
      await this.audit.log({
        action: 'syncUserFromDirectory',
        targetType: 'User',
        targetKey: updated.login,
        before: {
          role: existing.role,
          lider: existing.lider,
          name: existing.name,
          active: existing.active,
        },
        after: {
          role: updated.role,
          lider: updated.lider,
          name: updated.name,
          active: updated.active,
        },
        metadata: {
          stanowiskoCode: employee.stanowisko?.code ?? null,
          roleFromOverride: fromOverride,
        },
        actor: { userId: updated.id, userRole: updated.role as Role },
      });
    }
    if (prune) await this.audit.log(pruneAuditEntry(existing, next, prune, 'signIn'));
    return updated;
  }

  /**
   * Links a Google account to an existing local user on first sign-in. Used for
   * the `managedBy = 'local'` path (admins), which never consults MAGSpace.
   * Stamps `authProvider = 'google'` for the same reason `provisionOrSync` does.
   */
  async linkGoogleAccount(user: UserRow, googleSub: string): Promise<UserRow> {
    const updated = await this.users.update(user.id, { googleSub, authProvider: 'google' });
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

  // ── Admin grant (docs/24 §10) ──────────────────────────

  /**
   * «Nadaj dostęp»: gives a named employee a hand-picked role in one step —
   * the answer to an `SSO_NO_ROLE` refusal for the deliberately-unmapped
   * stanowiska.
   *
   * Always writes `roleOverride`, even when the stanowisko has meanwhile been
   * mapped: the admin chose this role for this person, and that choice must
   * survive a later re-mapping of the position. `role` and `active` are written
   * directly as well — the reconcile never applies an override to `role` and
   * never reactivates anyone, so without this the account would sit disabled
   * (or on its old role) until the person's next sign-in.
   *
   * Audited by the route's `@Audit` interceptor (actor = the admin); this only
   * contributes the `before` snapshot and the business metadata — plus, when
   * the new `(role, lider)` no longer admits some of the account's per-user
   * permission overrides (docs/25 §3 B6), the `system.pruneUserPermissions`
   * row of that prune. The grant never SETS the overrides.
   *
   * `lider` (docs/28 §2) is written with the role, and — being a hand-granted
   * role's flag — is then left alone by every sync. This is the only one-step
   * way to make someone a DAF / opiekun / eksport leader: no stanowisko maps
   * to one. The pair is checked before MAGSpace is asked.
   */
  async grantAccess(
    email: string,
    role: AssignableRole,
    lider = false,
  ): Promise<AccessGrant> {
    assertLiderPair(role, lider);
    const employee = await this._requireGrantableEmployee(email);
    // Keyed on MAGSpace's own spelling of the address: that is what a new row
    // would store, so that is what the UNIQUE index would collide on.
    const existing = await this.users.findByEmailIncludingDeleted(employee.email);
    const grant = existing
      ? await this._regrantExisting(existing, role, lider)
      : await this._createGranted(employee, role, lider);

    const stanowiskoCode = employee.stanowisko?.code ?? null;
    AuditContext.setMetadata({
      outcome: grant.outcome,
      stanowiskoCode,
      magspaceEmployeeId: employee.id,
    });
    this.logger.log({
      msg: 'directory access granted by admin',
      userId: grant.user.id,
      role,
      lider,
      outcome: grant.outcome,
      stanowiskoCode,
    });
    return grant;
  }

  /** MAGSpace must positively confirm a current employee — anything else refuses. */
  private async _requireGrantableEmployee(email: string): Promise<MagspaceEmployee> {
    const lookup = await this.resolveEmployee(email);
    if (lookup.kind === 'unavailable') {
      throw new ServiceUnavailableException({
        message: 'MAGSpace chwilowo niedostępny — nie można potwierdzić pracownika. Spróbuj za chwilę.',
        extensions: { code: SSO_DIRECTORY_UNAVAILABLE },
      });
    }
    if (lookup.kind === 'not_found') {
      throw new UnprocessableEntityException({
        message: 'W MAGSpace nie ma pracownika z tym adresem e-mail.',
        extensions: { code: SSO_GRANT_NOT_EMPLOYEE },
      });
    }
    if (!lookup.employee.active) {
      throw new UnprocessableEntityException({
        message: 'Ten pracownik jest nieaktywny w MAGSpace — dostępu nie można nadać.',
        extensions: { code: SSO_GRANT_EMPLOYEE_INACTIVE },
      });
    }
    return lookup.employee;
  }

  /**
   * No account yet: create a passwordless, directory-managed one. `before`
   * stays unset — there was nothing before, and the audit column is NULL.
   */
  private async _createGranted(
    employee: MagspaceEmployee,
    role: AssignableRole,
    lider: boolean,
  ): Promise<AccessGrant> {
    const login = await this.allocateLogin(employee.email);
    try {
      const user = await this.users.createFromDirectory({
        login,
        email: employee.email,
        name: displayName(employee),
        role,
        roleOverride: role,
        lider,
        // Not `google` yet: the person has not signed in. The first Google
        // sign-in links `googleSub` by e-mail and flips this.
        authProvider: 'local',
        magspaceEmployeeId: employee.id,
        directorySyncedAt: new Date(),
      });
      return { user, outcome: 'created' };
    } catch (err) {
      // Lost a race: a concurrent grant / first sign-in took the login slug, or
      // another row already carries this MAGSpace id under a different e-mail.
      if (isPrismaUniqueViolation(err)) {
        throw grantConflict(
          'unique',
          'Nie udało się założyć konta — login lub powiązanie z MAGSpace jest już zajęte. Odśwież listę użytkowników i spróbuj ponownie.',
        );
      }
      throw err;
    }
  }

  /** Existing directory-managed account: set the role by hand and (re)activate. */
  private async _regrantExisting(
    existing: UserRow,
    role: AssignableRole,
    lider: boolean,
  ): Promise<AccessGrant> {
    assertDirectoryMayTakeOver(existing);
    // Nested under `user` so it survives the interceptor trimming `before` to
    // the key-set of the response (`{ user, outcome }`).
    AuditContext.setBefore({
      user: {
        role: existing.role,
        lider: existing.lider,
        active: existing.active,
        managedBy: existing.managedBy,
        roleOverride: existing.roleOverride,
        liderId: existing.liderId,
      },
    });
    // docs/29 U9 — a leader link lives only on a planista. The grant makes
    // `role` the effective role (it writes `roleOverride` too), so a grant of
    // any other role drops the account's OWN link — the same rule as
    // `PATCH /users/:id`. Only this account's `liderId` is touched: if it is
    // itself a leader, its planisci keep pointing at it (U10).
    const dropsLeaderLink = role !== 'planista' && existing.liderId !== null;
    // docs/25 B6 — prune (never seed) the override lists for the new pair.
    const prune = overridePruneFor(existing, { role, lider });
    // One UPDATE: `role`, `roleOverride` and `lider` must land together — the
    // CHECK judges the final (role, lider), and the next sync reads
    // (roleOverride, lider).
    const user = await this.users.update(existing.id, {
      role,
      roleOverride: role,
      lider,
      ...(dropsLeaderLink ? { liderId: null } : {}),
      active: true,
      directorySyncedAt: new Date(),
      ...(prune ? prune.data : {}),
    });
    if (prune) {
      await this.audit.log(pruneAuditEntry(existing, { role, lider }, prune, 'grantAccess'));
    }
    return { user, outcome: existing.active ? 'updated' : 'reactivated' };
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
        // The refusal is listed there with a one-step «Nadaj dostęp».
        ssoUrl: `${appUrl}/employee/sso`,
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
 * The grant only ever takes over a directory-managed, live, non-privileged
 * account. Everything else belongs to someone else's decision and is refused
 * with a reason the web can localise.
 */
function assertDirectoryMayTakeOver(existing: UserRow): void {
  if (existing.deletedAt) {
    throw grantConflict(
      'deleted',
      'Konto z tym adresem e-mail zostało wcześniej usunięte i nadal blokuje ten adres — nowego konta nie można założyć.',
    );
  }
  if (existing.role === 'admin' || existing.role === 'przewoznik') {
    throw grantConflict(
      'privileged',
      'To konto ma rolę administratora lub przewoźnika — dostępu przez MAGSpace nie można mu nadać.',
    );
  }
  if (existing.managedBy === 'local') {
    throw grantConflict(
      'local',
      'Konto istnieje i jest zarządzane lokalnie — edytuj je w Użytkownikach.',
    );
  }
}

function grantConflict(reason: SsoGrantConflictReason, message: string): ConflictException {
  return new ConflictException({
    message,
    extensions: { code: SSO_GRANT_ACCOUNT_CONFLICT, reason },
  });
}

/** "First Last", or null when MAGSpace has neither. */
function displayName(employee: MagspaceEmployee): string | null {
  return `${employee.firstName} ${employee.lastName}`.trim() || null;
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
