// Domain enum re-exports.
//
// Phase 1 ships only `Role` (the auth slice). Additional enums
// (ClaimStatus, DelegationStatus, VehicleType, CertificateL, EuroNorm) join
// here in Phase 2 alongside their models.

export { Role } from './generated';
