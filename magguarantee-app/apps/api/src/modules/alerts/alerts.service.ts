import { ForbiddenException, Injectable } from '@nestjs/common';

import {
  DOCUMENT_ALERT_SEVERITY_ORDER,
  DOCUMENT_ALERT_THRESHOLDS,
  classifyDocumentAlert,
  daysToExpiry,
  startOfBusinessTodayUtc,
  type AlertCategory,
  type AlertDocType,
  type AlertEntityKind,
  type AlertGroup,
  type AlertItem,
  type AlertSeverity,
  type AlertTotals,
  type AlertsResponse,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  AlertsRepository,
  type AlertScope,
  type AlertSourceRow,
} from './alerts.repository';

/**
 * One declarative entry per date-bearing document. Adding a new alert type =
 * add a repo query + one entry here; the engine (fetch → classify → group)
 * never changes. `order` fixes the within-category display order.
 */
interface AlertProvider {
  docType: AlertDocType;
  category: AlertCategory;
  entityKind: AlertEntityKind;
  order: number;
  fetch: (
    repo: AlertsRepository,
    cutoff: Date,
    scope: AlertScope,
  ) => Promise<AlertSourceRow[]>;
}

const ALERT_PROVIDERS: readonly AlertProvider[] = [
  {
    docType: 'carrier_insurance',
    category: 'carrier',
    entityKind: 'carrier',
    order: 0,
    fetch: (repo, cutoff, scope) => repo.carrierInsurance(cutoff, scope),
  },
  {
    docType: 'carrier_license',
    category: 'carrier',
    entityKind: 'carrier',
    order: 1,
    fetch: (repo, cutoff, scope) => repo.carrierLicense(cutoff, scope),
  },
  {
    docType: 'vehicle_fuel_card',
    category: 'vehicle',
    entityKind: 'vehicle',
    order: 0,
    fetch: (repo, cutoff, scope) => repo.vehicleFuelCard(cutoff, scope),
  },
  {
    docType: 'driver_license',
    category: 'driver',
    entityKind: 'driver',
    order: 0,
    fetch: (repo, cutoff, scope) => repo.driverLicense(cutoff, scope),
  },
];

/** Category display order for the grouped response. */
const CATEGORY_ORDER: readonly AlertCategory[] = ['carrier', 'vehicle', 'driver'];

/**
 * Document-expiry alerts (in-app only, no email). Computed LIVE per request
 * against today (Europe/Warsaw) — no cron, no persisted state.
 *
 * Role gating (mirrors the controller's `@Roles('admin','opiekun')`):
 *   - admin   → every active entity's documents (no scope);
 *   - opiekun → only carriers they supervise (`Carrier.opiekunId === user.sub`);
 *   - anyone else → 403.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly repo: AlertsRepository) {}

  async list(user: AuthUser, now: Date = new Date()): Promise<AlertsResponse> {
    const scope = this._scopeFor(user);

    // Outer window: today (Warsaw, UTC-midnight anchor) + N days. Documents
    // due on/before this — or already expired — are candidates.
    const cutoff = new Date(
      startOfBusinessTodayUtc(now).getTime() +
        DOCUMENT_ALERT_THRESHOLDS.upcoming * MS_PER_DAY,
    );

    // Fetch every provider concurrently, then classify.
    const perProvider = await Promise.all(
      ALERT_PROVIDERS.map(async (p) => {
        const rows = await p.fetch(this.repo, cutoff, scope);
        return rows
          .map((row) => this._toItem(p, row, now))
          .filter((it): it is AlertItem => it !== null);
      }),
    );
    const items = perProvider.flat();

    const groups = this._group(items);
    const totals = this._totals(items);
    return {
      meta: { warnDays: DOCUMENT_ALERT_THRESHOLDS.upcoming, totals },
      groups,
    };
  }

  // ── internals ────────────────────────────────────────────

  private _scopeFor(user: AuthUser): AlertScope {
    if (user.role === 'admin') return {};
    if (user.role === 'opiekun') return { opiekunId: user.sub };
    throw new ForbiddenException(
      'Brak uprawnień do alertów o dokumentach',
    );
  }

  /**
   * Maps a source row + provider descriptor into an alert item, or `null` when
   * the document is outside the surfaced window (shouldn't happen given the
   * repo's `lte: cutoff` filter, but the classifier is the single authority on
   * "is this an alert" so we honour it).
   */
  private _toItem(
    provider: AlertProvider,
    row: AlertSourceRow,
    now: Date,
  ): AlertItem | null {
    const days = daysToExpiry(row.expiry, now);
    const severity = classifyDocumentAlert(days);
    if (!severity) return null;
    return {
      id: `${provider.docType}:${row.entityId}`,
      docType: provider.docType,
      category: provider.category,
      severity,
      daysToExpiry: days,
      expiryDate: isoDate(row.expiry),
      entityLabel: row.entityLabel,
      entityKind: provider.entityKind,
      entityId: row.entityId,
      carrierId: row.carrierId,
      carrierName: row.carrierName,
    };
  }

  private _group(items: AlertItem[]): AlertGroup[] {
    return CATEGORY_ORDER.map((category) => {
      const groupItems = items
        .filter((it) => it.category === category)
        .sort(compareItems);
      return { category, total: groupItems.length, items: groupItems };
    }).filter((g) => g.total > 0);
  }

  private _totals(items: AlertItem[]): AlertTotals {
    const totals: AlertTotals = {
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
      total: items.length,
    };
    for (const it of items) totals[it.severity] += 1;
    return totals;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Sort key: most-urgent severity first, then soonest expiry, then label. */
function compareItems(a: AlertItem, b: AlertItem): number {
  const sev =
    DOCUMENT_ALERT_SEVERITY_ORDER[a.severity as AlertSeverity] -
    DOCUMENT_ALERT_SEVERITY_ORDER[b.severity as AlertSeverity];
  if (sev !== 0) return sev;
  if (a.daysToExpiry !== b.daysToExpiry) return a.daysToExpiry - b.daysToExpiry;
  return a.entityLabel.localeCompare(b.entityLabel);
}

/** Date-only ISO (`YYYY-MM-DD`) from a `@db.Date` UTC-midnight value. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
