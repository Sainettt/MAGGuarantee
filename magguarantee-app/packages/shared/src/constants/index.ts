// Constants barrel.
//
// Domain-level lookups that are NOT Zod schemas — countries, fixed lists,
// numeric thresholds. Schemas stay in `../schemas/`; this folder is for the
// raw values both api and web consume.

export * from './eu-vat-countries';
