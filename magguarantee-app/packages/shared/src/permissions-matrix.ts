// The docs/03 «Каталог прав (генерируется)» table, rendered from the catalog
// (docs/25 §3 B1, risk R5 — the doc cannot drift from the code again).
//
// NOT exported from the package barrel: the descriptions are documentation,
// not runtime data, and must not ride along into the web / edge bundles.
// Consumers: `scripts/print-permission-matrix.ts` (`npm run authz:matrix`) and
// `tests/permissions.test.ts`, which asserts that the block between
// `<!-- authz:matrix:start -->` and `<!-- authz:matrix:end -->` in
// docs/03-roles.md equals `renderPermissionMatrix()`.
//
// Changing a description or an assignment? Regenerate and paste:
//   npm run -s authz:matrix -w @magguarantee/shared

import { LIDER_PERMISSIONS, PERMISSIONS, permissionsFor, type Permission } from './permissions';
import type { Role } from './schemas/auth';
import { RoleSchema } from './schemas/common';

/** «Покрывает» column — routes (no `api/v1` prefix) and service checks. */
export const PERMISSION_DESCRIPTIONS: Readonly<Record<Permission, string>> = {
  'claims.read':
    '`GET /claims`, `GET /claims/:nrZgl` (scope: przewoznik — свои). opiekun не видит wnioski ни в каком виде (решение 2026-10-22)',
  'claims.submit':
    '`POST /claims`, `POST /claims/preview`, `POST /claims/:nrZgl/reklamacja`; вместе с `claims.verify` — `POST /claims/:nrZgl/preview`',
  'claims.verify':
    '`PATCH /claims/:nrZgl`, `PATCH /claims/:nrZgl/verification`, `POST /claims/:nrZgl/recalc-limits` (+ `GET …/preview`), скриншот Maksima (`POST /claims/:nrZgl/authorization-confirmation`, download); вместе с `claims.submit` — `POST /claims/:nrZgl/preview`',
  'claims.verify_pending_authorization':
    'сервис: повторная верификация в `OCZEKUJE_NA_AUTORYZACJE` (иначе 422 `CLAIM_VERIFY_ADMIN_ONLY`)',
  'dashboard.read': '`GET /diagnostics/dashboard`',
  'carriers.read': '`GET /carriers`, `GET /carriers/:id`',
  'carriers.write':
    '`POST /carriers`, `PATCH /carriers/:id`, `POST /carriers/:id/{deactivate,reactivate,reset-password}`',
  'carriers.delete': '`DELETE /carriers/:id`, `DELETE /carriers/:id/hard`',
  'carrier_documents.read':
    '`GET /carriers/:id/attachments`, `GET …/:attachmentId/download`, `GET /carriers/:id/documents/overview`. Перевозчику — только точечно (B6)',
  'carrier_documents.add':
    '`POST /carriers/:id/attachments`. Перевозчику — только точечно (B6)',
  'carrier_documents.delete': '`DELETE /carriers/:id/attachments/:attachmentId`',
  'vehicles.read': '`GET /vehicles`, `GET /vehicles/:id`, вложения (список, download)',
  'vehicles.rates.read':
    'сервис: четыре ставки в карточке авто и в блоке «Stawki» модалки выезда (скрыты от dyspozytor; eksport и weryfikator видят их только в модалке выезда)',
  'vehicles.fuel_card.read': 'сервис: номер и PIN топливной карты в карточке авто',
  'vehicles.planner_transfer.request':
    '`POST /vehicles/:id/planner-transfers`, `POST /planner-transfers/:id/cancel`; вместе с `.decide` — `GET /planner-transfers`, `GET /lookups/planisci/transfer-targets`. Сервис: planista — только текущий планиста машины, cancel — только автор',
  'vehicles.planner_transfer.decide':
    '`POST /planner-transfers/:id/{approve,reject}`; вместе с `.request` — `GET /planner-transfers`, `GET /lookups/planisci/transfer-targets`. Сервис: лидер **этого** `fromPlanner`, не автор и не получатель',
  'vehicles.planner_history.read':
    '`GET /vehicles/:id/planner-history` (сервис: opiekun — свой перевозчик, planista — текущий планиста или его лидер)',
  'drivers.read': '`GET /drivers`, `GET /drivers/:id`, вложения (список, download)',
  'trailers.read': '`GET /trailers`, `GET /trailers/:id`, вложения (список, download)',
  'fleet.write':
    'создание, правка, деактивация / реактивация и soft-delete vehicles, drivers, trailers; удаление их вложений',
  'fleet.hard_delete': '`DELETE /drivers/:id/hard`, `DELETE /trailers/:id/hard` (у vehicles hard-delete выведен из API)',
  'gps.read':
    '`GET /integrations/gps/positions`, `GET /integrations/gps/positions/:vehicleId`, `GET /integrations/gps/trips/:vehicleId`',
  'gps.refresh': '`POST /integrations/gps/refresh`',
  'delegations.read': '`GET /delegations`, `GET /delegations/:id`',
  'delegations.create': '`POST /delegations`, `GET /delegations/eligibility`',
  'delegations.cancel': '`POST /delegations/:id/cancel` (свой / любой активный — scope)',
  'delegations.mark_ready': '`POST /delegations/:id/ready`',
  'delegations.transit': '`POST /delegations/:id/in-transit`, `POST /delegations/:id/returned`',
  'km.read': '`GET /vehicles/km-report`, `GET /vehicles/:id/daily-km`',
  'km.verify': '`GET /vehicles/km-board`, `PUT /vehicles/:id/daily-km`, `DELETE /vehicles/:id/daily-km`',
  'panel.opiekun':
    '`GET /fleet/opiekun`, `GET /opiekun/carriers`, `GET /alerts`, `GET /guarantee-compliance`, `GET /guarantee-episodes`',
  'panel.planista': '`GET /fleet/planista`',
  'panel.dyspozytor': '`GET /fleet/dyspozytor`',
  'panel.carrier': '`GET /fleet/my`, `GET /guarantee-compliance/me`, `GET /guarantee-episodes/me`',
  'lookups.staff': '`GET /lookups/{dyspozytor,opiekuni,planisci,teams}`',
  'lookups.carriers': '`GET /lookups/carriers`',
  'integrations.external':
    '`POST /integrations/vies/check`, `POST /integrations/whitelist/{check,search}` (info-car удалён 2026-10-22)',
  'bugbot.submit_idea':
    'сервис: `GET /integrations/bugbot/handoff?kind=idea`. Сам эндпоинт — любой залогиненный (`kind=bug` открыт всем)',
  'users.manage': '`/users*`, `GET /lookups/users`, `GET /lookups/planisci/liders`',
  'sso.manage': '`/sso/*`',
  'teams.manage': '`/teams*`',
  'trailer_types.manage':
    'запись `/trailer-types*` (create, patch, deactivate, hard); `GET /trailer-types` — любой залогиненный',
  'limits.manage': '`GET /limits`, `PUT /limits/:yearMonth`, `POST /limits/bulk`',
  'audit.read': '`GET /audit`',
  'diagnostics.manage': '`GET /diagnostics/{db,mails,claims}`, `POST /diagnostics/mails/:jobId/resend`',
};

