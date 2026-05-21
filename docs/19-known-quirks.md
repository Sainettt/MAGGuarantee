# 19. Known quirks — load-bearing reference

> This is a load-bearing reference for non-obvious quirks of the legacy MagTrans GAS app and the business rules that don't fit cleanly into schema or API design docs. Read it BEFORE implementing anything in claims-flow / vehicle-CRUD / delegations-flow / authorization-flow. Each section ends with a "what NOT to do" — those are the foot-guns. If you find a NEW non-obvious quirk while implementing, add it here.

> Markers:
> - ⚠️ AMBIGUOUS — confirm with stakeholder before implementing.
> - 💡 — backlog / future-cleanup hint.
> - **Source of truth:** `apps/api/src/modules/*` + `packages/database/prisma/schema.prisma` + `packages/shared/src/schemas/*`. Legacy `Code.gs` / `index.html` are functional reference only.

---

## 1. <a id="umowa-vs-porozumienie"></a>`Vehicle.umowa` vs `Vehicle.porozumienie` ⚠️ AMBIGUOUS

> **Update 2026-05:** the `contract` (Umowa) boolean has been **removed** from `Vehicle`. The umowa is no longer modeled as a flag — the actual scanned umowa document is stored as `VehicleAttachment` rows with `category=contract` (uploaded from the Vehicle create/edit modal, bytes in MinIO). The `agreement` (Porozumienie) boolean is **unchanged** and stays on `Vehicle`. The interpretation discussion below is kept for historical context; it is moot for `contract` now — a vehicle either has a contract scan on file or it does not.

Historically the schema had both `agreement` (legacy `Porozumienie`) and `contract` (legacy `Umowa`) as independent nullable booleans on `Vehicle`. Two interpretations were plausible from the legacy UI alone (`index.html:1944-1945` — both are `<select>` Tak/Nie/—):

- **(a) Different concepts:** `umowa` = inclusion in MAGTRANS master fleet contract; `porozumienie` = enrolled in the km-guarantee program. Both can be `true` for the same vehicle.
- **(b) Mutually exclusive contract types:** a vehicle is on ONE relationship, not both. In which case storing two booleans is data-smell and a single enum `vehicleRelationship: 'umowa' | 'porozumienie' | null` would be cleaner.

Source of truth: `index.html:1944-1945` (form), `index.html:8614, 9725-9726` (display + payload). No business logic in `Code.gs` differentiated them.

**What NOT to do:** do not re-add a `contract` boolean — presence of the umowa is now derived from `VehicleAttachment` rows. Do not add business logic that depends on `agreement` (e.g., "only allow wniosek submission if porozumienie=true") without first confirming the interpretation with the stakeholder.

---

## 2. <a id="gpsMobilePhone"></a>`Vehicle.gpsMobilePhone` is a misnomer

UI label is "📡 Numer urządzenia GPS / MOB" (`index.html:1963`), placeholder `np. 12345`. This is **NOT a phone number** — it's the **tracker device ID** (serial / IMEI / vendor unit ID). "MOB" in legacy means "mobile object" (the truck's tracker unit), not "mobile phone".

The CHECK constraint `vehicle_gps_device_when_gps_on` (in migration `20260507_phase3_blocks`) enforces presence iff `gps=true` — semantically "every GPS-equipped truck has a tracker ID we can look up in the provider's portal".

Source of truth: `index.html:1963` (form label), `Code.gs:217, 309, 314` (header naming).

**What NOT to do:** do not validate `gpsMobilePhone` as E.164 or run libphonenumber on it. Do not rename the column — code throughout (legacy + new) references `gpsMobilePhone` / `GPSMobNr`; the misnomer is locked in by historical writes. A future "rename to `trackerDeviceId`" migration is plausible but is a code-cleanup, not a data fix.

---

## 3. <a id="vehicle-gb-it-fr"></a>`Vehicle.gb / it / fr` are country access permits, NOT language codes

Three boolean flags on `Vehicle`. Despite looking like ISO-639-1 language codes, they are **country access permits**:

