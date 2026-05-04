/**
 * Reflector metadata keys for the ownership guards.
 *
 * Kept side-by-side so the guards in this folder share a single source of
 * truth and feature modules importing the decorators don't need to peek at
 * implementation files.
 */
export const OPIEKUN_OWNERSHIP_KEY = 'opiekunOwnership';
export const CARRIER_OWNERSHIP_KEY = 'carrierOwnership';

/**
 * Where on the incoming request to find the identifier of the resource
 * being accessed.
 *
 * Examples:
 *   `{ source: 'param', name: 'id', as: 'carrierId' }`
 *     → req.params.id is the carrier UUID
 *   `{ source: 'param', name: 'id', as: 'vehicleId' }`
 *     → req.params.id is the vehicle UUID; CarrierOwnershipGuard loads the
 *       vehicle and checks `vehicle.carrierId`
 *   `{ source: 'body', name: 'carrierId', as: 'carrierId' }`
 *     → POST body's `carrierId` field
 */
export type OwnershipSource = 'param' | 'body' | 'query';

export interface OwnershipMeta {
  source: OwnershipSource;
  /** Name of the field on req.params / req.body / req.query. */
  name: string;
  /**
   * The semantic kind of identifier — what entity it points at. Determines
   * which Prisma model the guard will look up.
   */
  as:
    | 'carrierId'
    | 'vehicleId'
    | 'driverId'
    | 'trailerId'
    | 'claimId'
    | 'claimNrZgl'
    | 'delegationId';
}
