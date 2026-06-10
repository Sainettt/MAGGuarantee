// Domain enum re-exports.
//
// Phase 1 shipped only `Role` (auth slice). Phase 2 adds the rest of the
// domain enums alongside the Carrier/Vehicle/Claim/Delegation/Trailer models.
// See docs/12-database-schema.md.

export {
  CarrierAttachmentCategory,
  ClaimStatus,
  DelegationStatus,
  DriverAttachmentCategory,
  EuroNorm,
  Role,
  VehicleAttachmentCategory,
  VehicleRouteStatus,
  VehicleStatusSource,
  VehicleType,
} from './generated';