- `gb` — UK access. Post-Brexit ECMT permit (limited yearly quota; not all PL carriers have one). Label: "GB 🇬🇧" (`index.html:1946`), tooltip "Wielka Brytania" (`index.html:8607`).
- `it` — Italy. Italy has weekend transit bans, special national restrictions; carrier needs the right paperwork. Label: "IT 🇮🇹" (`index.html:1947`).
- `fr` — France. Loi Macron / SIPSI compliance — French posting-of-workers regime. Label: "FR 🇫🇷" (`index.html:1948`), tooltip "Francja" (`index.html:8609`).

Why these three specifically: they are the "tricky" non-Schengen / regulatory-heavy countries that PL haulage routinely runs into and that planners filter by when assigning loads. Other EU-27 countries are uniformly accessible to a PL-licensed carrier and don't need a per-vehicle flag.

Source of truth: `index.html:1946-1948, 8607-8609`.

**What NOT to do:** do not treat as ISO language codes. Do not add `de` / `es` / etc. unless a stakeholder asks — the choice of three is intentional, not arbitrary.

---

## 4. <a id="nip-vatid"></a>NIP vs VAT-UE business rules

Two related but non-equivalent fields on `Carrier`:

- **`nip`** — Polish-only domestic tax ID. Foreign carriers (DE / CZ / SK / RO transport companies subcontracting to MAGTRANS) have **NONE**. NIP-validators (10 digits, weighted-checksum) only apply to PL carriers.
- **`vatId`** — EU VAT-UE. PL carriers have it as `PL` + their NIP; foreign carriers have it in their own country format (`DE...`, `CZ...`, `SK...`).

Schema rule: at least one of `nip` OR `vatId` must be present for any active carrier — otherwise we cannot invoice them. **Currently NOT enforced by CHECK** — admin/opiekun create flow allows blank `nip` for foreign carriers, and `vatId` is also nullable. The pair-non-null invariant lives in onboarding UI/UX only.

Same pattern for accounts:

- **`accountEur`** — STRICT (NOT NULL). Required for all carriers — invoices are EUR.
- **`accountPln`** — Optional. Foreign carriers may not have a PLN account; PL carriers usually do.

💡 Backlog: consider `CHECK (nip IS NOT NULL OR vatId IS NOT NULL)` after observing real-world data. Don't add it pre-emptively — onboarding edge cases (data entered in two passes, copy missing on intake) would falsely fail.

**What NOT to do:** do not require `nip` for foreign carriers (`it.country !== 'PL'`). Do not assume an EU-VAT pattern — VAT-UE country prefixes vary in length (`PL` 2 chars, then 10 digits; `DE` 9 digits; `CZ` 8-10 digits; ...). Use a permissive validator.

---

## 5. <a id="kwotaMaksima"></a>`kwotaMaksima` (Maksim authorization override)

When a claim's `paymentEur` exceeds `getAuthThreshold(drivenDays)` (see #6 below), the wniosek transitions to `OCZEKUJE_NA_AUTORYZACJE` instead of being acceptable directly. Pracownik then runs an **out-of-band manual decision flow**:

1. Pracownik calls `POST /claims/:nrZgl/request-authorization` — server emails Maksim Siankevich (the admin authorized to approve large payouts) using legacy `sendAuthorizationRequest` (`Code.gs:6010`). Status persists as `OCZEKUJE_NA_AUTORYZACJE`.
2. Maksim replies offline (email reply, Slack, phone — system-agnostic).
3. Pracownik uploads a screenshot of Maksim's authorization via `POST /claims/:nrZgl/auth-screenshot` (legacy `uploadAuthScreenshot`, `Code.gs:5977`). Stored as `authScreenshotUrl` — audit trail only, not parsed.
4. Pracownik manually enters `kwotaMaksima` in the modal. This **overrides** the calculated `paymentEur`.
5. Status transitions to `ZAAKCEPTOWANO`. Legacy code (`Code.gs:5263-5265`) writes `kwotaMaksima` into `doplata` (legacy column) — in the new schema both `amountApproved` and `amountMaximum` exist. Verify which one is canonical by reading current `ClaimsService.decide` (Phase 4) — both fields exist on the model. ⚠️ Pre-Phase-4 this is unimplemented; the data-model has space for either resolution.

Source of truth: `Code.gs:4899, 5042, 5154, 5263-5265, 5977, 6010-6109`; current types: `Claim.amountMaximum` + `Claim.amountApproved` in `schema.prisma`.

