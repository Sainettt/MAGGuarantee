# 12. Database schema (Postgres + Prisma)

> Структура Postgres-схемы. Google Sheets из текущего MAGGuarantee — это **референс структуры данных** при проектировании моделей (т.к. бизнес-логика и поля изначально проектировались под них). Никакого импорта данных нет — стартуем с пустой БД + seed.
>
> Источник истины самой схемы — `packages/database/prisma/schema.prisma`. Если этот документ и `schema.prisma` расходятся — реальность побеждает, документ обновляется.

## Three-layer required-field defense

Поля делятся по тому, на каком уровне для них добивается «обязательность». Рисунок:

| Слой | Что | Где задаётся |
|---|---|---|
| **UI** | RHF + Zod в `apps/web` | формы (carrier/admin/opiekun) |
| **API** | Zod-схемы в `@magguarantee/shared` | `packages/shared/src/schemas/*.ts` |
| **DB** | NOT NULL + CHECK constraints | `packages/database/prisma/schema.prisma` + `migrations/*.sql` |

Какие поля закрыты на каком слое — см. таблицу «Required-field classification» в конце разделов про `Carrier`/`Vehicle`/`Driver`/`Claim`/`Delegation`. Высокоуровневая сводка:

- **Strict everywhere (UI + API + DB NOT NULL):** базовый профиль перевозчика, базовые характеристики авто, расчётные поля claim'а на момент submit.
- **API + UI required, DB nullable:** документы, для которых при импорте/драфте может не быть копии (страховка, лицензия carrier; права driver).
- **DB nullable + status-conditional CHECK:** поля, которые становятся обязательными только при переходе в определённый статус (claim → ZAAKCEPTOWANO; vehicle → gps=true; delegation → zjechal).
- **Optional everywhere:** поля, которые НЕ обязательны нигде (заметки, второстепенные контакты, не-PL налоговые ID, ставки, password в форсе email-only auth).

## Принципы маппинга

1. **Один лист = одна таблица** там, где это семантически. Auth-листы (ADMIN, PRACOWNIK, OPIEKUN, …) сливаются в одну `users` (различаются по `role`).
2. **FK везде, где сейчас денормализация** — `claims.carrierId` (UUID FK), не `Przewoznik` (nazwa). При переименовании carrier-а wnioski не теряются.
3. **Soft-delete вместо `Aktywny='Nie'`** — поле `deletedAt: DateTime?`. Запросы по умолчанию фильтруют `deletedAt IS NULL`.
4. **Timestamps** — `createdAt`, `updatedAt` на всех таблицах через Prisma `@default(now())` / `@updatedAt`.
5. **Composite UNIQUE** — `(carrierId, plateNumber)` для vehicles, чтобы повторить инвариант «уникальный NrRej в рамках перевозчика».
6. **JSON-поля** — для полу-структурированных данных (audit `before/after`, claim breakdown).
7. **Enum-ы** — для статусов, ролей, типов авто; не строки.
8. **PK — UUID v7** (sortable), не autoincrement int (избегаем enumeration).
9. **Decimal** для денег и km — не `Float`. `Decimal(12, 2)` для EUR, `Decimal(10, 2)` для km.
10. **Смыслосодержащие ключи** (`nrZgl`, `plateNumber`, `login`) — оставляем как unique-поля в дополнение к UUID PK. Они показываются пользователям и удобны при отладке.

## Полная Prisma schema

> Это сокращённая выжимка для документации. **Авторитетный источник** — `packages/database/prisma/schema.prisma`. Если документ и схема расходятся, читать схему. Ниже приводится только структура; CHECK constraints и status-conditional rules описаны в SQL-миграциях (см. раздел «Миграции» ниже) и резюмированы в подразделе «Required-field classification».

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider      = "prisma-client-js"
  output        = "../src/generated"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ─────────────────────────────────────────────

enum Role {
  admin
  pracownik
  opiekun
  planista
  dyspozytor
  przewoznik
  eksport
  weryfikator
}

enum ClaimStatus {
  NA_WERYFIKACJI            @map("NA WERYFIKACJI")
  ZAAKCEPTOWANO
  ODRZUCONO
  REKLAMACJA
  OCZEKUJE_NA_AUTORYZACJE   @map("OCZEKUJE NA AUTORYZACJĘ")
  AUTORYZACJA_KWOTA_MAKSIMA @map("AUTORYZACJA — KWOTA MAKSIMA")
}

// REWORK 2026-06-20 (#4, docs/20 §0″) — statuses operational again:
// carrier→zgloszony, eksport→gotowy, weryfikator→w_trasie→zjechal.
enum DelegationStatus {
  zgloszony
  gotowy
  w_trasie
  zjechal
  anulowany
}

// REWORK 2026-06-20 (#4) — explicit result of the period auto-recalc that
// fires when a delegation reaches `zjechal`. Read directly by the frontend
// instead of being inferred heuristically. none = no recalc event yet
// (default); applied = recalc ran on `zjechal`; skipped = recalc was due
// (real date divergence) but suppressed (claim already decided or period was
// adjusted by a human). Set by the api.
enum ClaimAutoRecalcState {
  none
  applied
  skipped
}

// Phase 7 (REWORK 2026-06-12 #3, see docs/20 §0′) — `weryfikator` records each
// vehicle's DAILY km. Per-(vehicle, day) state. Derived motion status
// (`w_ruchu`/`nie_jezdzi`/`nieznany`) is computed at read time, NOT stored.
enum VehicleDayState { drove  idle }
// Origin of a daily-km row: manual (weryfikator/admin) or gps (no user).
enum VehicleStatusSource { manual  gps }
// ⛔ REMOVED 2026-06-12 (#3): `enum VehicleRouteStatus { w_trasie zjechal }` +
// model VehicleRouteStatusLog — route-status board absorbed by VehicleDailyKm.

enum VehicleType { MEGA  STD  COIL }
// EuroNorm — III/IV dropped 2026-05 (km-guarantee program restricted to
// EURO V/VI). DB is greenfield, so removing the legacy values is a clean
// enum redefinition.
enum EuroNorm    { V  VI }
// CertificateL was collapsed to Boolean (TAK/NIE) in 2026-05; see Vehicle.certificateL below.

// Category of a file attached to a Vehicle (umowa scan, cabotage permits).
// `adr` value dropped 2026-05-29 — the kept `Vehicle.adr` boolean stays as the
// permit flag; the ADR certificate scan moved to the Driver (DriverAttachment).
enum VehicleAttachmentCategory { contract  cabotage_de  cabotage_fr }

// Category of a file attached to a Driver — the ADR driver certificate
// (świadectwo ADR). Single value for now; enum (not literal) to mirror the
// Vehicle/Carrier attachment pattern and stay extensible.
enum DriverAttachmentCategory { adr }

// Category of a file attached to a Carrier — the carrier's own company
// documents: OCP insurance, transport license, KREPTD extract, the mandatory
// ADR document (single official doc listing the carrier's ADR vehicles/drivers),
// plus a catch-all.
enum CarrierAttachmentCategory { insurance  license  kreptd  adr  other }

// Guarantee Watchdog (план 2026-07-07). Lifecycle state of an idle-episode row
// (warning = a D-3/D-1 reminder fired; violated = deadline missed; resolved =
// closed). Anchor origin (zjechal = last returned delegation; agreement = never
// returned, counts from Vehicle.agreementSince). Close reason.
enum GuaranteeEpisodeState  { warning  violated  resolved }
enum GuaranteeAnchorSource  { zjechal  agreement }
enum GuaranteeResolveReason { wyjazd  agreement_off  vehicle_inactive }

// ─── USERS ──────────────────────────────────────────────

