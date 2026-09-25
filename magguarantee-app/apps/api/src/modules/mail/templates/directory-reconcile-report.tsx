/**
 * Reconcile report for admins (docs/24 §A4).
 *
 * Sent in three situations, all of which an admin needs to see and none of
 * which fit a log line:
 *
 *   1. **Aborted** — the run wanted to disable more accounts than the safety
 *      valve allows, so it did nothing. That is almost always a contract or
 *      configuration fault (an empty roster, a rotated token), not 40 people
 *      resigning at once, and it needs a human immediately.
 *   2. **Report mode** — `DIRECTORY_RECONCILE_MODE=report`, the debugging
 *      setting: here is what I WOULD have done.
 *   3. **Enforce mode with something to report** — accounts disabled, roles
 *      changed, or a locally-managed staff account whose owner has left
 *      MAGSpace. A quiet run sends nothing at all.
 *
 * Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors, eyebrowStyle, fontFamily } from './_theme';
import { Block, MailLayout, Note, Paragraph } from './MailLayout';

/** One account the run disabled (or would disable, in report mode). */
export interface ReconcileDeprovisionRow {
  login: string;
  name: string | null;
  /** Why: terminated, gone from the roster, or stanowisko no longer mapped. */
  reasonLabel: string;
}

/**
 * One account whose stanowisko now maps to a different role or leader flag
 * (docs/28 §2) — either half may be the change, e.g. `planista → planista
 * (lider)` after PLANISTA → PLANISTA_LIDER.
 */
export interface ReconcileRoleChangeRow {
  login: string;
  name: string | null;
  fromRole: string;
  fromLider: boolean;
  toRole: string;
  toLider: boolean;
}

/** `planista (lider)` / `planista` — the leader flag is not a role of its own. */
export function roleWithLider(role: string, lider: boolean): string {
  return lider ? `${role} (lider)` : role;
}

/**
 * A locally-managed staff account whose owner is terminated in MAGSpace.
 * Advisory only — the reconcile never touches `local` rows, because that is the
 * break-glass path and disabling an admin automatically is how you lock
 * yourself out of your own system.
 */
export interface ReconcileLocalNoticeRow {
  login: string;
  name: string | null;
  role: string;
}

export interface DirectoryReconcileReportProps {
  adminName: string;
  /** Formatted run time (dd.MM.yyyy HH:mm). */
  runAtLabel: string;
  /** `enforce` = the changes below were applied; `report` = nothing was. */
  mode: 'enforce' | 'report';
  /** True when the safety valve cancelled the run. */
  aborted: boolean;
  /** Present when aborted: how many accounts it wanted to disable, out of how many. */
  abortDetail?: { wouldDisable: number; managedTotal: number } | null;
  deprovisioned: ReconcileDeprovisionRow[];
  roleChanges: ReconcileRoleChangeRow[];
  localNotices: ReconcileLocalNoticeRow[];
}

const rowStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  fontFamily,
  fontSize: 14,
  lineHeight: '20px',
  color: colors.ink,
};

function headingStyle(): React.CSSProperties {
  return { ...eyebrowStyle, color: colors.brand, margin: '4px 0 10px 0' };
}

function who(login: string, name: string | null): string {
  return name ? `${name} (${login})` : login;
}

export function DirectoryReconcileReportEmail({
  adminName,
  runAtLabel,
  mode,
  aborted,
  abortDetail,
  deprovisioned,
  roleChanges,
  localNotices,
}: DirectoryReconcileReportProps): React.ReactElement {
  const title = aborted
    ? 'Synchronizacja z MAGSpace przerwana'
    : mode === 'report'
      ? 'Synchronizacja z MAGSpace — podgląd zmian'
      : 'Synchronizacja z MAGSpace — raport';

  return (
    <MailLayout
      preview={`${title} — ${runAtLabel}`}
      overline="MAGSpace"
      title={title}
      badge={
        aborted
          ? { tone: 'danger', label: 'Przerwano' }
          : mode === 'report'
            ? { tone: 'neutral', label: 'Tryb podglądu' }
            : { tone: 'warning', label: 'Zastosowano' }
      }
    >
      <Paragraph>Witaj {adminName},</Paragraph>

      {aborted ? (
        <>
          <Paragraph>
            Synchronizacja z {runAtLabel} została <b>przerwana i nie wprowadziła
            żadnych zmian</b>. Chciała wyłączyć{' '}
            {abortDetail?.wouldDisable ?? 0} z {abortDetail?.managedTotal ?? 0}{' '}
            kont zarządzanych przez MAGSpace, co przekracza próg bezpieczeństwa.
          </Paragraph>
          <Paragraph>
            Najczęstsza przyczyna to nie zwolnienia, tylko problem po stronie
            integracji: pusta lub niepełna odpowiedź MAGSpace albo zmieniony
            token dostępu. Sprawdź stan MAGSpace w Diagnostyce, zanim
            zezwolisz na kolejny przebieg.
          </Paragraph>
        </>
      ) : (
        <Paragraph>
          Przebieg z {runAtLabel}.{' '}
          {mode === 'report'
            ? 'Tryb podglądu — poniższe zmiany NIE zostały wprowadzone.'
            : 'Poniższe zmiany zostały wprowadzone.'}
        </Paragraph>
      )}

      {deprovisioned.length > 0 && (
        <Block>
          <p style={headingStyle()}>
            {mode === 'report' ? 'Do wyłączenia' : 'Wyłączone konta'} (
            {deprovisioned.length})
          </p>
          {deprovisioned.map((r) => (
            <p key={r.login} style={rowStyle}>
              <span style={{ fontWeight: 'bold' }}>{who(r.login, r.name)}</span>
              {' — '}
              {r.reasonLabel}
            </p>
          ))}
        </Block>
      )}

      {roleChanges.length > 0 && (
        <Block>
          <p style={headingStyle()}>Zmiany ról ({roleChanges.length})</p>
          {roleChanges.map((r) => (
            <p key={r.login} style={rowStyle}>
              <span style={{ fontWeight: 'bold' }}>{who(r.login, r.name)}</span>
              {' — '}
              {roleWithLider(r.fromRole, r.fromLider)} →{' '}
              <b>{roleWithLider(r.toRole, r.toLider)}</b>
            </p>
          ))}
          <Note>
            Zmiana roli nie przenosi powiązań — jeżeli ktoś przestał być
            opiekunem, sprawdź jego przewoźników.
          </Note>
        </Block>
      )}

      {localNotices.length > 0 && (
        <Block>
          <p style={headingStyle()}>
            Konta lokalne wymagające uwagi ({localNotices.length})
          </p>
          {localNotices.map((r) => (
            <p key={r.login} style={rowStyle}>
              <span style={{ fontWeight: 'bold' }}>{who(r.login, r.name)}</span>
              {' — rola '}
              {r.role}
              {' — pracownik nieaktywny w MAGSpace'}
            </p>
          ))}
          <Note>
            Te konta są zarządzane lokalnie, więc synchronizacja ich nie rusza.
            Jeśli ta osoba faktycznie odeszła, wyłącz konto ręcznie.
          </Note>
        </Block>
      )}
    </MailLayout>
  );
}

export default DirectoryReconcileReportEmail;
