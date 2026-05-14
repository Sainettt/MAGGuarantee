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

enum DelegationStatus {
  zgloszony
  w_trasie
  zjechal
  anulowany
}

enum VehicleType { MEGA  STD  COIL }
enum CertificateL { L1  L2  L3 }
enum EuroNorm    { III  IV  V  VI }

// ─── USERS ──────────────────────────────────────────────

model User {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  login          String    @unique
  email          String    @unique
  passwordHash   String?  // bcrypt; nullable to allow email-only auth
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
  numberOfPermits Int?      // KREPTD wypisy
  companyAddress  String   // STRICT

  opiekunId String @db.Uuid
  opiekun   User   @relation("OpiekunCarriers", fields: [opiekunId], references: [id])

  vehicles    Vehicle[]
  drivers     Driver[]
  trailers    Trailer[]
  claims      Claim[]
  delegations Delegation[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([opiekunId])
  @@index([deletedAt])
  @@map("carriers")
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
  dispatcherId String? @db.Uuid
  dispatcher   User?   @relation("VehicleDispatcher", fields: [dispatcherId], references: [id])

  brand        String?
  model        String?
  year         Int?
  notes        String?
  certificateL CertificateL  // STRICT
  euro         EuroNorm      // STRICT
  adrClasses   String[]
  gps          Boolean       @default(false)
  fuelCard     Boolean       @default(false)
  type         VehicleType   // STRICT

  // country access permits — see docs/19-known-quirks.md (#vehicle-gb-it-fr)
  gb        Boolean?
  it        Boolean?
  fr        Boolean?
  agreement Boolean?  // Porozumienie — see #umowa-vs-porozumienie quirk
  contract  Boolean?  // Umowa

  // EUR/km rates — Optional everywhere (NULL = "not yet negotiated")
  rateDe     Decimal? @db.Decimal(6, 4)
  rateUe     Decimal? @db.Decimal(6, 4)
  rateExport Decimal? @db.Decimal(6, 4)
  rateImport Decimal? @db.Decimal(6, 4)

  wasteAllowed   Boolean  @default(false)
  wasteCountries String[]
  cabotageDe     Boolean  @default(false)
  cabotageFr     Boolean  @default(false)

  // tracker device id — required iff gps=true (CHECK vehicle_gps_device_when_gps_on)
  // misnomer: it's NOT a phone number — see docs/19-known-quirks.md (#gpsMobilePhone)
  gpsMobilePhone     String?
  nextInspectionDate DateTime? @db.Date
  sideNumber         String?
  // Auto-updated by delegation→zjechal — never expose as a manual UI field
  lastDroveAt        DateTime?

  delegations Delegation[]
  claims      Claim[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([carrierId, plateNumber], name: "carrier_plate_unique")
  @@index([plannerId])
  @@index([dispatcherId])
  @@index([active, deletedAt])
  @@map("vehicles")
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
  driverLicenseNumber String
  // API + UI required, DB nullable — UI surfaces a warning, not a hard block
  licenseExpiry       DateTime? @db.Date
  // Optional everywhere — driver paid by carrier, not MAGTRANS
  bankAccount         String?
  notes               String?
  active              Boolean  @default(true)
  addedAt             DateTime @default(now())

  delegations Delegation[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([carrierId, active])
  @@map("drivers")
}

// ─── TRAILERS + TYPES ───────────────────────────────────

model Trailer {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId String  @db.Uuid
  carrier   Carrier @relation(fields: [carrierId], references: [id])

  plateNumber        String
  trailerTypeId      String      @db.Uuid          // STRICT (FK required)
  trailerType        TrailerType @relation(fields: [trailerTypeId], references: [id])
  brand              String?
  model              String?
  year               Int?
  active             Boolean     @default(true)
  addedAt            DateTime    @default(now())
  equipment          String?
  nextInspectionDate DateTime?   @db.Date

  belts             Boolean?
  mats              Boolean?
  innerLength       Decimal? @db.Decimal(8, 2)
  innerWidth        Decimal? @db.Decimal(8, 2)
  innerHeight       Decimal? @db.Decimal(8, 2)
  capacity          Decimal? @db.Decimal(10, 2)
  airSuspension     Boolean?
  loadFromBack      Boolean?
  loadFromSide      Boolean?
  loadFromTop       Boolean?
  slidingRoof       Boolean?
  edschaSlidingRoof Boolean?
  notes             String?

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

  authScreenshotUrl String?
  attachments       ClaimAttachment[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

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
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vehicleId String   @db.Uuid
  vehicle   Vehicle  @relation(fields: [vehicleId], references: [id])
  trailerId String?  @db.Uuid
  trailer   Trailer? @relation(fields: [trailerId], references: [id])
  driverId  String?  @db.Uuid
  driver    Driver?  @relation(fields: [driverId], references: [id])
  carrierId String   @db.Uuid
  carrier   Carrier  @relation(fields: [carrierId], references: [id])

  driverNameSnapshot  String?
  driverPhoneSnapshot String?

  // departure — STRICT
  departureAt         DateTime
  departureCountry    String
  departurePostalCode String

  // return planning — DB nullable + status-conditional CHECK delegation_returned_complete:
  // when status='zjechal' all three must be set
  plannedReturnAt  DateTime?
  returnCountry    String?
  returnPostalCode String?

  status         DelegationStatus @default(zgloszony)
  actualReturnAt DateTime?

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

## Required-field classification (per the three-layer pattern)

> Резюме что закрыто на каком слое. Поля, не упомянутые ниже, помечаются как Optional everywhere (UI/API не требуют, DB nullable).

### Carrier

| Поле | Слой защиты | Notes |
|---|---|---|
| `contactPerson`, `phone`, `ordersEmail`, `accountEur`, `companyAddress` | Strict everywhere | DB NOT NULL |
| `paymentTerms` | Strict everywhere (DB default 30) | |
| `insuranceValue` | Strict everywhere | DB NOT NULL; Zod adds `> 0` |
| `insuranceExpiry`, `licenseExpiry` | API + UI required, DB nullable | Allows admin/opiekun create when certificate copies not in hand |
| `nip`, `vatId`, `accountPln`, `numberOfPermits`, `company` | Optional everywhere | At least one of (nip, vatId) — backlog CHECK, see #19 quirks |

### Vehicle

| Поле | Слой защиты | Notes |
|---|---|---|
| `plateNumber`, `certificateL`, `euro`, `type` | Strict everywhere | DB NOT NULL |
| `gpsMobilePhone` | DB nullable + CHECK `vehicle_gps_device_when_gps_on` | Forced when `gps=true` |
| `rateDe`, `rateUe`, `rateExport`, `rateImport` | Optional everywhere | NULL = "not negotiated yet"; 0 would be ambiguous |
| `gb`, `it`, `fr`, `agreement`, `contract`, `lastDroveAt`, `notes`, etc. | Optional everywhere | |

### Driver

| Поле | Слой защиты | Notes |
|---|---|---|
| `firstName`, `lastName`, `phone`, `driverLicenseNumber`, `loginSlug` | Strict everywhere | |
| `licenseExpiry` | API + UI required, DB nullable | Driver must legally have it; UI warns rather than blocks at registration |
| `email`, `phone2`, `bankAccount`, `notes` | Optional everywhere | Email rare in PL trucking; bank acc is HR-internal |

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
| `vehicleId`, `carrierId`, `departureAt`, `departureCountry`, `departurePostalCode` | Strict everywhere | |
| `plannedReturnAt`, `returnCountry`, `returnPostalCode`, `actualReturnAt` | DB nullable + CHECK `delegation_returned_complete` | All required when `status='zjechal'` |
| `trailerId`, `driverId`, `notes`, snapshots | Optional everywhere | |

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
| F | GodzinaOd | `timeFrom` | String "HH:MM" |
| G | GodzinaDo | `timeTo` | String |
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

Дополнительно в Claim, не имеющего колонки в Sheets: `breakdown` (JSON, помесячный расчёт), `ratePerKmEffective`, `decidedById`, `authScreenshotUrl`.

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
| I-K | Marka, Model, Rok | `brand`, `model`, `year` |
| L | Uwagi | `notes` |
| M | CertyfikatL | `certificateL` |
| N | EURO | `euro` |
| O | ADR (CSV) | `adrClasses[]` |
| P-R | GPS, KartaPaliwowa, Typ | `gps`, `fuelCard`, `type` |
| S | Dyspozytor (login) | → FK `dispatcherId` |
| T-X | GB, IT, FR, Porozumienie, Umowa | `gb`, `it`, `fr`, `agreement`, `contract` |
| Y-AB | StawkaDE, StawkaUE, StawkaEksport, StawkaImport | `rateDe`, `rateUe`, `rateExport`, `rateImport` |
| AC | Odpady | `wasteAllowed` |
| AD | OdpadyKraje (CSV) | `wasteCountries[]` |
| AE-AF | KabotazDE, KabotazFR | `cabotageDe`, `cabotageFr` |
| AG | GPSMobNr | `gpsMobilePhone` |
| AH | NastepnyPrzeglad | `nextInspectionDate` |
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
| G | NrPrawaJazdy | `driverLicenseNumber` |
| H | Aktywny | `active` |
| I | DataDodania | `addedAt` |
| J | PrawoJazdyWaznosc | `licenseExpiry` |
| K | Telefon2 | `phone2` |
| L | Konto | `bankAccount` |
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
| `20260508115947_carrier_nip_vat_required` | NOT NULL на `carriers.nip` и `carriers.vatId`. Налоговые ID требуются на момент создания: PL-перевозчики дают 10-значный NIP, иностранные — локальный TIN; `vatId` — EU VAT с префиксом страны. |
| `20260508194914_phase3_insurance_value_required` | NOT NULL на `carriers.insuranceValue`. Без OCP-страховки перевозчик не может ехать; `insuranceExpiry`/`licenseExpiry` остаются nullable (могут не быть копий на момент онбординга). Бэкфилл `0` для stale-dev-строк перед SET NOT NULL — Zod на API enforce'ит `> 0`, поэтому 0 не переживает round-trip через create/update. |

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