**What NOT to do:** do not try to automate Maksim's decision. Do not parse the screenshot. Do not make `amountMaximum` and `amountApproved` mutually-exclusive — they coexist (one is the override input, the other the recorded approval).

---

## 6. <a id="getAuthThreshold"></a>Authorization threshold `getAuthThreshold(drivenDays)`

Hardcoded step-function in legacy (`Code.gs:5968-5973`):

```js
function getAuthThreshold(dniJezdne) {
  var days = Math.floor(parseFloat(dniJezdne) || 0);
  if (days >= 61) return 1000;
  if (days >= 31) return 800;
  if (days >= 16) return 500;
  return 300; // 10-15
}
```

Read: longer trips justify larger payouts before triggering Maksim's manual review.

| `drivenDays` | Threshold (EUR) |
|---|---|
| ≥ 61 | 1000 |
| 31..60 | 800 |
| 16..30 | 500 |
| 10..15 | 300 |
| < 10 | n/a — wniosek cannot be submitted (`min_days_to_submit = 10` per AppConfig) |

Source of truth: `Code.gs:5968-5973`. Mention in [`docs/04-data-model.md#appconfig`](04-data-model.md) and [`docs/01-overview.md`](01-overview.md).

💡 Backlog: pricing is hardcoded in legacy. Future: move to `MonthlyLimit` (per month-year) or a new `AuthThresholds` table. Until that lands, the constants need to be ported byte-perfect — domain experts have memorized them.

