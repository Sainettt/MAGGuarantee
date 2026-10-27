// What <CarrierDocumentsTab> lets its viewer do — by PERMISSION, never by role
// or audience (docs/14 «Carrier „Dokumenty” tab» B.1 / B.4, docs/25 §3 B6).
//
// One component serves the opiekun / admin drill-down and the carrier's own
// `/carrier/dokumenty`. Opiekun and admin hold `carrier_documents.add`,
// `.delete` and `fleet.write` by role, so they get exactly the pre-B6 render;
// a carrier granted `.read` (+ maybe `.add`) gets the view-only / upload-only
// variant. `carrierDocumentsAccess.test.ts` pins both.

import { canAny, type Permission } from '@/lib/auth/permissions';

/** The three rights the tab reads — the component takes them from `useCan`. */
export interface CarrierDocumentsRights {
  /** `carrier_documents.add` — upload company files. */
  canAdd: boolean;
  /** `carrier_documents.delete` — delete company files. */
  canDelete: boolean;
  /** `fleet.write` — the fleet documents are managed in the vehicle / trailer / driver windows. */
  canManageFleet: boolean;
}

export interface CarrierDocumentsUi {
  /** Company-type Sheet footer: the upload controls, or the «your manager adds them» line. */
  companyFooter: 'upload' | 'byOpiekun';
  /** The hint above `FileUpload` (key under `opieka.documents`) — upload-only wording without `.delete`. */
  uploadHintKey: 'sheet.uploadHint' | 'sheet.uploadHintAddOnly';
  /** The «Usuń» buttons and their confirm dialog. */
  showDelete: boolean;
  /** Fleet-type Sheet footer: «Zarządzaj w oknie …» or «… uzupełnia Twój opiekun». */
  fleetFooter: 'manageElsewhere' | 'byOpiekun';
}

/** The rights of a viewer holding `permissions` (his EFFECTIVE list) — what `useCan` answers. */
export function carrierDocumentsRights(permissions: readonly Permission[]): CarrierDocumentsRights {
  return {
    canAdd: canAny(permissions, 'carrier_documents.add'),
    canDelete: canAny(permissions, 'carrier_documents.delete'),
    canManageFleet: canAny(permissions, 'fleet.write'),
  };
}

/** The tab's controls for these rights (B.4). */
export function carrierDocumentsUi({
  canAdd,
  canDelete,
  canManageFleet,
}: CarrierDocumentsRights): CarrierDocumentsUi {
  return {
    companyFooter: canAdd ? 'upload' : 'byOpiekun',
    uploadHintKey: canAdd && !canDelete ? 'sheet.uploadHintAddOnly' : 'sheet.uploadHint',
    showDelete: canDelete,
    fleetFooter: canManageFleet ? 'manageElsewhere' : 'byOpiekun',
  };
}
