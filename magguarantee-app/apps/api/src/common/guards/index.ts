// Public surface of the guards module — feature controllers import from here.

export { CarrierOwnershipGuard } from './carrier-ownership.guard';
export { OpiekunOwnershipGuard } from './opiekun-ownership.guard';
export { CarrierOwns, OpiekunOwns } from './ownership.decorators';
export {
  CARRIER_OWNERSHIP_KEY,
  OPIEKUN_OWNERSHIP_KEY,
  type OwnershipMeta,
  type OwnershipSource,
} from './ownership.constants';
