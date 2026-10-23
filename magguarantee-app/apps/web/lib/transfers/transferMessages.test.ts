// The §17 screens build several i18n keys dynamically (status → label, lock
// reason → sentence, history source → badge, error kind → message). A typo or
// a missing key would only show up at runtime as a raw key, so every key the
// transfer UI can produce is checked here against BOTH bundles.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PlannerAssignmentSourceSchema,
  PlannerTransferStatusSchema,
} from '@magguarantee/shared';

import { MINE_FILTERS, mineEmptyKind, mineFilterLabelKey } from './transferListFilters';
import type { BlockedNoticeKey, PlannerLockReason } from './transferUi';

type Messages = { [key: string]: string | Messages };

function load(locale: 'pl' | 'en'): Messages {
  const file = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as Messages;
}

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const LOCK_REASONS: readonly PlannerLockReason[] = ['locked', 'lockedAdmin', 'lockedInactive'];
const BLOCKED_NOTICES: readonly BlockedNoticeKey[] = [
  'blockedTarget',
  'blockedRequester',
  'blockedRequesterAdmin',
];

const KEYS: readonly string[] = [
  ...PlannerTransferStatusSchema.options.map((s) => `transfers.status.${s}`),
  ...PlannerAssignmentSourceSchema.options.map((s) => `transfers.history.source.${s}`),
  ...LOCK_REASONS.map((r) => `transfers.form.${r}`),
  ...BLOCKED_NOTICES.map((k) => `transfers.card.${k}`),
  // «Moje wnioski» (§17.5.8): tab, filter options, empty states.
  'transfers.tabs.mine',
  ...MINE_FILTERS.map((f) => `transfers.${mineFilterLabelKey(f)}`),
  ...MINE_FILTERS.map((f) => `transfers.empty.${mineEmptyKind(f)}.title`),
  'transfers.empty.pendingAuthor.messageOpiekun',
  // Admin files a request (E2 / §17.3, 2026-10-23).
  'transfers.request.button',
  'transfers.request.info',
  'transfers.request.infoAdmin',
  // Request dialog footer slot (PlannerTransferRequestDialog INLINE_ERROR_KEY).
  'transfers.request.errors.alreadyPending',
  'transfers.request.errors.sameOrInvalidTarget',
  'transfers.request.errors.vehicleInactive',
  'transfers.request.errors.notAllowed',
  'transfers.request.errors.generic',
  // Decision dialogs (DECISION_ERROR_KEY).
  'transfers.decisionErrors.stale',
  'transfers.decisionErrors.targetInactive',
  'transfers.decisionErrors.vehicleInactive',
  'transfers.decisionErrors.forbidden',
  'transfers.decisionErrors.generic',
  // Cancel.
  'transfers.cancel.errors.notPending',
  'transfers.cancel.errors.generic',
  // Web-agent additions (docs/14 §17.15).
  'transfers.card.cancelledBy',
  'transfers.history.forbidden',
  // Nav + shells.
  'nav.transfers',
  'nav.transfersBadge',
  'planista.nav.ariaLabel',
  'planista.nav.fleet',
  'planista.nav.myTransfers',
  'planista.nav.approvals',
  'planista.nav.approvalsBadge',
  'myKm.tab',
  // Delegation modal + UserSheet.
  'team.planistaNow',
  'users.fields.liderId',
  'users.fields.liderIdHint',
  'users.fields.liderIdNone',
  'users.fields.liderIdNoOptions',
  'users.fields.liderIdStaleNotLider',
  'users.fields.liderIdStaleInactive',
  'users.fields.liderIdStaleHint',
  'users.errors.liderIdInvalid',
];

describe.each(['pl', 'en'] as const)('transfer UI keys exist in %s.json', (locale) => {
  const messages = load(locale);

  it('every dynamically built key resolves to a string', () => {
    expect(KEYS.filter((k) => typeof lookup(messages, k) !== 'string')).toEqual([]);
  });

  it('the retired «E-mail lidera (CC)» keys are gone (docs/29 R8)', () => {
    expect(lookup(messages, 'users.fields.liderEmail')).toBeUndefined();
    expect(lookup(messages, 'users.fields.liderEmailHint')).toBeUndefined();
  });

  it('the role-bound button key is gone — `request.button` serves opiekun + admin', () => {
    expect(lookup(messages, 'transfers.request.buttonOpiekun')).toBeUndefined();
  });
});