**What NOT to do:** do not change a single number without explicit stakeholder sign-off. Do not assume linear interpolation (it's a step function — `drivenDays = 30.99` returns 500, `drivenDays = 31.0` returns 800). Floor-to-int **before** the comparison.

---

## 7. <a id="monthlyLimit-fallback"></a>`MonthlyLimit` fallback to 540 km/day

If `MonthlyLimit` has no row for a given `(year, month)`, the system **does not error** — it falls back to:

- `kmPerDay` → `AppConfig.km_dziennie_default = 540`
- `ratePerKm` → `AppConfig.stawka_eur_default = 0.5`

Legacy implementation: `Code.gs:850-858`:

```js
function getMonthLimit(limity, year, month) {
  if (limity[year] && limity[year][month] !== undefined) return limity[year][month];
  return CONFIG.KM_DZIENNIE; // fallback 540
}
function getMonthRate(stawki, year, month) {
  if (stawki[year] && stawki[year][month] !== null && stawki[year][month] !== undefined) return stawki[year][month];
  return CONFIG.STAWKA_EUR_ZA_KM; // fallback 0.5
}
```

Per-month cells in the legacy spreadsheet were also allowed to be **empty** (`''`), in which case the fallback fires too — `Code.gs:801-802` shows that even months 11/12 of 2026 were empty at seed time.

Source of truth: `Code.gs:32` (CONFIG), `Code.gs:801-802` (sheet seed), `Code.gs:850-858` (read).

**What NOT to do:** do not reject claims when no `MonthlyLimit` row exists for a covered month. Do not warn the user — fallback is the silent default. Admin sees missing rows in the limits-management UI; they're not user-facing errors.

---

## 8. <a id="easter-monday"></a>Easter Monday + EU bank holidays in `calcKmGwarantPerMonth`

The km-guarantee calculation **excludes** non-working days from the working-days count. Non-working = Saturday + Sunday + EU bank holidays + **Easter Monday** (and other movable feasts derived from Easter).

Easter is computed via the Gauss algorithm (`Code.gs:5908`, `calcEasterGS(year)`), and several days around Easter are added to the ban-set:

```js
// Code.gs:5947-5961 (sketch)
var easter = calcEasterGS(y);
var easterDays = [
  [..., 'Wielki Piątek'],  // Good Friday
  [..., 'Poniedziałek Wielkanocny'],  // Easter Monday
  [..., '2-go Maja'], // various national holidays anchored near Easter
  ...
];
for (var ei = 0; ei < easterDays.length; ei++) {
  var dd2 = new Date(easter); dd2.setDate(dd2.getDate() + offset);
  bans[fmtDateKey(dd2)] = ed[1];
}
```

Easter Monday alone is the biggest annual gotcha — it lands on Mar/Apr depending on year, **never the same date**.

Source of truth: `Code.gs:5908-5965`.

**What NOT to do:** do not "just exclude Saturday/Sunday" in the new port — the system will silently overpay every Easter (one extra working day per claim that crosses Easter Monday → 540 km × eur/km ≈ 270 EUR per such claim, repeated across the carrier base). Test fixtures must include Easter-week claims in 2024, 2025, 2026 — Easter dates: 31-Mar-2024, 20-Apr-2025, 5-Apr-2026.

---

## 9. <a id="reklamacja-mirror"></a>Reklamacja "frozen mirror" for rollback

When a carrier files a complaint (reklamacja) on an already-decided wniosek (status was `ZAAKCEPTOWANO` or `ODRZUCONO`), the system preserves the **original** values of the disputed fields BEFORE the verifier reviews:

- `origDateStart` ← `dateStart`
- `origDateEnd` ← `dateEnd`
- `origMileage` ← `mileage`
- `statusBeforeReklamacja` ← `status`

So that if the verifier ultimately **rejects** the reklamacja (transition `REKLAMACJA → ODRZUCONO`), the system can roll back the carrier's amended values to the originals without losing audit-quality data.

Reverse: if the verifier accepts (transition `REKLAMACJA → ZAAKCEPTOWANO`), the orig-fields are kept for audit but no longer authoritative.

Source of truth: `schema.prisma` (Claim model — orig* fields, statusBeforeReklamacja); legacy `Code.gs` reklamacja-handler logic.

**What NOT to do:** do not lose the orig fields when implementing the reklamacja form. Do not let the carrier blank/edit them — they're system-managed snapshots. Do not skip the snapshot-on-submit step assuming "we have the audit log" — the audit log stores `before/after` JSON of the whole row, but business logic that needs to roll back specific fields needs them on the row itself.

---

## 10. <a id="multi-role"></a>Multi-role users (e.g., przewoznik + opiekun)

A physical person can hold two roles. Common combo: a carrier-owner who also curates a small group of other carriers as `opiekun`. Implementation pattern:

- **TWO `User` rows**, one per role, linked by **the same `email`** (NOT joined by FK; loose coupling on email).
- At login the auth service finds both rows. JWT carries `role` (the active one) + `alternateRoles[]` (the others). UI shows a panel switcher.
- Switching roles = `POST /auth/switch-role` → server issues a new access JWT with a different `role` claim. The refresh token is unchanged — same physical session.

Why not "one User with `roles: Role[]`":

- Breaks 1:1 mapping with the 8 legacy auth-listy (every legacy sheet had its own row per role).
- Multiplies edge cases in role-scoped queries — every `findByRole(role)` becomes `findByRole IN (role)` in JSON arrays.
- Soft-delete and audit semantics differ per role — we want to deactivate the carrier-side account independently of the opiekun-side.

Source of truth: `docs/15-auth-strategy.md#multi-role`; legacy: `index.html:573` (the `#btnSwitchToEmployee` panel switcher).

**What NOT to do:** do not collapse the two rows into one with an array of roles. Do not rely on FK between the rows — they're linked only by email match (which is enforced unique on `User.email`). Do not assume the `role` field is the only role the user has — read `alternateRoles` if you're surfacing what the user can switch into.

---

## 11. <a id="lastDroveAt-auto"></a>`Vehicle.lastDroveAt` is auto-updated, never UI-editable

When a delegation transitions to `zjechal` (returned), the system writes `now()` to the corresponding `Vehicle.lastDroveAt`. This is a **side-effect of `markReturned`**, not a separately-trackable field.

Used by opiekun statistics (`/fleet/opiekun`) for derived KPIs:

- `jezdzace` — vehicles with `lastDroveAt` ≥ N days ago.
- `stojace` — vehicles where `lastDroveAt < now() - threshold` ("auto stojące > 7 dni").
- `nieaktywne` — `active = false`.

Source of truth: `schema.prisma` (Vehicle model comment); legacy: `Code.gs:4099-4121` ("Weryfikator oznacza 'zjechał' + auto-update AUTA.OstatnioJezdzilo").

**What NOT to do:** do not expose `lastDroveAt` as a manually-editable field in any UI form. Do not let the carrier or opiekun set it directly. Do not allow PATCH /vehicles to write it.

---

## 12. <a id="pracownik-ui-label"></a>`pracownik` is "Opiekun wniosków" in PL UI

The role identifier in DB and JWT is `pracownik`. **Every user-facing label** in PL (and EN once translated) must say "Opiekun wniosków" (claims-caretaker). Do NOT translate `pracownik` literally.

| Layer | Identifier |
|---|---|
| DB enum (`Role`) | `pracownik` |
| JWT `role` claim | `pracownik` |
| API `@Roles('pracownik')` | `pracownik` |
| **PL UI label** | **"Opiekun wniosków"** |
| EN UI label (when added) | "Claims caretaker" |
| Legacy comment (`Code.gs:944`) | "Pracownik = widzi wszystko, rozlicza wnioski, BEZ ustawień" |

Carrier-facing semantics: this person is the carrier's claims caretaker — they verify and accept wnioski, request authorization, deal with reklamacje. They do NOT manage the carrier or fleet (that's `opiekun`, a separate role with overlapping label nicknames).

