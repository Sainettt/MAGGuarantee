// Admin-facing side of the SSO feature: the stanowisko → role table and the
// list of sign-ins it has refused (docs/24 §A2/§A5).

import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  AssignableRole,
  SsoAccessDenialDto,
  StanowiskoRoleDto,
  StanowiskoRoleListDto,
} from '@magguarantee/shared';

import { AuditQueryRepository } from '../audit/audit-query.repository';
import { DirectoryState } from './directory-state';
import { MagspaceClient } from './magspace.client';
import { StanowiskoRoleMappingRepository } from './stanowisko-role-mapping.repository';

/** How many refused sign-ins the admin screen shows. */
const DENIAL_PAGE_SIZE = 20;

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    private readonly mappings: StanowiskoRoleMappingRepository,
    private readonly magspace: MagspaceClient,
    private readonly state: DirectoryState,
    private readonly auditQuery: AuditQueryRepository,
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
   * Points a stanowisko at a role.
   *
   * The display name is taken from MAGSpace when it answers, so the stored
   * snapshot stays fresh; when it does not, an existing row keeps its name and
   * a brand-new row falls back to its code. Refusing to save during an outage
   * would be worse than a cosmetic label.
   */
  async setStanowiskoRole(code: string, role: AssignableRole): Promise<StanowiskoRoleDto> {
    let name: string | null = null;
    let knownToMagspace = false;
    if (this.magspace.isConfigured) {
      try {
        const live = await this.magspace.listStanowiska();
        const match = live.find((s) => s.code === code);
        name = match?.name ?? null;
        knownToMagspace = match !== undefined;
      } catch {
        // Fall through to the stored / code fallback below.
      }
    }
    if (name === null) {
      const existing = await this.mappings.findByCode(code);
      name = existing?.stanowiskoName ?? code;
    }

    const row = await this.mappings.upsert(code, name, role);
    return {
      code: row.stanowiskoCode,
      name: row.stanowiskoName,
      role: row.role,
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
   * Recent sign-ins refused for want of a role, read straight from the audit
   * log. There is no requests table on purpose: a refusal is an event, and the
   * audit log already stores events with the right retention and access rules.
   */
  async listRecentDenials(): Promise<SsoAccessDenialDto[]> {
    const rows = await this.auditQuery.list({
      action: 'denyDirectoryAccess',
      limit: DENIAL_PAGE_SIZE,
    });
    return rows.slice(0, DENIAL_PAGE_SIZE).map((r) => ({
      email: r.targetKey ?? '—',
      stanowiskoCode: readStanowiskoCode(r.metadata),
      at: r.createdAt.toISOString(),
    }));
  }
}

function readStanowiskoCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as { stanowiskoCode?: unknown }).stanowiskoCode;
  return typeof value === 'string' ? value : null;
}
