# 19. Known quirks — load-bearing reference

> This is a load-bearing reference for non-obvious quirks of the legacy MagTrans GAS app and the business rules that don't fit cleanly into schema or API design docs. Read it BEFORE implementing anything in claims-flow / vehicle-CRUD / delegations-flow / authorization-flow. Each section ends with a "what NOT to do" — those are the foot-guns. If you find a NEW non-obvious quirk while implementing, add it here.

> Markers:
> - ⚠️ AMBIGUOUS — confirm with stakeholder before implementing.
> - 💡 — backlog / future-cleanup hint.
> - **Source of truth:** `apps/api/src/modules/*` + `packages/database/prisma/schema.prisma` + `packages/shared/src/schemas/*`. Legacy `Code.gs` / `index.html` are functional reference only.

---

## 1. <a id="umowa-vs-porozumienie"></a>`Vehicle.umowa` vs `Vehicle.porozumienie` ✅ RESOLVED (2026-07-10)

> **Resolution (stakeholder, final, 2026-07-10):** the **umowa concept does not exist** in this business. **Porozumienie is the ONLY vehicle document** — it describes the carrier and the vehicles enrolled under the km-guarantee program. The `contract` attachment category was **removed entirely** from `VehicleAttachmentCategory` (migration `20260710090000_drop_vehicle_contract_category`), along with the legacy `contract` (Umowa) boolean that had already been dropped in 2026-05. Porozumienie stays modeled as `Vehicle.agreement` (Boolean) + the `agreement` attachment scan. This retires the (a)/(b) ambiguity below — there is no second relationship to disambiguate.

The historical ambiguity (now moot, kept only as a paper trail): the legacy schema carried both `agreement` (legacy `Porozumienie`) and `contract` (legacy `Umowa`) as independent nullable booleans on `Vehicle` (`index.html:1944-1945` — both `<select>` Tak/Nie/—), and two readings were once plausible — (a) umowa and porozumienie being different concepts that could both be true, or (b) mutually-exclusive contract types. No business logic in `Code.gs` ever differentiated them, and the stakeholder has now confirmed the umowa was never a real, separate thing. Only porozumienie remains.

**What NOT to do:** do not reintroduce a `contract` / `umowa` flag or attachment category in any form — the concept is gone by explicit stakeholder decision, not deferred. Porozumienie (`Vehicle.agreement` + `agreement` attachment) is the single source of the vehicle-document relationship; do not model a second one.

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

## 5. <a id="kwotaMaksima"></a>`kwotaMaksima` (Maksim authorization override) — **REMOVED 2026-07-24**

The manual authorization flow this quirk documented (pracownik calls `POST /request-authorization`, Maksim replies, pracownik records a structured `kwotaMaksima` that overrides the payout) **no longer exists in the product**. Removed together with the `Claim.amountMaximum` / `margin` / `authorization*` / `authScreenshotUrl` columns, the `AUTORYZACJA_KWOTA_MAKSIMA` status and the `authorization-request.tsx` email. The legacy behavior remains visible only in `Code.gs:4899, 5042, 5154, 5263-5265, 5977, 6010-6109` (reference, do not port).

