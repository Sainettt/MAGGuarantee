import { describe, expect, it } from 'vitest';
import type { LookupUserDto, UserLiderMiniDto } from '@magguarantee/shared';

import {
  effectiveRole,
  liderIdCreateValue,
  liderIdPatchValue,
  liderSelectModel,
  liderStaleness,
  showsLiderField,
} from './liderSelect';

const SELF = '00000000-0000-4000-8000-000000000001';
const L1 = '00000000-0000-4000-8000-000000000011';
const L2 = '00000000-0000-4000-8000-000000000012';
const OLD = '00000000-0000-4000-8000-000000000013';

const lookup = (id: string, name: string | null, login = 'x'): LookupUserDto => ({
  id,
  name,
  login,
  lider: true,
});

const mini = (overrides: Partial<UserLiderMiniDto> = {}): UserLiderMiniDto => ({
  id: OLD,
  login: 'mnowicki',
  name: 'Marek Nowicki',
  active: true,
  lider: true,
  ...overrides,
});

describe('showsLiderField (§17.7 visibility)', () => {
  it('uses the EFFECTIVE role — the override wins', () => {
    expect(effectiveRole('weryfikator', 'planista')).toBe('planista');
    expect(effectiveRole('planista', '')).toBe('planista');
    expect(showsLiderField('weryfikator', 'planista')).toBe(true);
    expect(showsLiderField('planista', 'opiekun')).toBe(false);
    expect(showsLiderField('opiekun', '')).toBe(false);
  });
});

describe('liderSelectModel', () => {
  it('lists the active leaders by name, without the edited user (U9)', () => {
    const m = liderSelectModel({
      liders: [lookup(L2, 'Zofia'), lookup(SELF, 'Ja'), lookup(L1, null, 'adam')],
      selfId: SELF,
      stored: null,
    });
    expect(m.options.map((o) => o.id)).toEqual([L1, L2]);
    expect(m.options[0]?.name).toBe('adam');
    expect(m.hasActiveLiders).toBe(true);
  });

  it.each([
    [{ lider: false }, 'notLider'],
    [{ active: false }, 'inactive'],
    [{ active: false, lider: false }, 'inactive'],
  ] as const)('keeps a stale stored leader %j as a marked option (U10)', (patch, stale) => {
    const m = liderSelectModel({
      liders: [lookup(L1, 'Adam')],
      selfId: SELF,
      stored: mini(patch),
    });
    expect(m.options.find((o) => o.id === OLD)?.stale).toBe(stale);
  });

  it('a stored leader present in the picker is not duplicated', () => {
    const m = liderSelectModel({
      liders: [lookup(OLD, 'Marek Nowicki')],
      stored: mini(),
    });
    expect(m.options).toHaveLength(1);
    expect(m.options[0]?.stale).toBeNull();
  });

  it('no active leaders → hasActiveLiders false (the stale one alone does not count)', () => {
    expect(liderSelectModel({ liders: [], stored: null }).hasActiveLiders).toBe(false);
    const m = liderSelectModel({ liders: [], stored: mini({ lider: false }) });
    expect(m.hasActiveLiders).toBe(false);
    expect(m.options).toHaveLength(1);
  });

  it('liderStaleness', () => {
    expect(liderStaleness(null)).toBeNull();
    expect(liderStaleness(mini())).toBeNull();
  });
});

describe('liderIdPatchValue (§17.7 PATCH)', () => {
  it('sends only a change', () => {
    expect(liderIdPatchValue({ formValue: L1, storedValue: L1, isPlanista: true })).toBeUndefined();
    expect(liderIdPatchValue({ formValue: L2, storedValue: L1, isPlanista: true })).toBe(L2);
    expect(liderIdPatchValue({ formValue: '', storedValue: L1, isPlanista: true })).toBeNull();
    expect(liderIdPatchValue({ formValue: '', storedValue: null, isPlanista: true })).toBeUndefined();
  });

  it('never next to a non-planista effective role (the api clears it itself)', () => {
    expect(liderIdPatchValue({ formValue: L1, storedValue: null, isPlanista: false })).toBeUndefined();
    expect(liderIdPatchValue({ formValue: '', storedValue: L1, isPlanista: false })).toBeUndefined();
  });
});

describe('liderIdCreateValue', () => {
  it('only a chosen leader on a planista', () => {
    expect(liderIdCreateValue({ formValue: L1, isPlanista: true })).toBe(L1);
    expect(liderIdCreateValue({ formValue: '', isPlanista: true })).toBeUndefined();
    expect(liderIdCreateValue({ formValue: L1, isPlanista: false })).toBeUndefined();
  });
});
