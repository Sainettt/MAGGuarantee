// Admin-facing side of the SSO feature: the stanowisko → role table, the list
// of sign-ins it has refused, and the one-step grant that answers a refusal
// (docs/24 §A2/§A5/§10).

import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  AssignableRole,
  GrantSsoAccessDto,
  SsoAccessDenialDto,
  SsoAccessGrantResultDto,
  StanowiskoRoleDto,
  StanowiskoRoleListDto,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import { AuditQueryRepository, type AuditLogRow } from '../audit/audit-query.repository';
import { assertLiderPair } from '../users/lider-pair';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { DirectoryService } from './directory.service';
import { DirectoryState } from './directory-state';
import { MagspaceClient } from './magspace.client';
import { StanowiskoRoleMappingRepository } from './stanowisko-role-mapping.repository';

/** How many refused sign-ins (distinct people) the admin screen shows. */
const DENIAL_PAGE_SIZE = 20;

/**
 * How many raw refusal events are scanned to fill that page. One person
 * retrying the button all morning writes one row per attempt, so a page of 20
 * people needs a much wider window of events. 200 keeps it one cheap indexed
 * query while making "20 retries crowd out everyone else" implausible.
 */
const DENIAL_SCAN_WINDOW = 200;

/**
 * Substring of the refusal's audit action (`system.denyDirectoryAccess`).
 * `AuditQueryRepository.list` matches `action` as a case-insensitive
 * substring, which is exactly the admin filter-bar semantics it was built for.
 */
const DENIAL_AUDIT_ACTION = 'denyDirectoryAccess';

/** Placeholder for a refusal row that somehow carries no address. */
const UNKNOWN_EMAIL = '—';

