// Form schemas of the transfer dialogs (docs/14 §17.3, §17.5.5). The limits
// come from the shared wire schemas (`PLANNER_TRANSFER_REASON_MIN/MAX`, U3) so
// the form and the api cannot drift; only the messages are the form's own
// (localised, passed in by the component).
//
// Form-side schemas rather than the shared `.strict()` wire objects: the form
// holds `''` for "nothing selected yet", and the request dialog's second entry
// (docs/14 §17.3) adds a `vehicleId` field that is a path param, not a body key.

import { z } from 'zod';
import {
  PLANNER_TRANSFER_REASON_MAX,
  PLANNER_TRANSFER_REASON_MIN,
} from '@magguarantee/shared';

export { PLANNER_TRANSFER_REASON_MAX, PLANNER_TRANSFER_REASON_MIN };

export interface ReasonMessages {
  reasonRequired: string;
  reasonTooLong: string;
}

/** Required reason: 3..500 characters after trimming (U3). */
export function reasonSchema(msgs: ReasonMessages) {
  return z.string().superRefine((value, ctx) => {
    const length = value.trim().length;
    if (length < PLANNER_TRANSFER_REASON_MIN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.reasonRequired });
    } else if (length > PLANNER_TRANSFER_REASON_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.reasonTooLong });
    }
  });
}

export interface RequestFormMessages extends ReasonMessages {
  vehicleRequired: string;
  targetRequired: string;
}

/**
 * «Wniosek o zmianę planisty». `pickVehicle` = the second entry (the
 * planista's «Moje wnioski» CTA), where the vehicle is chosen in the dialog.
 */
export function requestFormSchema(msgs: RequestFormMessages, pickVehicle: boolean) {
  return z.object({
    vehicleId: pickVehicle
      ? z.string().min(1, msgs.vehicleRequired)
      : z.string(),
    toPlannerId: z.string().min(1, msgs.targetRequired),
    reason: reasonSchema(msgs),
  });
}
export type RequestFormValues = z.infer<ReturnType<typeof requestFormSchema>>;

/** «Odrzuć wniosek» — the rejection reason is required (U3). */
export function rejectFormSchema(msgs: ReasonMessages) {
  return z.object({ reason: reasonSchema(msgs) });
}
export type RejectFormValues = z.infer<ReturnType<typeof rejectFormSchema>>;

/** «Zatwierdź przekazanie» — the comment is optional (U3), ≤ 500 characters. */
export function approveFormSchema(msgs: { commentTooLong: string }) {
  return z.object({
    comment: z.string().max(PLANNER_TRANSFER_REASON_MAX, msgs.commentTooLong),
  });
}
export type ApproveFormValues = z.infer<ReturnType<typeof approveFormSchema>>;