Source of truth: `docs/03-roles.md#pracownik`; legacy: `index.html:573` (button text "🏢 Panel Opiekuna wniosków").

**What NOT to do:** do not surface `pracownik` literally in any user-facing string. Do not auto-translate to "Pracownik" / "Worker" / "Сотрудник" — the role's customer-facing semantics is "claims caretaker", not "employee". Easy to get wrong because two of the 8 roles (`pracownik` and `opiekun`) both map to the word "opiekun" in UI labels — they are different DB roles.

---

## 13. <a id="pracownik-no-delegations"></a>`pracownik` does NOT see delegacje at all

This is **stricter than legacy**. The legacy `getDelegacjeForEksport` allowed `pracownik` access (alongside `eksport`). In the new system, `pracownik` is **excluded** from the delegations module entirely.

Source of truth: `apps/api/src/modules/delegations/delegations.controller.ts` — every `@Roles(...)` decorator on the controller intentionally omits `pracownik`. The decision was locked in conversation; see header comment in the controller file.

The decision rationale: `pracownik` is now a narrow "Opiekun wniosków" role — only claims verification + dashboard. Delegations are an `eksport` / `weryfikator` / `dyspozytor` / carrier concern.

**What NOT to do:** if a future agent finds `pracownik` in `@Roles(...)` for any delegation endpoint, that's a **bug** — revert it. Do not "match legacy" for this — legacy was wrong-by-current-decision.

---

## 14. <a id="liderEmail"></a>`User.liderEmail` is per-role tech debt

`User.liderEmail` (nullable string) is currently used **only for `planista` role** — the email of their team lead, who gets CC-ed on planning decisions for any vehicle the planista is assigned to.

It's the **same denormalization pattern** as the now-fixed `User.company` field (which lived on User as a leftover from GAS auth-listy and was migrated to `Carrier.company` in `20260507223021_move_company_to_carrier`). Every non-planista user has `liderEmail = NULL` in practice; only planista rows carry a value.

Two reasonable cleanups (both backlog, neither urgent):

- **(a) Move to a `Planista` extension table** (1:1 with User where role=planista), mirroring how `Carrier` extends User for przewoznik. Cleanest if more planista-specific fields emerge.
- **(b) Keep on User if no other planista-only fields ever emerge.** Single-field extension tables are over-engineering.

💡 Backlog: revisit during Phase 6+ planning. Don't migrate pre-emptively.

Source of truth: `schema.prisma` (User model — `liderEmail String?` with comment pointing here); used in legacy email-CC logic.

**What NOT to do:** do not expose `liderEmail` as a User-API-level field beyond the planista login flow. Do not surface it in admin's User-edit form for non-planista roles. Do not require it at User-create time — set it only after the assigned-role workflow knows the role is `planista`.

---

## How to use this document

Read the relevant section before:

| You're implementing... | Read sections |
|---|---|
| Vehicle CRUD / forms | #1, #2, #3, #11 |
| Carrier onboarding / VIES / Biała Lista | #4 |
| Claim verification / decision PATCH | #5, #6, #9 |
| Authorization request / Maksim flow | #5, #6 |
| `calcKmGwarantPerMonth` port | #7, #8 |
| Auth + login + session | #10, #12 |
| Delegations module | #11, #13 |
| User edit / admin → users | #14, #12 |

If you find a NEW non-obvious quirk while implementing, add it here. Number it sequentially, give it an anchor (`<a id="...">`), include source-of-truth references, and end with a "what NOT to do" line.
