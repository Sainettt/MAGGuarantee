// info-car.pl inspection link builder.
//
// `GET /api/v1/integrations/inspection?vin=...` returns a deep-link URL into
// the public info-car.pl portal — no API call is made. This is a parity
// helper with the legacy `inspectionCheckLink` GAS function.
//
// The DTO file exists for symmetry with the other integrations even though
// the surface is tiny.

import { z } from 'zod';

/** VIN: 17 alphanumeric chars per ISO 3779 (excludes I, O, Q). */
export const VinSchema = z
  .string()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, 'VIN must be 17 alphanumeric chars (no I, O, Q)');
export type Vin = z.infer<typeof VinSchema>;

export const InspectionQuerySchema = z
  .object({
    vin: VinSchema,
  })
  .strict();
export type InspectionQuery = z.infer<typeof InspectionQuerySchema>;

export const InspectionResponseSchema = z.object({
  url: z.string().url(),
});
export type InspectionResponse = z.infer<typeof InspectionResponseSchema>;
