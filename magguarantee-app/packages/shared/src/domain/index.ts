// Domain logic — pure TypeScript helpers shared between API and web.
//
// Convention: one file per cohesive domain concern. Nothing in this folder
// imports from Nest, Next, Prisma, or any runtime that ties us to a single
// app — keep these functions trivially testable in isolation.

export * from './eu-calendar';
// ISO 8601 week helpers (km limits are per ISO week since 2026-10-29). The
// day-number core in `./civil-date` stays internal — not re-exported.
export * from './iso-week';
export * from './km-calc';
export * from './claim-settlement';
export * from './claim-submission-rules';
export * from './reklamacja-rules';
export * from './polish-calendar';
export * from './business-date';
export * from './auth-threshold';
export * from './maksim-confirmation';
export * from './guarantee-watchdog';
export * from './vehicle-status';
export * from './document-alerts';
