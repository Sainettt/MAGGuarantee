// Integrations schema barrel.
//
// Wire DTOs for `/api/v1/integrations/*` per docs/13-api-design.md and
// docs/16-jobs-and-integrations.md. One file per upstream:
//   ./vies.ts        — VIES VAT lookup
//   ./whitelist.ts   — Biała Lista MF
//   ./gps.ts         — GPS tracker (mock + future vendor)
//   ./bugbot.ts      — BugBot handoff (one-time sign-in URL)

export * from './vies';
export * from './whitelist';
export * from './gps';
export * from './bugbot';