type DenialCore = Pick<SsoAccessDenialDto, 'email' | 'stanowiskoCode' | 'at'>;

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    private readonly mappings: StanowiskoRoleMappingRepository,
    private readonly magspace: MagspaceClient,
    private readonly state: DirectoryState,
    private readonly auditQuery: AuditQueryRepository,
    private readonly directory: DirectoryService,
    private readonly users: UsersService,
    private readonly userRows: UsersRepository,
  ) {}

  /**
   * The full picture an admin needs on one screen: every stanowisko MAGSpace
   * publishes, merged with what we have mapped.
   *
   * A MAGSpace outage degrades rather than fails — the saved rows are still
   * shown, with `magspaceOk: false` so the UI can say the list may be
   * incomplete. Failing the whole screen would be worse: an admin firefighting
   * an outage is exactly who needs to see the current mapping.
   */
  async listStanowiskoRoles(): Promise<StanowiskoRoleListDto> {
    const saved = await this.mappings.findAll();
    const savedByCode = new Map(saved.map((m) => [m.stanowiskoCode, m]));

    let live: { code: string; name: string }[] = [];
    let magspaceOk = false;
    if (this.magspace.isConfigured) {
      try {
        live = await this.magspace.listStanowiska();
        magspaceOk = true;
      } catch (err) {
        this.logger.warn({
          msg: 'could not load stanowiska from MAGSpace, showing saved rows only',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const items: StanowiskoRoleDto[] = live.map((s) => {
      const row = savedByCode.get(s.code);
      savedByCode.delete(s.code);
      return {
        code: s.code,
        // Live label wins — the stored one is a cache for outages.
        name: s.name,
        role: row?.role ?? null,
        // An unmapped stanowisko grants nothing, leadership included.
        lider: row?.lider ?? false,
        knownToMagspace: true,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });

    // Whatever is left is mapped here but not served by MAGSpace: either the
    // directory is down (every row lands here) or the position was retired
    // there, in which case the row grants access to nobody and should go.
    for (const row of savedByCode.values()) {
      items.push({
        code: row.stanowiskoCode,
        name: row.stanowiskoName,
        role: row.role,
        lider: row.lider,
        knownToMagspace: false,
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    items.sort((a, b) => a.code.localeCompare(b.code));
    const lastReconcileAt = await this.state.lastReconcileAt();
    return {
      items,
      magspaceOk,
      lastReconcileAt: lastReconcileAt?.toISOString() ?? null,
    };
  }

  /**
   * Points a stanowisko at a role (and, optionally, sets its leader flag).
   *
   * `lider` omitted = keep the stored flag (`false` for a new row), so a
   * client that sends only `{ role }` never wipes a leader mapping. The
   * RESULTING pair is then checked: re-pointing a leader row at a role outside
   * `LIDER_ROLES` without `lider: false` is a 422, not a silent loss of the
   * flag (docs/28 §3.3). Checked before MAGSpace is asked.
   *
   * The display name is taken from MAGSpace when it answers, so the stored
   * snapshot stays fresh; when it does not, an existing row keeps its name and
   * a brand-new row falls back to its code. Refusing to save during an outage
   * would be worse than a cosmetic label.
   */
  async setStanowiskoRole(
    code: string,
    role: AssignableRole,
    lider?: boolean,
  ): Promise<StanowiskoRoleDto> {
    const existing = await this.mappings.findByCode(code);
    const nextLider = lider ?? existing?.lider ?? false;
    assertLiderPair(role, nextLider);
    if (existing) {
      // Trimmed by the interceptor to the response's key-set → the audit row
      // shows role/lider as before → after. A new row has no "before".
      AuditContext.setBefore({
        code: existing.stanowiskoCode,
        name: existing.stanowiskoName,
        role: existing.role,
        lider: existing.lider,
        updatedAt: existing.updatedAt.toISOString(),
      });
    }

    let name: string | null = null;
    let knownToMagspace = false;
    if (this.magspace.isConfigured) {
      try {
        const live = await this.magspace.listStanowiska();
        const match = live.find((s) => s.code === code);
        name = match?.name ?? null;
        knownToMagspace = match !== undefined;
      } catch (err) {
        // Fall through to the stored / code fallback below.
        this.logger.warn({
          msg: 'could not confirm the stanowisko against MAGSpace, saving with the stored name',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    name ??= existing?.stanowiskoName ?? code;

    const row = await this.mappings.upsert(code, name, role, nextLider);
    return {
      code: row.stanowiskoCode,
      name: row.stanowiskoName,
      role: row.role,
      lider: row.lider,
      // Reported honestly: `false` here means we could not confirm the code
      // against MAGSpace — either it is unreachable or it does not serve that
      // position. Claiming `true` unconditionally would let the row look
      // healthy right after saving a typo.
      knownToMagspace,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Removes a mapping — "this stanowisko grants nothing". Holders keep their
   * accounts until the next sign-in or reconcile run, which is when the loss of
   * access actually takes effect.
   */
  async deleteStanowiskoRole(code: string): Promise<void> {
    const deleted = await this.mappings.deleteByCode(code);
    if (!deleted) {
      throw new NotFoundException(`Brak mapowania dla stanowiska "${code}"`);
    }
  }

  /**
   * «Nadaj dostęp» — the decision lives in `DirectoryService.grantAccess`,
   * next to the sign-in provisioning it must agree with; this only shapes the
   * answer for the wire.
   */
  async grantAccess(dto: GrantSsoAccessDto): Promise<SsoAccessGrantResultDto> {
    const { user, outcome } = await this.directory.grantAccess(
      dto.email,
      dto.role,
      // Optional on the wire (no Zod default, so `{ email, role }` stays a
      // valid body type); absent = not a leader.
      dto.lider ?? false,
    );
    // Resolved mapping: `liderUser` is the real leader mini when the account
    // keeps a planista → lider link (docs/29), same as `GET /users/:id`.
    return { user: await this.users.toDtoResolved(user), outcome };
  }

  /**
   * Recent sign-ins refused for want of a role, read straight from the audit
   * log. There is no requests table on purpose: a refusal is an event, and the
   * audit log already stores events with the right retention and access rules.
   *
   * One row per person (latest refusal wins), each tagged with whether that
   * person has an active account today — so the screen reads as a queue of
   * decisions still to make, not a log of button presses.
   */
  async listRecentDenials(): Promise<SsoAccessDenialDto[]> {
    const rows = await this.auditQuery.list({
      action: DENIAL_AUDIT_ACTION,
      limit: DENIAL_SCAN_WINDOW,
    });
    const latest = latestPerEmail(rows.slice(0, DENIAL_SCAN_WINDOW)).slice(
      0,
      DENIAL_PAGE_SIZE,
    );

    const addresses = latest.map((d) => d.email).filter((e) => e !== UNKNOWN_EMAIL);
    const accounts = await this.userRows.findActiveByEmails(addresses);
    const userIdByEmail = new Map(accounts.map((u) => [u.email.toLowerCase(), u.id]));

    return latest.map((d) => {
      const userId = userIdByEmail.get(d.email.toLowerCase()) ?? null;
      return { ...d, status: userId ? 'granted' : 'pending', userId };
    });
  }
}

/**
 * Collapses repeated refusals of one address into the newest. Relies on the
 * repository's `createdAt DESC` order: the first row seen per address is its
 * latest. Addresses compare case-insensitively.
 */
function latestPerEmail(rows: readonly AuditLogRow[]): DenialCore[] {
  const seen = new Set<string>();
  const out: DenialCore[] = [];
  for (const r of rows) {
    const email = r.targetKey ?? UNKNOWN_EMAIL;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      email,
      stanowiskoCode: readStanowiskoCode(r.metadata),
      at: r.createdAt.toISOString(),
    });
  }
  return out;
}

function readStanowiskoCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as { stanowiskoCode?: unknown }).stanowiskoCode;
  return typeof value === 'string' ? value : null;
}