What replaced it — the **automatic Maksim gate**: on zapis weryfikacji with final `paymentEur > getAuthThreshold(drivenDays)` (see #6) the wniosek transitions to `OCZEKUJE_NA_AUTORYZACJE` automatically, Maksim receives a confirmation email (amount-aware dedup via `maksimGateNotifiedAmount`), and the accept/reject decision is blocked (422 `CLAIM_AUTHORIZATION_REQUIRED`) until pracownik uploads a screenshot of his reply (`POST /claims/:nrZgl/authorization-confirmation`, stored as a `ClaimAttachment` of category `AUTORYZACJA_MAKSIMA`). A correction dropping the amount to/under the threshold auto-rolls the claim back to `NA_WERYFIKACJI`. Re-verify while in `OCZEKUJE_NA_AUTORYZACJE` is admin-only; auto-recalc is frozen there. The approved amount is recorded only as `amountApproved` at accept time — there is no separate override field.

**What NOT to do:** do not resurrect a manual "send to authorization" action or a structured `kwotaMaksima` field — the screenshot IS the confirmation record. Do not parse the screenshot. Do not automate Maksim's decision.

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

Read: longer trips justify larger payouts before triggering Maksim's review. Crossing the threshold at zapis weryfikacji **automatically** moves the wniosek to `OCZEKUJE_NA_AUTORYZACJE` (see #5 for the current flow — there is no manual trigger).

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

### ⚠️ UPDATE 2026-09-20 — «wyłączane limity»: три состояния, пополевой fallback

Фича «выключаемые лимиты гарантии» превратила двузначный мир («есть значение» / «нет строки») в **трёхзначный**, и легаси-семантика `Code.gs:850-858` больше **не** совпадает 1:1 — именно для нуля:

| Состояние в БД | Смысл | km-calc |
|---|---|---|
| строки нет / колонка `NULL` | не сконфигурировано | fallback (540 км/дн, 0,5 €/км, **0** км/суббота) |
| `0` | **выключено осознанно** | месяц даёт 0 км гарантии — fallback **НЕ** применяется |
| `> 0` | значение | как задано |

Легаси (и первая версия порта) трактовали «пусто» и «ноль» одинаково: `if (limity[y][m] !== undefined)` в GAS и `if (km === null || rate === null) continue` в `KmCalcService._loadMonthlyLimits` **выбрасывали строку целиком**. Для нуля это боевой дефект: строка `{kmPerDay: 0, ratePerKm: NULL}` (админ нажал «выключить» раньше, чем кто-то завёл ставку) давала месяцу **максимальную** гарантию 540 км/дн. Теперь:

- **fallback подставляется пополево**, а не выбрасыванием строки: `{kmPerDay: 300, ratePerKm: NULL}` → 300 км/дн по ставке 0,5 (раньше → 540 @ 0,5). Это намеренное изменение поведения частично заполненных строк;
- строка, у которой **все три** колонки `NULL`, по-прежнему эквивалентна отсутствию строки (полный fallback);
- `0` доезжает до движка как `0` (движок корректен: `Number.isFinite`, а не truthiness);
- `kmPerSaturday` остаётся **opt-in**: отсутствие ключа сворачивается в 0 = «субботы выключены». Глобальный `FALLBACK_KM_PER_SATURDAY` **обязан остаться нулём** — движок трактует месячный `0` как «не задано» и проваливается в fallback, так что положительный fallback молча включил бы субботы во всех месяцах, где их явно выключили. Пин закреплён тестами (`packages/shared/tests/claim-settlement.test.ts` → «engine pin», `apps/api/src/modules/km-calc/km-calc.service.spec.ts` → «ENGINE PIN»).

Валидация: `UpdateMonthlyLimitSchema` / `BulkUpdateMonthlyLimitsSchema` теперь `nonnegative()` (не `positive()`), и они — **единственная** защита от отрицательных значений: DB-CHECK на `monthly_limits` нет.

**What NOT to do:** не отвергать wniosek, когда для месяца просто **нет** строки `MonthlyLimit` — fallback тут по-прежнему тихий дефолт (админ видит пропуски в UI лимитов). Но **не путать это с нулём**: полностью выключенный период — это осознанное решение, и подача блокируется отдельным нарушением «Gwarancja km jest wyłączona dla tego okresu.» (тексты и диагностический бакет разведены — см. `ClaimsService._noGuaranteeViolation` и `DiagnosticsRepository.findClaimsHealth`). И не писать falsy-проверок (`x || 540`, `if (x)`) на `kmPerDay`/`ratePerKm` — только `?? ` / `!= null`, иначе выключенная гарантия молча превращается в максимальную.

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

## 9. <a id="reklamacja-mirror"></a>Reklamacja "frozen mirror" + explicit outcome

> ⚠️ **Updated 2026-07-31** (migration `20260731120000_add_reklamacja_resolution_fields`). The reklamacja no longer amends any claim data, and its outcome is an explicit column. The mirror stays — as a historical record and, crucially, as the **status rollback anchor**, which the decision path now actually reads.

When a carrier files a reklamacja on an already-decided wniosek (status was `ZAAKCEPTOWANO` or `ODRZUCONO`), the system snapshots:

- `origDateStart` ← `dateStart`
- `origDateEnd` ← `dateEnd`
- `origMileage` ← `mileage`
- `origHoursAdjusted` ← `hoursAdjustedValue`
- `statusBeforeReklamacja` ← `status`

**What changed.** The carrier no longer submits amended values at all (the reklamacja body is `{tresc, kwotaReklamacji}` only), so the `orig*` fields are no longer "the values to roll back to" — they are an audit-quality historical record of the original submission. `statusBeforeReklamacja`, by contrast, became **load-bearing**: on BOTH outcomes the decision sets `status = statusBeforeReklamacja` (defensive fallback when it is somehow NULL: `amountApproved != null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO'`).

**The outcome is NOT the status.** `reklamacjaResolution` (`UZNANA` / `ODRZUCONA`) is the only place the verdict lives. `NULL` means "never filed" OR "filed and still pending" — the two are told apart by `status === 'REKLAMACJA'` (pending) and `reklamacjaSubmitted`. `reklamacjaDecidedAt` is `NULL` on rows backfilled by the migration ("unknown"), not "pending".

Source of truth: `schema.prisma` (Claim model — `orig*`, `statusBeforeReklamacja`, `reklamacja*`); business rules in [01-overview.md §5](01-overview.md) and [13-api-design.md](13-api-design.md#update-claim-verification); eligibility/ceiling in `packages/shared/src/domain/reklamacja-rules.ts`.

**What NOT to do:**

- Do not derive the reklamacja outcome from the resulting `status` — after a decision it reads as the ORIGINAL wniosek verdict (that is the whole point of variant A). This also means the generic wniosek-decision emails must not fire on a reklamacja decision (`reklamacja-carrier-decision` does).
- Do not touch `amountApproved` / `orderNumber` / `orderDate` / `paymentEur` / claim-level `decidedById` when resolving a reklamacja. An uznana reklamacja is paid under its own `reklamacjaOrderNumber`; the pre-rework code flipped the status to `ZAAKCEPTOWANO` on the `ODRZUCONO → REKLAMACJA → accept` path and thereby violated DB CHECK `claim_accepted_payment_complete`.
- Do not lose the `orig*` fields, and do not let the carrier blank/edit them — they're system-managed snapshots. Do not skip the snapshot-on-submit step assuming "we have the audit log": the audit log stores whole-row `before/after` JSON, but logic keyed on a specific column needs it on the row itself (`statusBeforeReklamacja` is exactly that case).
- Do not re-derive the reklamacja ceiling anywhere. `ReklamacjaSheet.tsx` and `ClaimsService.submitReklamacja` each hand-inlined it and drifted (the api carried a `+1 €` tolerance the web did not); both now call `getReklamacjaEligibility`.

---

## 10. <a id="multi-role"></a>Multi-role users (e.g., przewoznik + opiekun)

**Not implemented and not planned** (decision 2026-10-23, track B B5; docs/03 §Multi-role). One account = one role. The JWT carries a single `role`; there is no `alternateRoles`, no `POST /auth/switch-role`, no panel switcher (the legacy `#btnSwitchToEmployee` at `index.html:573` is not reproduced). A physical person who genuinely needs two roles (e.g. a carrier-owner who also curates other carriers as `opiekun`) gets **two `User` rows with two different e-mails** — `User.email` is unique and nothing links the rows. "This person needs one more function" is solved by per-user permission overrides (docs/25 B6), never by a second role.

Source of truth: `docs/03-roles.md#multi-role`; `packages/shared/src/schemas/auth.ts` (`UserDto` has no `alternateRoles`).

**What NOT to do:** do not add `alternateRoles`, a role switcher or a second role to a user; do not link two accounts by e-mail match (it cannot happen — the column is unique). If an admin asks for "the opiekun who is also a carrier", create a second account with another e-mail or, when the need is one function, grant a permission (B6).

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

## 12. <a id="pracownik-ui-label"></a>`pracownik` is labelled "Pracownik" in the UI (decision 2026-10-22)

The role identifier in DB and JWT is `pracownik`, and the UI label is the literal **"Pracownik"** (PL) / **"Employee"** (EN) — `roles.pracownik` in `apps/web/messages/*.json`. Until 2026-10-22 this quirk demanded the label "Opiekun wniosków" (claims-caretaker, after the legacy button `index.html:573` "🏢 Panel Opiekuna wniosków"). That was reversed: the code never followed it, and it made two of the 8 roles (`pracownik` and `opiekun`) read as "opiekun" in the UI. "Opiekun wniosków" survives only as a descriptive phrase in docs; the leader label `roles.lider.pracownik` is "Lider pracowników" / "Employees lead" (renamed the same day from "Lider opiekunów wniosków").

| Layer | Identifier |
|---|---|
| DB enum (`Role`) | `pracownik` |
| JWT `role` claim | `pracownik` |
| API rights (`ROLE_PERMISSIONS.pracownik`, `packages/shared/src/permissions.ts`) | `claims.read`, `claims.verify`, `dashboard.read`, `lookups.carriers` — nothing else |
| **PL UI label** | **"Pracownik"** |
| EN UI label | "Employee" |
| Legacy comment (`Code.gs:944`) | "Pracownik = widzi wszystko, rozlicza wnioski, BEZ ustawień" |

Semantics are unchanged: this person verifies and accepts wnioski, handles the automatic authorization gate (screenshot upload), deals with reklamacje. They do NOT manage the carrier or fleet (that's `opiekun`, a separate role).

Source of truth: `docs/03-roles.md#pracownik`.

**What NOT to do:** do not rename the label back to "Opiekun wniosków", and do not translate it as "Worker" / "Сотрудник" — "Pracownik" / "Employee" is the fixed pair.

---

## 13. <a id="pracownik-no-delegations"></a>`pracownik` does NOT see delegacje at all

This is **stricter than legacy**. The legacy `getDelegacjeForEksport` allowed `pracownik` access (alongside `eksport`). In the new system, `pracownik` is **excluded** from the delegations module entirely.

Source of truth: the permissions catalog — `ROLE_PERMISSIONS.pracownik` in `packages/shared/src/permissions.ts` holds no `delegations.*` right, so every `@RequirePermission` on `delegations.controller.ts` excludes pracownik; the frozen `endpoint-roles.snapshot.json` fixture pins it. The decision was locked in conversation; see the header comment in the controller file.

The decision rationale: `pracownik` is now a narrow claims-only role ("Pracownik" in the UI) — only claims verification + dashboard. Delegations are an `eksport` / `weryfikator` / `dyspozytor` / carrier concern.

**What NOT to do:** adding any `delegations.*` right to `ROLE_PERMISSIONS.pracownik`, or gating a delegation route with a right pracownik holds, is a **bug** — the roles-fixture test goes red; revert it. Do not "match legacy" for this — legacy was wrong-by-current-decision.

---

## 14. <a id="liderEmail"></a>`User.liderEmail` is per-role tech debt ✅ RESOLVED (2026-09-28)

> **Resolution ([docs/29](29-vehicle-planner-transfer-plan.md) R8).** The "who is whose leader" structure now exists: `User.liderId` — self-FK from a planista to a planista with `lider = true`, set by an admin in UserSheet («Przełożony (lider)»), never touched by the MAGSpace reconcile, cleared when the user's effective role stops being `planista`. It drives two things: who may decide the planista's vehicle-transfer requests, and whom claim e-mails CC (the lider's own `email`). Migration `20260928120000_vehicle_planner_transfer` backfilled `liderId` from matching `liderEmail` values. The `liderEmail` column is **deprecated**: still in the DB, no longer read or written by the api, absent from DTOs and the UI; it is dropped in a separate later release (after the unmatched values on pre-prod are resolved by hand). The text below is kept as history.
>
> **What NOT to do now:** do not read `liderEmail` anywhere, do not re-add it to DTOs or forms, and do not drop the column in the same release as another schema change.

`User.liderEmail` (nullable string) is currently used **only for `planista` role** — the email of their team lead, who gets CC-ed on planning decisions for any vehicle the planista is assigned to.

It's the **same denormalization pattern** as the now-fixed `User.company` field (which lived on User as a leftover from GAS auth-listy and was migrated to `Carrier.company` in `20260507223021_move_company_to_carrier`). Every non-planista user has `liderEmail = NULL` in practice; only planista rows carry a value.

Two reasonable cleanups (both backlog, neither urgent):

- **(a) Move to a `Planista` extension table** (1:1 with User where role=planista), mirroring how `Carrier` extends User for przewoznik. Cleanest if more planista-specific fields emerge.
- **(b) Keep on User if no other planista-only fields ever emerge.** Single-field extension tables are over-engineering.

💡 Backlog: revisit during Phase 6+ planning. Don't migrate pre-emptively.

Source of truth: `schema.prisma` (User model — `liderEmail String?` with comment pointing here); used in legacy email-CC logic.

**Not to be confused with `User.lider`** (2026-09-25, [docs/28](28-lider-roles-plan.md)) — the boolean *leader flag* over a role (`lider_planista` = `role: planista` + `lider: true`). `liderEmail` is an address to CC; `lider` is the user's own status; there is no link between them today. The admin form labels the e-mail field «E-mail lidera (CC)» for that reason. Once a "who is whose leader" structure exists (needed for vehicle hand-over approvals), `liderEmail` will be derived from it and this field goes away.

**What NOT to do:** do not expose `liderEmail` as a User-API-level field beyond the planista login flow. Do not surface it in admin's User-edit form for non-planista roles. Do not require it at User-create time — set it only after the assigned-role workflow knows the role is `planista`.

---

## 15. <a id="planner-live-vs-snapshot"></a>Planista: vehicle views are live, trip and claim views are historical

Since [docs/29](29-vehicle-planner-transfer-plan.md) (2026-09-28) "the planista" means two different things depending on the screen:

| Where | Which planista | Field |
|---|---|---|
| Fleet panel, km-report, GPS, vehicle list / detail, lookups | the **current** planista of the vehicle — live | `Vehicle.plannerId` |
| Delegation list / detail scope, «ZESPÓŁ PROWADZĄCY», Chat wyjazd message | the planista **of that trip** — snapshot taken at registration, re-stamped on transfer approval only while the trip is `zgloszony` / `gotowy` | `Delegation.plannerId` |
| Claim e-mail recipients | the trip's snapshot planista; a claim without a trip → every planista whose assignment overlaps the claim period; CC = each one's **current** lider | `Delegation.plannerId`, `VehiclePlannerAssignment` |

So after a transfer the old planista loses the vehicle (and its past km weeks) at once but keeps the trips he led; the new one sees the vehicle and its full km history but only trips from the transfer on. This is intended (docs/29 U7), not a bug. The delegation DTO carries both `planner` (trip) and `vehicle.planner` (current) so the UI can show «Ciągnik prowadzi obecnie: …» when they differ.

`Vehicle.plannerId` is a denormalized pointer that must always equal the open `VehiclePlannerAssignment` row. It is written in exactly two places: vehicle create (with a `create` history row) and transfer approval (closes the open row, opens a `transfer` row, same timestamp). `PATCH /vehicles/:id` with `plannerId` is a 422 for every role, admin included.

History before 2026-09-28 is approximate: the migration assumed the planista at deploy time led every earlier trip (`backfill` rows, `validFrom = vehicle.createdAt`).

**What NOT to do:** do not "fix" the delegation scope back to `vehicle.plannerId`; do not add a direct write of `Vehicle.plannerId` outside the two paths above; do not make fleet / km-report historical without a product decision (docs/29 U7).

---

## 16. <a id="delegation-dual-timestamps"></a>Dual timestamp convention on `Delegation` (UWAGI #1, 2026-10-22)

Two different conventions live on the same row:

| Field | Convention | Why |
|---|---|---|
| `departureAt` | **TRUE UTC instant** | The carrier form sends `new Date(localWallClock).toISOString()`; the panel converts it back to browser-local for display. |
| `actualDepartureAt`, `actualReturnAt` | **Warsaw wall-clock LABELLED UTC** | The weryfikator `/in-transit` / `/returned` dialogs append `:00Z` to the typed wall-clock (`datetimeLocalToApiIso`), so the raw `T`-part IS the wall-clock. Originally the claim's `timeFrom` / `timeTo` were derived from it (docs/20 §0‴, cancelled by §0⁗); today the web reads it back as-is (`actualIsoToDatetimeLocal`, the ClaimModal «Dane weryfikatora» column via `hhMmFromIso`). A typed 14:20 is stored `…T14:20:00Z`, which as a real instant is 15:20 CET / 16:20 CEST. |

The bug that surfaced this: the "not in the future" guards compared `actual*` with the real `Date.now()`, so any wall-clock in the last 1 h (CET) / 2 h (CEST) was rejected as `DEPARTURE_DATE_FUTURE` / `RETURN_DATE_FUTURE`. The `/in-transit` lower bound truncated the true-UTC `departureAt` to its UTC day, which for a departure reported at 00:00–00:59 CET / 00:00–01:59 CEST is the previous day, so the bound was a day too lenient.

Helpers (`packages/shared/src/domain/business-date.ts`):

- `businessWallClockUtc(now?)` — Warsaw wall-clock "now" in the same labelled-UTC shape. The operand for every "not in the future" check on `actual*`.
- `startOfWallClockDayUtc(d)` — the calendar date of a WALL-CLOCK-labelled value (`actual*`, `businessWallClockUtc()`) at `T00:00Z`: the raw `T`-part's date, no zone conversion (UWAGI #26). Use it, never `startOfBusinessDayUtc`, to turn an `actual*` into a day.
- `startOfBusinessDayUtc(d)` — the Warsaw calendar date of a TRUE-UTC instant at `T00:00Z`. In labelled-UTC terms that is wall-clock midnight of that day, so it is the bridge from `departureAt` to the `actual*` convention (the `/in-transit` lower bound).

Source of truth: `apps/api/src/modules/delegations/delegations.service.ts` (`_assertActualDepartureValid`, `_assertActualReturnValid`), the header of `apps/web/lib/format/datetimeLocal.ts`, `packages/shared/src/domain/business-date.ts`.

Known remaining lenient spots (tracked separately, NOT fixed by UWAGI #1):

- **`markReturned` fallback floor.** When `actualDepartureAt` is null, the return floor is the true-UTC `departureAt`, so the check is lenient by the UTC offset (1–2 h). Defensive path only: `markInTransit` always sets `actualDepartureAt`.
- **`vehicle-status.ts` `daysSinceReturn`** — *fixed 2026-10-27 (UWAGI #26)*. `lastReturnAt` IS an `actualReturnAt` (wall-clock labelled UTC), so the classifier now reduces it by its raw date part — `startOfWallClockDayUtc`, the pair of `startOfBusinessDayUtc` — instead of the Warsaw reduction that moved a 23:00 (CET) / 22:00 (CEST) return onto the next day; `createdAt` (a true instant) keeps the Warsaw reduction, and `anchorAt` now reports the reduced day (UTC midnight) for both sources, so the removal-alert mail's «od …» is right for a vehicle created at 00:00–01:59 Warsaw too. Web shows `actualDepartureAt` / `actualReturnAt` / `lastDroveAt` through the `formatWallClock*` formatters (`timeZone: 'UTC'`), never the browser-local `formatDateFull` / `formatDateTime` — in a Warsaw browser those printed the same 23:30 return as the next day. Still open in the same family: `polish-calendar.ts` `atMidnight` reduces by the PROCESS zone (`getFullYear()`…), so the watchdog deadline from a wall-clock anchor is right on the UTC containers and a day off on a Warsaw-zone dev machine; and the Maksim mail's `odjazdPlan` slices the TRUE-UTC `departureAt` (UWAGI #28).

**What NOT to do:** never compare `actualDepartureAt` / `actualReturnAt` with `Date.now()` / a no-arg `new Date()`; use `businessWallClockUtc()`. Never compare them with true-UTC fields (`departureAt`, `createdAt`, `verifiedAt`, …) without converting first; for a day bound use `startOfBusinessDayUtc`, never `getUTC*` / UTC-day truncation. Do not call `toISOString()` on the typed wall-clock in the web dialogs (it tz-shifts the hour). Do not "fix" this by changing the storage format in passing: `actualIsoToDatetimeLocal`, the ClaimModal verifier column, and existing rows all depend on it, so a switch to true UTC needs its own product and data decision.

---

## How to use this document

Read the relevant section before:

| You're implementing... | Read sections |
|---|---|
| Vehicle CRUD / forms | #1, #2, #3, #11, #15 |
| Carrier onboarding / VIES / Biała Lista | #4 |
| Claim verification / decision PATCH | #5, #6, #9 |
| Claim e-mail recipients | #14, #15 |
| Maksim authorization gate (automatic) | #5, #6 |
| `calcKmGwarantPerMonth` port | #7, #8 |
| Auth + login + session | #10, #12 |
| Delegations module | #11, #13, #15, #16 |
| Delegation timestamps / "now" / day bounds | #16 |
| Planista scope / vehicle transfers | #15 |
| User edit / admin → users | #14, #12 |

If you find a NEW non-obvious quirk while implementing, add it here. Number it sequentially, give it an anchor (`<a id="...">`), include source-of-truth references, and end with a "what NOT to do" line.
