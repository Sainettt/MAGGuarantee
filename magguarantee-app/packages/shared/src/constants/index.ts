// Constants barrel.
//
// Domain-level lookups that are NOT Zod schemas — countries, fixed lists,
// numeric thresholds. Schemas stay in `../schemas/`; this folder is for the
// raw values both api and web consume.

export * from './eu-vat-countries';
export * from './eu-postal-codes';
// Soft-UI-hint rulesets (web masked inputs only) — NEVER wired into any Zod
// schema, unlike eu-postal-codes. See docs/14 §6.1.2 / §6.1.6.
export * from './eu-phone-rules';
export * from './eu-id-document-rules';
