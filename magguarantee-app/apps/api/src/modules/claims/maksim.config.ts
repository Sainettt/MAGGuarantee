/**
 * Phase 4.2 — hardcoded recipient for kwota-maksima authorization requests.
 * TODO(Phase 9): move to AppConfig table so admin can change it without
 * redeploying. Until then, this is a typed constant — do NOT read from env
 * (env-based string magic is the antipattern we're avoiding here).
 */
export const MAKSIM_EMAIL = 'maksim.siankevich@magtrans.eu';
