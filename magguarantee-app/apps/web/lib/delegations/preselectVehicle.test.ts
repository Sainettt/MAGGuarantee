// UWAGI #3 — `?vehicleId=` preselect on /carrier/delegations/new. The page
// applies the result once (fleet loaded + draft hydrated); these cases pin the
// decision itself.

import { describe, expect, it } from 'vitest';

import { pickPreselectedVehicleId } from './preselectVehicle';

const FLEET = [{ id: 'veh-1' }, { id: 'veh-2' }, { id: 'veh-3' }];

describe('pickPreselectedVehicleId', () => {
  it('returns the id when it is in the fleet', () => {
    expect(pickPreselectedVehicleId('veh-2', FLEET)).toBe('veh-2');
  });

  it('ignores an id that is not in the fleet (inactive / foreign / stale)', () => {
    expect(pickPreselectedVehicleId('veh-999', FLEET)).toBeNull();
  });

  it('ignores a missing param', () => {
    expect(pickPreselectedVehicleId(null, FLEET)).toBeNull();
    expect(pickPreselectedVehicleId(undefined, FLEET)).toBeNull();
  });

  it('ignores an empty param (`?vehicleId=`)', () => {
    expect(pickPreselectedVehicleId('', FLEET)).toBeNull();
  });

  it('returns null against an empty fleet', () => {
    expect(pickPreselectedVehicleId('veh-1', [])).toBeNull();
  });

  it('matches exactly — no trimming, no case folding', () => {
    expect(pickPreselectedVehicleId(' veh-1', FLEET)).toBeNull();
    expect(pickPreselectedVehicleId('VEH-1', FLEET)).toBeNull();
  });

  it('uses the first value of a repeated key, like URLSearchParams.get()', () => {
    expect(pickPreselectedVehicleId(['veh-3', 'veh-1'], FLEET)).toBe('veh-3');
    expect(pickPreselectedVehicleId(['veh-999', 'veh-1'], FLEET)).toBeNull();
    expect(pickPreselectedVehicleId([], FLEET)).toBeNull();
  });
});