const GRANTED = '✅';
const LIDER_ROW_LABEL = '↳ + lider';

/**
 * The catalog as a GitHub-flavoured markdown table: one row per permission ×
 * the eight roles (by role, no leader flag) + «Покрывает». Under a permission
 * that some leader variant adds, a `↳ + lider` sub-row marks those roles —
 * and only there (docs/28 §5). Ends without a trailing newline.
 */
export function renderPermissionMatrix(): string {
  const roles: readonly Role[] = RoleSchema.options;
  const header = ['Permission', ...roles, 'Покрывает'];
  const align = ['---', ...roles.map(() => ':-:'), '---'];
  const rows: string[][] = [header, align];

  for (const permission of PERMISSIONS) {
    rows.push([
      `\`${permission}\``,
      ...roles.map((role) => (permissionsFor(role, false).includes(permission) ? GRANTED : '')),
      PERMISSION_DESCRIPTIONS[permission],
    ]);
    const viaLider = roles.filter((role) => addedByLider(role, permission));
    if (viaLider.length > 0) {
      rows.push([
        LIDER_ROW_LABEL,
        ...roles.map((role) => (viaLider.includes(role) ? GRANTED : '')),
        viaLider.map((role) => `\`LIDER_PERMISSIONS.${role}\``).join(', '),
      ]);
    }
  }

  return rows.map((cells) => `| ${cells.map(escapeCell).join(' | ')} |`).join('\n');
}

/** The leader flag grants `permission` to `role` and the role alone does not. */
function addedByLider(role: Role, permission: Permission): boolean {
  if (!Object.prototype.hasOwnProperty.call(LIDER_PERMISSIONS, role)) return false;
  return (
    permissionsFor(role, true).includes(permission) &&
    !permissionsFor(role, false).includes(permission)
  );
}

/** A literal `|` would split the cell — GFM needs it escaped even inside code spans. */
function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}