model User {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  login          String    @unique
  email          String    @unique
  passwordHash   String?  // bcrypt; nullable to allow email-only auth
  // Forced password rotation. Set true whenever an admin issues a password
  // (create or reset); user must set a new one on next login (after 2FA).
  // Self-service / forced change clears it. Migration 20260616120000.
  mustChangePassword Boolean @default(false)
  passwordChangedAt  DateTime? // stamped on every password change; NULL until first change
  role           Role
  name           String?
  active         Boolean   @default(true)
  failedAttempts Int       @default(0)
  lockedUntil    DateTime?
  lastLoginAt    DateTime?

  // role-specific (nullable for other roles)
  // planista — see docs/19-known-quirks.md (#liderEmail tech debt)
  liderEmail     String?

  // Relations: opiekun↔Carrier (1:N), przewoznik↔Carrier (1:1), planner/dispatcher↔Vehicle, etc.
  carriers           Carrier[]      @relation("OpiekunCarriers")
  carrierProfile     Carrier?       @relation("CarrierUser")
  plannerVehicles    Vehicle[]      @relation("VehiclePlanner")
  dispatcherVehicles Vehicle[]      @relation("VehicleDispatcher")
  reportedDelegations Delegation[]  @relation("DelegationReporter")
  verifiedDelegations Delegation[]  @relation("DelegationVerifier")
  authoredClaims     Claim[]        @relation("ClaimDecidedBy")
  verifiedClaims     Claim[]        @relation("ClaimVerifiedBy")  // «Zapisz weryfikację» checkpoint author (mirror of authoredClaims)
  uploadedVehicleAttachments VehicleAttachment[]
  uploadedDriverAttachments  DriverAttachment[]
  uploadedCarrierAttachments CarrierAttachment[]
  notedDailyKm               VehicleDailyKm[]        @relation("DailyKmNotedBy")
  auditEntries       AuditLog[]
  refreshTokens      RefreshToken[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([role])
  @@index([deletedAt])
  @@map("users")
}

// ─── CARRIERS (extension fields for role=przewoznik) ────

model Carrier {
  id     String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId String @unique @db.Uuid
  user   User   @relation("CarrierUser", fields: [userId], references: [id])

  company         String?  // moved from User in 20260507223021_move_company_to_carrier
  nip             String?  // PL-only domestic — see docs/19-known-quirks.md (NIP vs VAT-UE)
  vatId           String?  // EU VAT
  contactPerson   String   // STRICT — UI + API + DB NOT NULL
  phone           String   // STRICT
  ordersEmail     String   // STRICT
  accountEur      String   // STRICT (foreign carriers may not have PLN account)
  accountPln      String?
  paymentTerms    Int      @default(30)
  // STRICT — UI + API + DB NOT NULL; Zod additionally enforces `> 0`
  insuranceValue  Decimal   @db.Decimal(12, 2)
  // API + UI required, DB nullable — admin/opiekun create flow may lack copies
  insuranceExpiry DateTime? @db.Date
  licenseExpiry   DateTime? @db.Date
  numberOfVehicle Int?      // KREPTD wypisy
  companyAddress  String   // STRICT

  opiekunId String @db.Uuid
  opiekun   User   @relation("OpiekunCarriers", fields: [opiekunId], references: [id])

  vehicles          Vehicle[]
  drivers           Driver[]
  trailers          Trailer[]
  claims            Claim[]
  delegations       Delegation[]
  attachments       CarrierAttachment[]
  guaranteeEpisodes GuaranteeIdleEpisode[]   // Guarantee Watchdog — denormalized carrier

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([opiekunId])
  @@index([deletedAt])
  @@map("carriers")
}

// ─── CARRIER ATTACHMENTS (OCP insurance / license / KREPTD) ──
// Carrier company documents uploaded from the Carrier create/edit view —
// stored in MinIO. DB row holds metadata + object key; bytes live in the
// bucket. Mirrors VehicleAttachment.
model CarrierAttachment {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId String  @db.Uuid
  carrier   Carrier @relation(fields: [carrierId], references: [id], onDelete: Cascade)

  category   CarrierAttachmentCategory
  storageKey String  // object key in MinIO: carriers/<carrierId>/<category>/<fileId>.<ext>
  fileName   String
  mimeType   String
  size       Int

  uploadedById String? @db.Uuid
  uploadedBy   User?   @relation(fields: [uploadedById], references: [id])

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([carrierId, category])
  @@map("carrier_attachments")
}

// ─── VEHICLES ───────────────────────────────────────────

model Vehicle {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId String  @db.Uuid
  carrier   Carrier @relation(fields: [carrierId], references: [id])

  plateNumber   String              // NrRej, unique per carrier
  active        Boolean   @default(true)
  addedAt       DateTime  @default(now())
  deactivatedAt DateTime?
  createdById   String?   @db.Uuid

  plannerId    String? @db.Uuid
  planner      User?   @relation("VehiclePlanner", fields: [plannerId], references: [id])
  dispatchTeamId String? @db.Uuid
  dispatchTeam   Team?   @relation(fields: [dispatchTeamId], references: [id])
  // ✅ Phase 11 (2026-06-17, миграция 20260617120000_phase11_team_dispatch):
  // dispatcherId ЗАМЕНЁН на dispatchTeamId (FK → Team). Модель `Team` и
  // `User.teamId` — в schema.prisma; их полные блоки в этот док ещё не
  // перенесены (см. docs/04 «Team» для целевой модели — она и реализована).

  notes        String?
  certificateL Boolean       // STRICT, TAK/NIE (was enum L1/L2/L3 until 2026-05)
  euro         EuroNorm      // STRICT
  // `adrClasses` (ADR class CSV→array) dropped 2026-06 — only the `adr`
  // boolean permit flag is kept; ADR cert scan lives on Driver.
  // `gps` boolean toggle dropped 2026-06-17 — every vehicle is GPS-tracked.
  fuelCard     Boolean       @default(false)
  type         VehicleType   // STRICT

  // country access permits — see docs/19-known-quirks.md (#vehicle-gb-it-fr)
  gb        Boolean?
  it        Boolean?
  fr        Boolean?
  agreement Boolean?  // Porozumienie — see #umowa-vs-porozumienie quirk
  // Guarantee Watchdog (план 2026-07-07) — date the km-guarantee was enabled.
  // API sets it on the agreement toggle (false/null→true ⇒ today; true→false ⇒
  // NULL). Watchdog anchor for a vehicle that never returned a delegation.
  agreementSince DateTime? @db.Date
  // legacy `contract` (Umowa) boolean dropped 2026-05 — the umowa scan is
  // now stored as VehicleAttachment rows with category=contract.

  // EUR/km rates — Optional everywhere (NULL = "not yet negotiated")
  rateDe     Decimal? @db.Decimal(6, 4)
  rateUe     Decimal? @db.Decimal(6, 4)
  rateExport Decimal? @db.Decimal(6, 4)
  rateImport Decimal? @db.Decimal(6, 4)

  wasteAllowed   Boolean  @default(false)
  wasteCountries String[]
  cabotageDe     Boolean  @default(false)
  cabotageFr     Boolean  @default(false)
  adr            Boolean  @default(false)  // ADR transport permit flag

  // tracker device id — STRICT (NOT NULL since 2026-06-17). Every vehicle is
  // GPS-tracked; the legacy `gps` toggle + CHECK vehicle_gps_device_when_gps_on
  // were dropped. Misnomer: it's NOT a phone number — see docs/19-known-quirks.md (#gpsMobilePhone)
  gpsMobilePhone     String
  // `nextInspectionDate` (NastepnyPrzeglad) dropped 2026-06 — inspection date
  // no longer tracked on the vehicle.
  sideNumber         String?
  // Auto-updated by delegation→zjechal — never expose as a manual UI field
  lastDroveAt        DateTime?

  delegations       Delegation[]
  claims            Claim[]
  attachments       VehicleAttachment[]
  dailyKm           VehicleDailyKm[]         // Phase 7 (#3) — daily km records (weryfikator)
  guaranteeEpisodes GuaranteeIdleEpisode[]   // Guarantee Watchdog — idle-episode journal

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([carrierId, plateNumber], name: "carrier_plate_unique")
  @@index([plannerId])
  @@index([dispatcherId])
  @@index([active, deletedAt])
  @@map("vehicles")
}

// ─── VEHICLE ATTACHMENTS (umowa / cabotage screenshots) ──
// Files uploaded from the Vehicle create/edit modal — scanned umowa,
// cabotage permits — stored in MinIO (S3-compatible). The DB row holds
// only metadata + the object key; the bytes live in the bucket.
model VehicleAttachment {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vehicleId String  @db.Uuid
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  category   VehicleAttachmentCategory
  storageKey String  // object key in MinIO: vehicles/<vehicleId>/<category>/<fileId>.<ext>
  fileName   String  // original upload filename
  mimeType   String
  size       Int     // bytes

  uploadedById String? @db.Uuid
  uploadedBy   User?   @relation(fields: [uploadedById], references: [id])

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime? // soft-delete — consistent with the global middleware

  @@index([vehicleId, category])
  @@map("vehicle_attachments")
}

// ─── DRIVERS ────────────────────────────────────────────

model Driver {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId String  @db.Uuid
  carrier   Carrier @relation(fields: [carrierId], references: [id])

  loginSlug           String   @unique
  firstName           String
  lastName            String
  phone               String
  phone2              String?
  // Drivers in PL trucking often skip email professionally — Optional everywhere
  email               String?
  // Generic identity-document number (passport, dowód osobisty, etc.).
  // Was `driverLicenseNumber` → `passportNumber` → `idDocumentNumber`
  // (renamed in-place 2026-06-01); driver's licence number is not tracked here.
  idDocumentNumber    String
  // API + UI required, DB nullable — UI surfaces a warning, not a hard block
  licenseExpiry       DateTime? @db.Date
  notes               String?
  active              Boolean  @default(true)
  addedAt             DateTime @default(now())
  adr                 Boolean  @default(false)  // ADR permit flag (świadectwo ADR)

  delegations Delegation[]
  attachments DriverAttachment[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([carrierId, active])
  @@map("drivers")
}

// ─── DRIVER ATTACHMENTS (świadectwo ADR) ────────────────
// Driver ADR certificate uploaded from the Driver create/edit view — stored
// in MinIO. DB row holds metadata + object key. Mirrors VehicleAttachment.
model DriverAttachment {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  driverId String @db.Uuid
  driver   Driver @relation(fields: [driverId], references: [id], onDelete: Cascade)

  category   DriverAttachmentCategory
  storageKey String  // object key in MinIO: drivers/<driverId>/<category>/<fileId>.<ext>
  fileName   String
  mimeType   String
  size       Int

  uploadedById String? @db.Uuid
  uploadedBy   User?   @relation(fields: [uploadedById], references: [id])

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([driverId, category])
  @@map("driver_attachments")
}

// ─── TRAILERS + TYPES ───────────────────────────────────

model Trailer {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId String  @db.Uuid
  carrier   Carrier @relation(fields: [carrierId], references: [id])

  plateNumber        String
  trailerTypeId      String      @db.Uuid          // STRICT (FK required)
  trailerType        TrailerType @relation(fields: [trailerTypeId], references: [id])
  active             Boolean     @default(true)
  addedAt            DateTime    @default(now())
  // `nextInspectionDate` dropped 2026-06 — inspection date no longer tracked
  // on the trailer.

  belts         Boolean?
  beltsCount    Int?     // liczba pasów (nullable; UI/Zod enforce >= 0)
  mats          Boolean?
  matsCount     Int?     // liczba mat (nullable; UI/Zod enforce >= 0)
  innerLength   Decimal? @db.Decimal(8, 2)
  innerWidth    Decimal? @db.Decimal(8, 2)
  innerHeight   Decimal? @db.Decimal(8, 2)
  capacity      Decimal? @db.Decimal(10, 2)
  airSuspension Boolean?
  certXl        Boolean? // XL certification (load securing per EN 12642-XL)
  multilock     Boolean? // multilock tie-down system
  notes         String?

  delegations Delegation[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([carrierId, plateNumber])
  @@map("trailers")
}

model TrailerType {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String    @unique
  shortCode   String?
  description String?
  active      Boolean   @default(true)
  trailers    Trailer[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@map("trailer_types")
}

// ─── CLAIMS (WNIOSEK) ───────────────────────────────────

model Claim {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nrZgl                String   @unique
  carrierId            String   @db.Uuid
  carrier              Carrier  @relation(fields: [carrierId], references: [id])
  vehicleId            String?  @db.Uuid
  vehicle              Vehicle? @relation(fields: [vehicleId], references: [id])
  vehiclePlateSnapshot String                      // STRICT — preserved if vehicle removed

  // period — all STRICT
  dateStart DateTime @db.Timestamp(0)
  dateEnd   DateTime @db.Timestamp(0)
  timeFrom  String                                  // STRICT (was nullable pre-Phase 3)
  timeTo    String                                  // STRICT

  // calculation — all STRICT (carrier supplies inputs at submit, server computes derived)
  drivenDays         Decimal @db.Decimal(6, 2)
  mileage            Decimal @db.Decimal(10, 2)
  kmPerDay           Decimal @db.Decimal(8, 2)
  kmGuaranteed       Decimal @db.Decimal(10, 2)
  kmDifference       Decimal @db.Decimal(10, 2)
  paymentEur         Decimal @db.Decimal(12, 2)
  ratePerKmEffective Decimal @db.Decimal(6, 4)
  breakdown          Json?

  // workflow — see claim-state-machine.ts for legal transitions
  status          ClaimStatus @default(NA_WERYFIKACJI)
  statusChangedAt DateTime?
  decidedById     String?     @db.Uuid
  decidedBy       User?       @relation("ClaimDecidedBy", fields: [decidedById], references: [id])

  // Verification checkpoint («Zapisz weryfikację», migration
  // 20260706120000_claim_verification_checkpoint). Pracownik saves corrections
  // BEFORE any decision; `verifiedAt` = when confirmed. Decisions + the auth
  // request FROM NA_WERYFIKACJI are gated (422 CLAIM_NOT_VERIFIED) until set.
  // Reset to NULL by the delegation auto-recalc (data changed → re-verify).
  // `verifiedBy` mirrors `decidedBy` (optional FK, no index).
  verifiedAt   DateTime?
  verifiedById String?   @db.Uuid
  verifiedBy   User?     @relation("ClaimVerifiedBy", fields: [verifiedById], references: [id])

  comment     String?
  // status-conditional: NULL on submit; CHECK claim_accepted_payment_complete
  // forces non-empty when status=ZAAKCEPTOWANO
  orderNumber String?
  orderDate   DateTime? @db.Date

  authorizationRequired    Boolean   @default(false)
  authorizationDescription String?
  authorizationToken       String?
  authorizationDecidedAt   DateTime?

  amountRequested Decimal  @db.Decimal(12, 2)       // STRICT — carrier supplies at submit
  amountApproved  Decimal? @db.Decimal(12, 2)       // status-conditional via CHECK
  margin          Decimal? @db.Decimal(12, 2)
  amountMaximum   Decimal? @db.Decimal(12, 2)       // KwotaMaksima (Maksim override)

  // reklamacja "frozen mirror" — see docs/19-known-quirks.md (#reklamacja-mirror)
  reklamacjaSubmitted    Boolean      @default(false)
  reklamacjaText         String?
  reklamacjaResponse     String?
  reklamacjaAmount       Decimal?     @db.Decimal(12, 2)
  // KorektaGodzin — split into immutable carrier snapshot + verifier-mutable
  // applied value. See "Korekta godzin — orig vs applied" below.
  origHoursAdjusted      Decimal?     @db.Decimal(5, 2)
  hoursAdjustedValue     Decimal?     @db.Decimal(5, 2)
  statusBeforeReklamacja ClaimStatus?
  origDateStart          DateTime?
  origDateEnd            DateTime?
  origMileage            Decimal?     @db.Decimal(10, 2)
  // Immutable submit-time payment snapshot (migration
  // 20260706120000_claim_verification_checkpoint). Write-once alongside the
  // other orig* fields; never mutated by the verifier PATCH / checkpoint. Feeds
  // the authorization-email «Korekty weryfikatora» diff (orig dopłata vs
  // applied amountRequested).
  origPaymentEur         Decimal?     @db.Decimal(12, 2)
  // GodzinaOd/GodzinaDo — immutable carrier-submission snapshots (HH:MM legacy
  // string). Mirror timeFrom/timeTo, written once at submit, verifier PATCH
  // never mutates. See "Korekta godzin — orig vs applied" / orig-snapshot note.
  origTimeFrom           String?
  origTimeTo             String?

  authScreenshotUrl String?
  attachments       ClaimAttachment[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  // REWORK 2026-06-20 (#4, docs/20 §0″) — wniosek↔wyjazd link.
  delegationId             String?              @db.Uuid         // FK → Delegation, unique; required for new claims (app-level)
  delegation               Delegation?          @relation(fields: [delegationId], references: [id])
  periodAdjustedByVerifier Boolean              @default(false)  // true once pracownik edits dateStart/dateEnd — gates auto-recalc on zjechal
  autoRecalcState          ClaimAutoRecalcState @default(none)   // explicit result of the zjechal auto-recalc; read directly by FE

  @@unique([delegationId])
  @@index([carrierId, status])
  @@index([carrierId, deletedAt])           // Phase 3 — carrier-panel "list my claims"
  @@index([vehicleId])
  @@index([status, statusChangedAt])
  @@index([dateStart])
  @@map("claims")
}

model ClaimAttachment {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claimId      String   @db.Uuid
  claim        Claim    @relation(fields: [claimId], references: [id], onDelete: Cascade)
  url          String
  mimeType     String?
  size         Int?
  uploadedById String?  @db.Uuid
  createdAt    DateTime @default(now())
  @@map("claim_attachments")
}

// ─── DELEGATIONS ────────────────────────────────────────

model Delegation {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vehicleId String  @db.Uuid
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id])
  trailerId String  @db.Uuid                                            // STRICT (2026-05)
  trailer   Trailer @relation(fields: [trailerId], references: [id])
  driverId  String  @db.Uuid                                            // STRICT (2026-05)
  driver    Driver  @relation(fields: [driverId], references: [id])
  carrierId String  @db.Uuid
  carrier   Carrier @relation(fields: [carrierId], references: [id])

  driverNameSnapshot  String?
  driverPhoneSnapshot String?

  // departure — STRICT
  departureAt         DateTime
  departureCountry    String
  departurePostalCode String

  // return planning — STRICT at submit (2026-05 product decision; was DB
  // nullable + CHECK delegation_returned_complete prior to migration
  // 20260518113943_delegation_required_fields_and_date_only). plannedReturnAt
  // is `@db.Date` (date-only) — driver commits to a day, not an hour.
  // CHECKs `delegation_return_country_length` (2..8 chars, covers VIES `EL`)
  // and `delegation_return_postal_code_length` (≤16 chars) live at the DB
  // level; country-specific postal-format validation is in shared Zod.
  plannedReturnAt  DateTime @db.Date
  returnCountry    String
  returnPostalCode String

  status            DelegationStatus @default(zgloszony)               // REWORK 2026-06-20: eksport→gotowy, weryfikator→w_trasie/zjechal
  actualDepartureAt DateTime?                                          // date-only, set on markInTransit (w_trasie) — verifier's actual departure date
  actualReturnAt    DateTime?                                          // date-only, set on markReturned (zjechal) → also bumps Vehicle.lastDroveAt

  // REWORK 2026-06-20 (#4) — wniosek↔wyjazd link (one claim per delegation).
  claim Claim?

  // Guarantee Watchdog — episodes this delegation resolved (a reported wyjazd
  // closes an open idle episode). Back-relation of resolvedByDelegation.
  resolvedGuaranteeEpisodes GuaranteeIdleEpisode[] @relation("GuaranteeEpisodeResolvedBy")

  reportedById String?   @db.Uuid
  reportedBy   User?     @relation("DelegationReporter", fields: [reportedById], references: [id])
  reportedAt   DateTime  @default(now())
  verifiedById String?   @db.Uuid
  verifiedBy   User?     @relation("DelegationVerifier", fields: [verifiedById], references: [id])
  verifiedAt   DateTime?

  notes String?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([vehicleId, status])
  @@index([carrierId, status])
  @@index([carrierId, deletedAt, status])      // Phase 3 — carrier-panel
  @@index([status, departureAt])
  @@map("delegations")
}

// ─── VEHICLE ROUTE STATUS LOG (Phase 7 — weryfikator) ───
// Append-only history of operational route-status stamps for a vehicle.
// `weryfikator` records each vehicle's DAILY km (external means: SpedTrans+GPS).
// One row per (vehicle, day) — upsert. state=drove ⇒ km>0; state=idle ⇒ km null
// ("checked, stood"); NO row for a day = "not checked" (nieznany). Derived motion
// status (w_ruchu/nie_jezdzi/nieznany) computed at read time, NOT stored — no
// status column on Vehicle. `source=gps` rows have no `notedById`. On a drove-row
// the api also bumps `Vehicle.lastDroveAt = max(lastDroveAt, date)` (same txn).
// Claim mileage is derived as Σ km (state=drove) over the period — NO Claim↔Delegation FK.
model VehicleDailyKm {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vehicleId String  @db.Uuid
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  date      DateTime @db.Date
  km        Int?                                  // null when state=idle
  state     VehicleDayState
  source    VehicleStatusSource @default(manual)
  notedById String?  @db.Uuid                     // nullable — gps has no user
  notedBy   User?    @relation("DailyKmNotedBy", fields: [notedById], references: [id])
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([vehicleId, date])                     // one stamp per vehicle/day (upsert)
  @@index([date])                                 // weekly board
  @@map("vehicle_daily_km")
}

// ─── GUARANTEE IDLE EPISODE (Guarantee Watchdog — write layer) ──
// Append-only journal of the "bad" guarantee cycles for a guaranteed vehicle
// (Vehicle.agreement=true). A row is created on the FIRST escalation event of a
// cycle (D-3 / D-1 / violation), holds the fixed deadline + per-mail dedup
// flags, and (once closed) the resolution outcome. Compliant cycles create NO
// row. The live board/banner is computed statelessly from delegations; this
// table dedups reminder emails and durable-fixes violations. See план §2/§3.
// NO deletedAt — append-only journal; the soft-delete extension ignores models
// not in its allowlist. The "one open episode per vehicle" invariant is a
// PARTIAL UNIQUE index (state <> 'resolved') hand-added in the migration.
model GuaranteeIdleEpisode {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vehicleId     String   @db.Uuid            // scope of the episode
  vehicle       Vehicle  @relation(fields: [vehicleId], references: [id])
  carrierId     String   @db.Uuid            // denormalized for board/opiekun scope
  carrier       Carrier  @relation(fields: [carrierId], references: [id])

  anchorAt      DateTime @db.Date            // cycle anchor (last return / agreementSince)
  anchorSource  GuaranteeAnchorSource
  deadlineAt    DateTime @db.Date            // fixed at row creation (anchor + 10 working days)
  state         GuaranteeEpisodeState

  reminder3SentAt DateTime?                  // dedup D-3
  reminder1SentAt DateTime?                  // dedup D-1
  violationSentAt DateTime?                  // dedup "violation" section in opiekun digest
  violatedAt      DateTime?                  // stamped when deadline first crossed

  resolvedAt             DateTime?
  resolvedByDelegationId String?     @db.Uuid
  resolvedByDelegation   Delegation? @relation("GuaranteeEpisodeResolvedBy", fields: [resolvedByDelegationId], references: [id])
  resolvedDaysLeft       Int?                // daysLeft at close; < 0 = closed late
  resolvedReason         GuaranteeResolveReason?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([carrierId, state])
  @@index([vehicleId, state])
  @@map("guarantee_idle_episodes")
  // + PARTIAL UNIQUE (raw SQL in migration):
  //   CREATE UNIQUE INDEX "GuaranteeIdleEpisode_open_vehicle_key"
  //     ON "guarantee_idle_episodes"("vehicleId") WHERE "state" <> 'resolved';
}

// ─── LIMITS, AUDIT, REFRESH, CONFIG, CLAIM-SEQUENCE ─────

model MonthlyLimit {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  year      Int
  month     Int
  kmPerDay  Decimal? @db.Decimal(8, 2)        // NULL → fallback 540 — see docs/19-known-quirks.md
  ratePerKm Decimal? @db.Decimal(6, 4)        // NULL → fallback 0.5
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([year, month])
  @@map("monthly_limits")
}

model AuditLog {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String? @db.Uuid
  user       User?   @relation(fields: [userId], references: [id])
  userRole   Role?
  action     String
  targetType String?
  targetKey  String?
  before     Json?
  after      Json?
  reason     String?
  metadata   Json?
  ipAddress  String? @db.Inet
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([targetType, targetKey])
  @@index([action])
  @@index([createdAt])
  @@map("audit_log")
}

model RefreshToken {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String        @db.Uuid
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String        @unique  // SHA-256 hex
  expiresAt    DateTime
  revokedAt    DateTime?
  ipAddress    String?       @db.Inet
  userAgent    String?
  // theft-detection chain
  replacedById String?       @unique @db.Uuid
  replacedBy   RefreshToken? @relation("RefreshTokenReplacement", fields: [replacedById], references: [id])
  replaces     RefreshToken? @relation("RefreshTokenReplacement")
  createdAt    DateTime      @default(now())
  @@index([userId])
  @@index([tokenHash])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model AppConfig {
  key         String   @id
  value       String
  description String?
  updatedAt   DateTime @updatedAt
  @@map("app_config")
}

// ClaimSequence — atomic NrZgl numbering (see NrZglService).
model ClaimSequence {
  yearMonth  String   @id    // 'YY-MM' e.g. '26-05'
  lastNumber Int      @default(0)
  updatedAt  DateTime @updatedAt
  @@map("claim_sequences")
}
```

## Korekta godzin — orig vs applied

`Claim.origHoursAdjusted` is set once at submit (immutable snapshot of what the
carrier entered) and is never mutated afterwards — it powers the History tab,
the verifier "carrier claimed X" hint, and audit-trail diff detection.
`Claim.hoursAdjustedValue` starts equal to `origHoursAdjusted` at submit and is
the only column the verifier PATCH may overwrite; it is the value that drives
km-calc (`korektaDni = hoursAdjustedValue / 24`). Both are `Decimal(5,2)?` —
`NULL` means "no data" (legacy/unset rows), while `0` means "carrier
explicitly entered zero downtime". For new submits the api layer always
populates both columns.

The same orig-vs-working split applies to the declared time window.
`Claim.origTimeFrom`/`Claim.origTimeTo` are immutable `String?` snapshots
(HH:MM legacy strings) of what the carrier submitted; they are written once at
submit and the verifier (pracownik) PATCH never mutates them — identical
semantics to `origDateStart`/`origDateEnd`/`origMileage`. The editable working
values live in `timeFrom`/`timeTo` (both strict `NOT NULL`), which the verifier
PATCH may overwrite. `NULL` on the orig columns means "no snapshot" (legacy/unset
rows). These columns power the History tab + audit-trail diff detection that
shows whether the verifier overrode the carrier's declared hours.

## Required-field classification (per the three-layer pattern)

> Резюме что закрыто на каком слое. Поля, не упомянутые ниже, помечаются как Optional everywhere (UI/API не требуют, DB nullable).

### Carrier

| Поле | Слой защиты | Notes |
|---|---|---|
| `contactPerson`, `phone`, `ordersEmail`, `accountEur`, `companyAddress` | Strict everywhere | DB NOT NULL |
| `paymentTerms` | Strict everywhere (DB default 30) | |
| `insuranceValue` | Strict everywhere | DB NOT NULL; Zod adds `> 0` |
| `insuranceExpiry`, `licenseExpiry` | API + UI required, DB nullable | Allows admin/opiekun create when certificate copies not in hand |
| `nip`, `vatId`, `accountPln`, `numberOfVehicle`, `company` | Optional everywhere | At least one of (nip, vatId) — backlog CHECK, see #19 quirks |

### Vehicle

| Поле | Слой защиты | Notes |
|---|---|---|
| `plateNumber`, `certificateL`, `euro`, `type`, `gpsMobilePhone` | Strict everywhere | DB NOT NULL. `gpsMobilePhone` made NOT NULL 2026-06-17 (legacy `gps` toggle + CHECK `vehicle_gps_device_when_gps_on` dropped — every vehicle is GPS-tracked). |
| `rateDe`, `rateUe`, `rateExport`, `rateImport` | Optional everywhere | NULL = "not negotiated yet"; 0 would be ambiguous |
| `gb`, `it`, `fr`, `agreement`, `lastDroveAt`, `notes`, etc. | Optional everywhere | |

### Driver

| Поле | Слой защиты | Notes |
|---|---|---|
| `firstName`, `lastName`, `phone`, `idDocumentNumber`, `loginSlug` | Strict everywhere | `idDocumentNumber` was `driverLicenseNumber` → `passportNumber` → `idDocumentNumber` (renamed in-place 2026-06-01); holds any identity-document number (passport, dowód osobisty, etc.). |
| `licenseExpiry` | API + UI required, DB nullable | Driver must legally have it; UI warns rather than blocks at registration |
| `email`, `phone2`, `notes` | Optional everywhere | Email rare in PL trucking |

### Trailer

| Поле | Слой защиты | Notes |
|---|---|---|
| `plateNumber`, `trailerTypeId` | Strict everywhere | FK to TrailerType is required |
| Все остальные характеристики | Optional everywhere | |

### Claim

| Поле | Слой защиты | Notes |
|---|---|---|
| `nrZgl`, `carrierId`, `vehiclePlateSnapshot`, `dateStart`, `dateEnd`, `timeFrom`, `timeTo` | Strict everywhere | |
| `drivenDays`, `mileage`, `kmPerDay`, `kmGuaranteed`, `kmDifference`, `paymentEur`, `ratePerKmEffective` | Strict everywhere | Derived by server at submit |
| `amountRequested` | Strict everywhere | Carrier always supplies at submit |
| `orderNumber`, `orderDate`, `amountApproved` | DB nullable + CHECK `claim_accepted_payment_complete` | Required when `status='ZAAKCEPTOWANO'` |
| `amountMaximum` | Optional (set in Maksim override path) | See quirks #5 |
| `decidedById`, `comment`, `breakdown`, `authScreenshotUrl`, reklamacja mirror fields | Optional everywhere | |

### Delegation

| Поле | Слой защиты | Notes |
|---|---|---|
| `vehicleId`, `carrierId`, `trailerId`, `driverId`, `departureAt`, `departureCountry`, `departurePostalCode` | Strict everywhere | `trailerId`/`driverId` made NOT NULL in 2026-05 (a delegation without trailer or driver doesn't model a real haul). |
| `plannedReturnAt`, `returnCountry`, `returnPostalCode` | Strict everywhere | NOT NULL since `20260518113943_delegation_required_fields_and_date_only`; `plannedReturnAt` is `@db.Date` (no time). DB length CHECKs on country (2..8) + postal (≤16); format validation in shared Zod. |
| `actualDepartureAt` | DB nullable | Departure-side analogue of `actualReturnAt`. Set by the `markInTransit` transition on `w_trasie` (verifier's actual departure date). API layer enforces presence when `status='w_trasie'`; no DB CHECK because the column flips together with `status` inside a single service transaction (see "Invariants for api-agent"). |
| `actualReturnAt` | DB nullable | Set by `markReturned` transition on `zjechal`. API layer enforces presence when `status='zjechal'`; no DB CHECK because the column flips together with `status` inside a single service transaction (see "Invariants for api-agent"). |
| `notes`, snapshots | Optional everywhere | |

### User

| Поле | Слой защиты | Notes |
|---|---|---|
| `login`, `email`, `role` | Strict everywhere | DB NOT NULL + UNIQUE on login/email |
| `passwordHash` | Optional (DB nullable) | Allows future email-only auth flow |
| `liderEmail` | Optional everywhere; per-role tech debt — see docs/19-known-quirks.md (#liderEmail) |  |

## Соответствие колонок Sheets → поля Prisma

> Эти таблицы — справочное, чтобы при чтении `Code.gs`/`index.html` (которые работают через `row[N]` индексы) понимать какому Prisma-полю соответствует каждая колонка. Полезно при портировании бизнес-логики.

### WNIOSEK → Claim

| Sheets col | Sheets поле | Prisma поле | Тип |
|---|---|---|---|
| A | NrZgl | `nrZgl` | String unique |
| B | Przewoznik (nazwa) | → FK `carrierId` | через lookup |
| C | Pojazd (NrRej) | → FK `vehicleId` + `vehiclePlateSnapshot` | UUID + String |
| D | DataStart | `dateStart` | Timestamp |
| E | DataStop | `dateEnd` | Timestamp |
| F | GodzinaOd | `timeFrom` + `origTimeFrom` | String "HH:MM" — working + immutable submit-snapshot |
| G | GodzinaDo | `timeTo` + `origTimeTo` | String — working + immutable submit-snapshot |
| H | DniJezdne | `drivenDays` | Decimal(6,2) |
| I | Przebieg | `mileage` | Decimal(10,2) |
| J | KmNaD | `kmPerDay` | Decimal(8,2) |
| K | KmGwarant | `kmGuaranteed` | Decimal |
| L | Roznica | `kmDifference` | Decimal |
| M | Doplata | `paymentEur` | Decimal(12,2) |
| N | Status | `status` | enum ClaimStatus |
| O | Komentarz | `comment` | String |
| P | NrZlecenia | `orderNumber` | String |
| Q | DataZlecenia | `orderDate` | Date |
| Y | Opiekun (имя) | → derived из carrier.opiekun | — |
| AE | Autoryzacja | `authorizationRequired` | Boolean |
| AF | OpisAutoryzacji | `authorizationDescription` | String |
| AG | TokenAutoryzacji | `authorizationToken` | String |
| AH | DataAutoryzacji | `authorizationDecidedAt` | DateTime |
| AI | DataZmianyStatusu | `statusChangedAt` | DateTime |
| AJ | KwotaWnioskowana | `amountRequested` | Decimal |
| AK | ReklamacjaZlozona | `reklamacjaSubmitted` | Boolean |
| AL | ReklamacjaTresc | `reklamacjaText` | String |
| AM | OdpMagtrans | `reklamacjaResponse` | String |
| AN | KwotaReklamacji | `reklamacjaAmount` | Decimal |
| AO | ZatwKwota | `amountApproved` | Decimal |
| AP | KorektaGodzin | `origHoursAdjusted` + `hoursAdjustedValue` | Decimal(5,2)?, оба маппятся из одной legacy-колонки |
| AQ | StatusPrzedReklamacja | `statusBeforeReklamacja` | enum |
| AR | OrigData | `origDateStart`/`origDateEnd` | Timestamp (расщепляем) |
| AT | OrigPrzebieg | `origMileage` | Decimal |
| AW | Marża | `margin` | Decimal |
| AX | KwotaMaksima | `amountMaximum` | Decimal |

Дополнительно в Claim, не имеющего колонки в Sheets: `breakdown` (JSON, помесячный расчёт), `ratePerKmEffective`, `decidedById`, `authScreenshotUrl`, `verifiedAt`/`verifiedById` (checkpoint «Zapisz weryfikację»), `origPaymentEur` (immutable submit-time payment snapshot).

### AUTA → Vehicle

| Col | Sheets | Prisma |
|---|---|---|
| A | LoginPrzewoznika | → FK `carrierId` (через user.carrierProfile) |
| B | NrRej | `plateNumber` |
| C | Aktywne | `active` |
| D | DataDodania | `addedAt` |
| E | DataDezaktywacji | `deactivatedAt` |
| F | UtworzonePrzez | `createdById` |
| G | Planista (имя) | → FK `plannerId` (lookup user) |
| I-K | Marka, Model, Rok | dropped 2026-06 — brand/model/year no longer tracked on the vehicle |
| L | Uwagi | `notes` |
| M | CertyfikatL | `certificateL` (Boolean — was enum L1/L2/L3 до 2026-05) |
| N | EURO | `euro` |
| O | ADR (CSV) | dropped 2026-06 — only `adr` boolean permit flag kept (ADR class list removed) |
| P-R | GPS, KartaPaliwowa, Typ | `gps` dropped 2026-06-17 (every vehicle GPS-tracked); `fuelCard`, `type` |
| S | Dyspozytor (login) | → FK `dispatchTeamId` → `Team` (✅ Phase 11 реализована: команда вместо одиночного `dispatcherId` — см. [04-data-model.md](04-data-model.md) «Team») |
| T-W | GB, IT, FR, Porozumienie | `gb`, `it`, `fr`, `agreement` |
| X | Umowa | dropped 2026-05 — umowa scan stored as `VehicleAttachment` (category=contract) |
| Y-AB | StawkaDE, StawkaUE, StawkaEksport, StawkaImport | `rateDe`, `rateUe`, `rateExport`, `rateImport` |
| AC | Odpady | `wasteAllowed` |
| AD | OdpadyKraje (CSV) | `wasteCountries[]` |
| AE-AF | KabotazDE, KabotazFR | `cabotageDe`, `cabotageFr` |
| AG | GPSMobNr | `gpsMobilePhone` |
| AH | NastepnyPrzeglad | dropped 2026-06 — inspection date no longer tracked |
| AI | NrBoczny | `sideNumber` |
| AJ | OstatnioJezdzilo | `lastDroveAt` |

Поле `Wyposazenie` (col H в Sheets) — legacy в `index.html`, в Postgres не делаем.

### KIEROWCY → Driver

| Col | Sheets | Prisma |
|---|---|---|
| A | Login | `loginSlug` |
| B | Imie | `firstName` |
| C | Nazwisko | `lastName` |
| D | PrzewoznikLogin | → FK `carrierId` |
| E | Telefon | `phone` |
| F | Email | `email` |
| G | NrPaszportu (legacy NrPrawaJazdy) | `idDocumentNumber` |
| H | Aktywny | `active` |
| I | DataDodania | `addedAt` |
| J | PrawoJazdyWaznosc | `licenseExpiry` |
| K | Telefon2 | `phone2` |
| M | Uwagi | `notes` |

### NACZEPY → Trailer

24 колонки → поля Trailer (см. schema). `TypNaczepy` (col C) → FK `trailerTypeId`.

### NACZEPY_TYPY → TrailerType

| Col | Sheets | Prisma |
|---|---|---|
| A | Nazwa | `name` |
| B | Skrot | `shortCode` |
| C | Opis | `description` |
| D | Aktywna | `active` |

### DELEGACJE → Delegation

20 колонок → поля Delegation (см. schema).

### LIMITY KM → MonthlyLimit

Из «широкой» структуры (год × колонки месяцев) делаем «длинную»: одна строка = (год, месяц, km/day, eur/km). Каждый год → 12 строк.

### Auth-листы (ADMIN/PRACOWNIK/OPIEKUN/PLANISCI/DYSPOZYTOR/EKSPORT/WERYFIKATOR/UZYTKOWNICY) → User + Carrier

8 листов в Sheets — это 8 таблиц с одинаковой структурой, отличаются только `Rola`. В новой схеме это **одна таблица `users`** с полем `role: Role`. Для перевозчика расширенные поля (NIP, IBAN, OpiekunLogin, **Firma/company** и т.д.) живут в отдельной таблице `Carrier`, связанной с `User` 1:1. Это дедупликация структуры.

> ⚠️ Поле `Firma/company` исторически жило на `users` (денормализация из GAS-листов). В Phase 3 миграция `20260507223021_move_company_to_carrier` перенесла его на `Carrier` (только przewoznik когда-либо имел не-NULL значение). Аналогичный pending-cleanup существует для `User.liderEmail` — see docs/19-known-quirks.md (#liderEmail).

Пароли в новой схеме всегда bcrypt-hash (никогда plaintext). Поле `passwordHash` в `User` — nullable, чтобы можно было перейти на email-only auth (см. [15-auth-strategy.md](15-auth-strategy.md)).

### OPIEKUNOWIE (legacy)

**Не реализуем.** В Sheets это дубль `OPIEKUN` с 3 колонками вместо 6 — историческая path. В новой схеме одна модель `User` с `role=opiekun`.

### GWARANCJA (legacy)

**Не реализуем.** Не использовался активно даже в Code.gs.

## Индексы — стратегия

Под главные горячие запросы (см. [13-api-design.md](13-api-design.md)):

| Запрос | Индекс |
|---|---|
| `getAllClaims` фильтр по статусу | `claims(status, statusChangedAt)` |
| `getClaimsForCarrier` (статус-фильтр) | `claims(carrierId, status)` |
| Carrier-panel "list my claims" (без status-фильтра) | `claims(carrierId, deletedAt)` — Phase 3 |
| `getMyFleet` авто перевозчика | `vehicles(active, deletedAt)` (+ FK на carrier) |
| Активные авто планисты | `vehicles(plannerId)` |
| Делегации авто | `delegations(vehicleId, status)` |
| Carrier delegations list (через soft-delete middleware) | `delegations(carrierId, deletedAt, status)` — Phase 3 |
| Watchdog-борд опекуна/админа (по перевозчику + state) | `guarantee_idle_episodes(carrierId, state)` |
| Watchdog per-машина (ensure-эпизод, история) | `guarantee_idle_episodes(vehicleId, state)` |
| «≤1 открытый эпизод на машину» (write-инвариант) | PARTIAL UNIQUE `guarantee_idle_episodes(vehicleId) WHERE state <> 'resolved'` |
| Audit по target | `audit_log(targetType, targetKey)` |

## Soft-delete vs hard-delete

| Сущность | Стратегия |
|---|---|
| User | soft (чтобы сохранить FK в audit, claims) |
| Carrier | soft + каскад на vehicles/drivers/trailers (тоже soft) |
| Vehicle | soft (FK с claims/delegations) |
| Driver/Trailer | soft |
| Claim | soft, никогда не удаляем (compliance) |
| Delegation | soft |
| GuaranteeIdleEpisode | append-only журнал, `deletedAt` нет; не в allowlist soft-delete-extension → extension его не трогает (закрытие эпизода = `state='resolved'` + `resolvedReason`, не удаление) |
| RefreshToken | hard (по `expiresAt < now()`) |
| AuditLog | append-only, никогда не удаляем |

Реализация: глобальный middleware Prisma, который добавляет `WHERE deleted_at IS NULL` ко всем `find*`/`update*`/`delete*` (последний переписывается в `update { deletedAt: now() }`). Включается только для моделей с полем `deletedAt`.

## Миграции

Создаются через `prisma migrate dev --name <descriptive>`. **Применённые миграции в хронологическом порядке** (на момент конца Phase 3):

| Миграция | Что |
|---|---|
| `20260430114433_init` | Phase 1 — `User`, `RefreshToken`, `AppConfig`. Минимум для auth/2FA/JWT. |
| `20260503203801_entities` | Phase 2 — добавляет весь домен: `Carrier`, `Vehicle`, `Driver`, `Trailer`, `TrailerType`, `Claim`, `ClaimAttachment`, `Delegation`, `MonthlyLimit`, `AuditLog`, `ClaimSequence`. На этом этапе многие поля nullable (UI ещё не закрыт). |
| `20260504123808_phase2_required_fields_carrier_driver_trailer` | Подтягивает базовые контакты и ID-поля до NOT NULL после стабилизации UI. |
| `20260506205557_phase3_indexes` | Hot-path индексы: `claims(carrierId, deletedAt)` и `delegations(carrierId, deletedAt, status)` для carrier-panel списков, проходящих через soft-delete middleware. |
| `20260507191424_phase3_blocks` | Strict-everywhere перевод: NOT NULL на базовый профиль `Carrier` (contactPerson/ordersEmail/accountEur/companyAddress/...), расчётные поля `Claim` (timeFrom/timeTo/drivenDays/mileage/...), driver email/license/bank, vehicle certificateL/euro/type/rates, departure-fields на delegations. **Добавляет CHECK constraints:** `claim_accepted_payment_complete` (orderNumber+orderDate+amountApproved при ZAAKCEPTOWANO) и `vehicle_gps_device_when_gps_on` (gpsMobilePhone при gps=true). |
| `20260507195536_phase3_blocks_audit_revert` | Откатывает несколько слишком-агрессивных NOT NULL-ов из предыдущей миграции (insurance/license carrier, plannedReturn delegation, email/license/bank driver, rates vehicle, password user) — поля возвращаются в DB-nullable, обязательность остаётся на API+UI. **Закрепляет** `amountRequested` как DB NOT NULL и **добавляет** CHECK `delegation_returned_complete` (actualReturnAt+returnCountry+returnPostalCode при `zjechal`). |
| `20260507223021_move_company_to_carrier` | Переносит поле `company` (Firma) с `users` на `carriers`. Денормализация-наследие GAS-миграции; внутренние сотрудники MAGTRANS никогда company не имели. ADD column → BACKFILL через carrier↔user 1:1 → DROP source — порядок безопасен на непустой БД. |
| `20260508115947_carrier_nip_vat_required` | NOT NULL на `carriers.nip` и `carriers.vatId`. Налоговые ID требуются на момент создания: PL-перевозчики дают 10-значный NIP, иностранные — локальный TIN; `vatId` — EU VAT с префиксом страны. (Позже частично откатано: см. `20260515112821_carrier_vat_id_optional` — `vatId` снова nullable.) |
| `20260508194914_phase3_insurance_value_required` | NOT NULL на `carriers.insuranceValue`. Без OCP-страховки перевозчик не может ехать; `insuranceExpiry`/`licenseExpiry` остаются nullable (могут не быть копий на момент онбординга). Бэкфилл `0` для stale-dev-строк перед SET NOT NULL — Zod на API enforce'ит `> 0`, поэтому 0 не переживает round-trip через create/update. |
| `20260515112821_carrier_vat_id_optional` | DROP NOT NULL с `carriers.vatId`. Продуктовое решение: EU VAT перестаёт быть обязательным — некоторые перевозчики регистрируются без VAT-UE и работают только с локальным NIP/TIN. `nip` остаётся NOT NULL. |
| `20260515130307_vehicle_certificate_l_to_boolean` | Конвертирует `vehicles.certificateL` из enum `CertificateL { L1 \| L2 \| L3 }` в `Boolean NOT NULL`. Маппинг: `L1`/`L2`/`L3` → `true`, всё прочее → `false`. Шаги: ADD temp boolean с дефолтом `false` → BACKFILL через CASE → DROP старой enum-колонки → RENAME temp → DROP DEFAULT → DROP TYPE `CertificateL`. Имя поля сохранено. Продуктовое решение: три шумовых класса не используются — нужен только TAK/NIE флаг. |
| `20260518113943_delegation_required_fields_and_date_only` | Hard-wipe + tightening on `delegations`. TRUNCATE (user-confirmed; no backfill — fields are user-supplied planning data, not derivable), затем SET NOT NULL на `trailerId`, `driverId`, `plannedReturnAt`, `returnCountry`, `returnPostalCode`. `plannedReturnAt` меняет тип с `TIMESTAMP(3)` на `DATE` (день, без часа). DROP CHECK `delegation_returned_complete` (становится излишним — три из четырёх полей теперь NOT NULL безусловно; `actualReturnAt` остаётся nullable, его связь со статусом enforce'ит API в одной транзакции с переходом). ADD CHECK `delegation_return_country_length` (2..8 chars, чтобы вместить VIES-специфичный `EL` вместо `GR`) и `delegation_return_postal_code_length` (≤16 chars). |
| `20260521135930_vehicle_attachments_euro_v_vi_destinations` | Vehicle-modal feature. **Enum `EuroNorm`** сужен с `{III, IV, V, VI}` до `{V, VI}` — km-гарантийная программа ограничена EURO V/VI; БД greenfield, поэтому пересоздание типа безопасно. **`vehicles.contract`** (legacy Umowa boolean) удалён — скан умовы теперь хранится как строки `VehicleAttachment` с `category=contract`. **`vehicles.destinationCountries`** — новый `String[]` (ISO-3166-1 alpha-2; allowed-set валидируется в shared/Zod). Новый enum `VehicleAttachmentCategory { contract, cabotage_de, cabotage_fr }`. Новая таблица **`vehicle_attachments`** — метаданные файлов (umowa/cabotage скриншоты), сами байты в MinIO; FK на `vehicles` с `ON DELETE CASCADE`, FK на `users` (uploadedBy, nullable, `ON DELETE SET NULL`), soft-delete `deletedAt`, индекс `(vehicleId, category)`. |
| `20260522120000_drop_vehicle_destination_countries_and_driver_bank_account` | Деструктивный `DROP COLUMN`: удаляет `vehicles.destinationCountries` (Kraje docelowe) и `drivers.bankAccount` (konto bankowe) — оба поля выпилены из продукта по продуктовому решению. Существующие значения теряются (подтверждено). `wasteCountries` не затронут. |
| `20260525075517_vehicle_adr_trailer_certxl_multilock` | Чисто аддитивная миграция. `vehicles.adr` — `BOOLEAN NOT NULL DEFAULT false` (ADR permit flag, рядом с `cabotageDe`/`cabotageFr`). `trailers.certXl` и `trailers.multilock` — `BOOLEAN NULL` (трёх-состояние, как у соседних `belts`/`mats`/`airSuspension`). Enum `VehicleAttachmentCategory` получает значение `adr` (для ADR-сертификатов в vehicle-modal). Никаких DROP/ALTER на существующих колонках. |
| `20260525084144_trailer_drop_equipment_and_loading_fields_add_belts_mats_count` | Деструктивная миграция на `trailers` (user-confirmed; dev-only data). **DROP COLUMN** на 6 полей: `equipment` (free-text), `slidingRoof`, `edschaSlidingRoof`, `loadFromBack`, `loadFromSide`, `loadFromTop` (boolean-флаги способа załadunku — выпилены из продукта). **ADD COLUMN** `beltsCount INTEGER NULL` (рядом с `belts`) и `matsCount INTEGER NULL` (рядом с `mats`) — счётчики, дополняющие boolean-флаги. Без `@default`, без CHECK `> 0` — UI/Zod enforce'ит `>= 0`. |
| `20260528120000_driver_rename_license_to_passport` | Переименование `drivers.driverLicenseNumber` → `passportNumber` (ALTER TABLE … RENAME COLUMN, без потери данных). Семантика колонки меняется на номер паспорта; срок действия водительского (`licenseExpiry`) остаётся отдельным полем. |
| `20260529120000_attachments_driver_carrier_and_drop_vehicle_adr_category` | Per-entity attachment расширение + удаление vehicle ADR-категории. **Change 1:** значение `adr` удалено из enum `VehicleAttachmentCategory` (остаётся `{contract, cabotage_de, cabotage_fr}`). Postgres не умеет `DROP VALUE` in-place → тип пересоздаётся (`CREATE TYPE …_new` → `ALTER COLUMN … USING ::text::…` → RENAME → DROP old). **Перед** пересозданием — `DELETE FROM vehicle_attachments WHERE category = 'adr'` (эти attachment-строки удаляются; без DELETE USING-cast упал бы). `vehicles.adr` boolean и `vehicles.adrClasses` НЕ затронуты. **Change 2:** `drivers.adr` — `BOOLEAN NOT NULL DEFAULT false` (ADR permit flag); новый enum `DriverAttachmentCategory { adr }`; новая таблица `driver_attachments` (FK на `drivers` `ON DELETE CASCADE`, FK на `users` `ON DELETE SET NULL`, soft-delete `deletedAt`, индекс `(driverId, category)`). **Change 3:** новый enum `CarrierAttachmentCategory { insurance, license, kreptd, other }`; новая таблица `carrier_attachments` (FK на `carriers` `ON DELETE CASCADE`, FK на `users` `ON DELETE SET NULL`, soft-delete `deletedAt`, индекс `(carrierId, category)`). Чисто аддитивно кроме удаления enum-value/строк из Change 1. |

| `20260529111419_carrier_attachment_category_add_adr` | Чисто аддитивная миграция enum. Значение `adr` добавлено в `CarrierAttachmentCategory` (между `kreptd` и `other`) — обязательный ADR-документ перевозчика (один официальный документ со списком ADR-машин/водителей, грузится как файл-attachment). In-place `ALTER TYPE "CarrierAttachmentCategory" ADD VALUE 'adr'` (без пересоздания типа — в отличие от удаления vehicle-`adr`, т.к. Postgres умеет ADD VALUE in-place). Ничего ещё не использует новое значение, так что отдельная транзакция не нужна. |
| `20260601120000_drop_vehicle_trailer_inspection_and_vehicle_adr_classes` | Деструктивный `DROP COLUMN` (user-confirmed full removal — UI + API + DB). Удаляет `vehicles.nextInspectionDate` (DATE), `trailers.nextInspectionDate` (DATE) и `vehicles.adrClasses` (TEXT[]). Сохранены отдельные соседние поля: `vehicles.adr` / `drivers.adr` (boolean permit-флаги), `vehicles.wasteCountries`, а также VehicleAttachment/DriverAttachment с ADR-сертификатами. Существующие значения теряются (подтверждено), без backfill. Hand-authored по существующей конвенции (без `--create-only`, т.к. на момент создания БД была недоступна) — не применялась к live-БД, применится через `prisma migrate deploy`. |
| `20260601130000_driver_rename_passport_to_id_document` | Переименование `drivers.passportNumber` → `idDocumentNumber` (ALTER TABLE … RENAME COLUMN, без потери данных). Колонка теперь хранит номер любого удостоверения личности (паспорт, dowód osobisty и т.п.), а не только паспорта; тип, nullability и casing не меняются. Hand-authored по существующей конвенции (БД была недоступна на момент создания) — не применялась к live-БД, применится через `prisma migrate deploy`. |
| `20260615120000_drop_vehicle_trailer_brand_model_year` | Деструктивный `DROP COLUMN` (user-confirmed full removal — UI + API + DB). Удаляет `vehicles.brand`, `vehicles.model`, `vehicles.year`, `trailers.brand`, `trailers.model`, `trailers.year` — описательные характеристики авто/прицепа, выпиленные из продукта. БД greenfield (пустая + seed-only), поэтому plain DROP COLUMN корректен — без backfill, без down-миграции. Соседние поля (`notes`, размеры/оборудование прицепа) не затронуты. |
| `20260617130000_drop_vehicle_gps_toggle_require_gps_device` | GPS-номер делается обязательным у каждого авто. Forward-only. Порядок: DROP CHECK `vehicle_gps_device_when_gps_on` (добавлен в `20260507191424_phase3_blocks`) → DROP COLUMN `vehicles.gps` (legacy «есть GPS» toggle) → defensive backfill `UPDATE … SET gpsMobilePhone='UNKNOWN' WHERE … IS NULL` (no-op на пустой БД; страхует stale dev-строки из старого `gps=false` пути) → `vehicles.gpsMobilePhone` SET NOT NULL. Продуктовое решение 2026-06-17: каждое авто в km-гарантийной программе GPS-tracked, поэтому boolean-toggle избыточен, а device id присутствует всегда. CHECK дропается ДО колонки `gps`, на которую он ссылается; Zod (`gpsMobilePhone` required, non-empty) не даёт плейсхолдеру пережить round-trip через API. |
| `20260707130000_guarantee_watchdog` | Guarantee Watchdog (план 2026-07-07). Аддитивная миграция. Новые enum-ы `GuaranteeEpisodeState {warning, violated, resolved}`, `GuaranteeAnchorSource {zjechal, agreement}`, `GuaranteeResolveReason {wyjazd, agreement_off, vehicle_inactive}`. Новая таблица **`guarantee_idle_episodes`** — журнал «плохих» гарантийных циклов машины (FK на `vehicles` и `carriers` `ON DELETE RESTRICT`; nullable FK `resolvedByDelegationId` на `delegations` `ON DELETE SET NULL`; **без `deletedAt`** — append-only журнал, soft-delete-extension его игнорирует; индексы `(carrierId, state)`, `(vehicleId, state)`). Hand-added SQL: **partial unique** `GuaranteeIdleEpisode_open_vehicle_key` `ON ("vehicleId") WHERE "state" <> 'resolved'` — не выразимо в Prisma DSL, держит инвариант «≤1 открытый эпизод на машину». Новая колонка **`vehicles.agreementSince DATE`** (дата включения гарантии; API ведёт её на toggle agreement). **Бэкфилл:** `UPDATE vehicles SET agreementSince = CURRENT_DATE WHERE agreement = true AND agreementSince IS NULL` — rollout-grace: уже-гарантийные машины получают свежее 10-раб.-дневное окно с дня деплоя. Hand-authored (БД недоступна для интерактивного `migrate dev` в среде агента) — SQL идентичен `migrate diff` (проверено `migrate status` = «up to date»), применена через `prisma migrate deploy`. |

Production deploy: `prisma migrate deploy` в CI/CD пайплайне (без `--create-only`).

## Seed (`prisma/seed.ts`)

Минимальный набор для запуска dev:

- 14 типов прицепов (Firanka, Plandeka, Chłodnia, … — это бизнес-справочник, не тестовые данные).
- 1 admin-пользователь (credentials в env).
- Дефолтные `app_config` (lockout-ttl, code-ttl, max-attempts, ставки-fallback).
- Лимиты на текущий и следующий год (заглушки на 540 km/0.5 EUR — admin отредактирует через UI).

```ts
// packages/database/prisma/seed.ts
import { PrismaClient } from '../src/generated';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // trailer types
  const types = ['Firanka', 'Plandeka', 'Chłodnia', 'Wywrotka', 'Mega', 'Jumbo',
                 'Frigo', 'Niska', 'Burtowa', 'Kontener', 'Cysterna', 'HDS', 'Walking Floor'];
  for (const name of types) {
    await prisma.trailerType.upsert({ where: { name }, create: { name }, update: {} });
  }

  // admin
  await prisma.user.upsert({
    where: { login: 'admin' },
    create: {
      login: 'admin',
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@magtrans.eu',
      passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'changeme', 12),
      role: 'admin',
      name: 'Administrator',
    },
    update: {},
  });

  // app_config
  const cfg: [string, string][] = [
    ['stawka_eur_default', '0.5'],
    ['km_dziennie_default', '540'],
    ['auth_threshold_low', '1000'],
    ['auth_threshold_high', '5000'],
    ['min_days_to_submit', '10'],
    ['login_code_ttl', '600'],
    ['login_max_attempts', '5'],
  ];
  for (const [key, value] of cfg) {
    await prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}

main().finally(() => prisma.$disconnect());
```

## Связь с launch

Стратегия первого запуска (seed, прод-окружение, smoke-тесты) описана в [18-launch-and-deployment.md](18-launch-and-deployment.md). Никакой миграции данных нет — стартуем с пустой БД + seed.
