# 12. Database schema (Postgres + Prisma)

> Структура Postgres-схемы. Google Sheets из текущего MAGGuarantee — это **референс структуры данных** при проектировании моделей (т.к. бизнес-логика и поля изначально проектировались под них). Никакого импорта данных нет — стартуем с пустой БД + seed.
>
> Источник истины самой схемы — `packages/database/prisma/schema.prisma`.

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

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
  output        = "../src/generated"
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
  NA_WERYFIKACJI         @map("NA WERYFIKACJI")
  ZAAKCEPTOWANO
  ODRZUCONO
  REKLAMACJA
  OCZEKUJE_NA_AUTORYZACJE @map("OCZEKUJE NA AUTORYZACJĘ")
  AUTORYZACJA_KWOTA_MAKSIMA @map("AUTORYZACJA — KWOTA MAKSIMA")
}

enum DelegationStatus {
  zgloszony
  w_trasie
  zjechal
  anulowany
}

enum VehicleType {
  MEGA
  STD
  COIL
}

enum CertificateL {
  L1
  L2
  L3
}

enum EuroNorm {
  III
  IV
  V
  VI
}

// ─── USERS (объединение всех auth-листов) ───────────────

model User {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  login           String   @unique
  email           String?  @unique
  passwordHash    String?  // bcrypt; nullable если переходим на email-only
  role            Role
  name            String?  // Nazwa
  company         String?  // Firma
  active          Boolean  @default(true)
  // 2FA / login attempts (раньше в CacheService)
  failedAttempts  Int      @default(0)
  lockedUntil     DateTime?
  lastLoginAt     DateTime?

  // poles специфичные для ролей (NULL для остальных)
  // planista
  liderEmail      String?

  // OPIEKUN — связь обратная через Carrier.opiekunId
  carriers        Carrier[]    @relation("OpiekunCarriers")
  // PRZEWOZNIK — extends через Carrier (см. ниже)
  carrierProfile  Carrier?     @relation("CarrierUser")

  // авто-связи
  plannerVehicles    Vehicle[] @relation("VehiclePlanner")
  dispatcherVehicles Vehicle[] @relation("VehicleDispatcher")

  // активность
  reportedDelegations  Delegation[] @relation("DelegationReporter")
  verifiedDelegations  Delegation[] @relation("DelegationVerifier")
  authoredClaims       Claim[]      @relation("ClaimDecidedBy")
  auditEntries         AuditLog[]
  refreshTokens        RefreshToken[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@index([role])
  @@index([deletedAt])
  @@map("users")
}

// ─── CARRIERS (UZYTKOWNICY extension fields) ────────────

model Carrier {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId             String   @unique @db.Uuid
  user               User     @relation("CarrierUser", fields: [userId], references: [id])

  nip                String?
  vatId              String?         // EU VAT
  contactPerson      String?         // OsobaKontaktowa
  phone              String?
  ordersEmail        String?         // EmailZlecenia
  accountEur         String?         // KontoEUR — IBAN
  accountPln         String?         // KontoPLN
  paymentTerms       Int?            // дни
  insuranceValue     Decimal?        @db.Decimal(12, 2)
  insuranceExpiry    DateTime?       @db.Date
  licenseExpiry      DateTime?       @db.Date
  numberOfPermits    Int?            // LiczbaWypisow (KREPTD)
  companyAddress     String?

  opiekunId          String?  @db.Uuid
  opiekun            User?    @relation("OpiekunCarriers", fields: [opiekunId], references: [id])

  vehicles           Vehicle[]
  drivers            Driver[]
  trailers           Trailer[]
  claims             Claim[]
  delegations        Delegation[]

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  deletedAt          DateTime?

  @@index([opiekunId])
  @@index([deletedAt])
  @@map("carriers")
}

// ─── VEHICLES (AUTA, 36 колонок) ────────────────────────

model Vehicle {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId           String   @db.Uuid
  carrier             Carrier  @relation(fields: [carrierId], references: [id])

  plateNumber         String                          // NrRej
  active              Boolean  @default(true)
  addedAt             DateTime @default(now())
  deactivatedAt       DateTime?
  createdById         String?  @db.Uuid               // UtworzonePrzez

  // люди
  plannerId           String?  @db.Uuid
  planner             User?    @relation("VehiclePlanner", fields: [plannerId], references: [id])
  dispatcherId        String?  @db.Uuid
  dispatcher          User?    @relation("VehicleDispatcher", fields: [dispatcherId], references: [id])

  // характеристики
  brand               String?
  model               String?
  year                Int?
  notes               String?
  certificateL        CertificateL?
  euro                EuroNorm?
  adrClasses          String[]                        // CSV → array
  gps                 Boolean   @default(false)
  fuelCard            Boolean   @default(false)
  type                VehicleType?

  gb                  Boolean?  // право работы в Великобритании
  it                  Boolean?
  fr                  Boolean?
  agreement           Boolean?  // Porozumienie
  contract            Boolean?  // Umowa

  // ставки EUR/km
  rateDe              Decimal?  @db.Decimal(6, 4)
  rateUe              Decimal?  @db.Decimal(6, 4)
  rateExport          Decimal?  @db.Decimal(6, 4)
  rateImport          Decimal?  @db.Decimal(6, 4)

  // отходы
  wasteAllowed        Boolean   @default(false)
  wasteCountries      String[]  // CSV → array

  // кабота
  cabotageDe          Boolean   @default(false)
  cabotageFr          Boolean   @default(false)

  gpsMobilePhone      String?
  nextInspectionDate  DateTime? @db.Date
  sideNumber          String?                         // NrBoczny
  lastDroveAt         DateTime?                       // OstatnioJezdzilo (auto-update от delegations)

  delegations         Delegation[]
  claims              Claim[]

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  @@unique([carrierId, plateNumber], name: "carrier_plate_unique")
  @@index([plannerId])
  @@index([dispatcherId])
  @@index([active, deletedAt])
  @@map("vehicles")
}

// ─── DRIVERS (KIEROWCY) ─────────────────────────────────

model Driver {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId         String   @db.Uuid
  carrier           Carrier  @relation(fields: [carrierId], references: [id])

  loginSlug         String   @unique                  // имя.фамилия (или -2/-3 при коллизии)
  firstName         String
  lastName          String
  phone             String?
  phone2            String?
  email             String?
  driverLicenseNumber String?
  licenseExpiry     DateTime? @db.Date
  bankAccount       String?
  notes             String?
  active            Boolean   @default(true)
  addedAt           DateTime  @default(now())

  delegations       Delegation[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?

  @@index([carrierId, active])
  @@map("drivers")
}

// ─── TRAILERS (NACZEPY) ─────────────────────────────────

model Trailer {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  carrierId         String   @db.Uuid
  carrier           Carrier  @relation(fields: [carrierId], references: [id])

  plateNumber       String                            // NrRej
  trailerTypeId     String?  @db.Uuid
  trailerType       TrailerType? @relation(fields: [trailerTypeId], references: [id])
  brand             String?
  model             String?
  year              Int?
  active            Boolean   @default(true)
  addedAt           DateTime  @default(now())
  equipment         String?
  nextInspectionDate DateTime? @db.Date

  belts             Boolean?  // Pasy
  mats              Boolean?  // Maty
  innerLength       Decimal?  @db.Decimal(8, 2)
  innerWidth        Decimal?  @db.Decimal(8, 2)
  innerHeight       Decimal?  @db.Decimal(8, 2)
  capacity          Decimal?  @db.Decimal(10, 2)
  airSuspension     Boolean?  // Wyprez
  loadFromBack      Boolean?
  loadFromSide      Boolean?
  loadFromTop       Boolean?
  slidingRoof       Boolean?
  edschaSlidingRoof Boolean?
  notes             String?

  delegations       Delegation[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?

  @@unique([carrierId, plateNumber])
  @@map("trailers")
}

model TrailerType {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String  @unique
  shortCode   String?
  description String?
  active      Boolean @default(true)
  trailers    Trailer[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("trailer_types")
}

// ─── CLAIMS (WNIOSEK, 50 колонок) ───────────────────────

model Claim {
  id                  String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nrZgl               String      @unique                // GWA/NNN/MM/RR
  carrierId           String      @db.Uuid
  carrier             Carrier     @relation(fields: [carrierId], references: [id])
  vehicleId           String?     @db.Uuid               // может быть null если авто удалено
  vehicle             Vehicle?    @relation(fields: [vehicleId], references: [id])
  vehiclePlateSnapshot String                            // на случай удаления авто

  // период
  dateStart           DateTime    @db.Timestamp(0)
  dateEnd             DateTime    @db.Timestamp(0)
  timeFrom            String?     // HH:MM, на случай старого формата
  timeTo              String?

  // расчёт
  drivenDays          Decimal?    @db.Decimal(6, 2)     // DniJezdne (может быть дробное)
  mileage             Decimal?    @db.Decimal(10, 2)    // Przebieg (km)
  kmPerDay            Decimal?    @db.Decimal(8, 2)
  kmGuaranteed        Decimal?    @db.Decimal(10, 2)    // KmGwarant
  kmDifference        Decimal?    @db.Decimal(10, 2)
  paymentEur          Decimal?    @db.Decimal(12, 2)    // Doplata
  ratePerKmEffective  Decimal?    @db.Decimal(6, 4)     // взвешенная EUR/km
  breakdown           Json?       // помесячный расчёт (totalDays, kmGwarant, stawka, ...)

  // статус и воркфлоу
  status              ClaimStatus @default(NA_WERYFIKACJI)
  statusChangedAt     DateTime?
  decidedById         String?     @db.Uuid
  decidedBy           User?       @relation("ClaimDecidedBy", fields: [decidedById], references: [id])

  comment             String?
  orderNumber         String?     // NrZlecenia
  orderDate           DateTime?   @db.Date

  // auth
  authorizationRequired Boolean   @default(false)        // флаг крупной суммы
  authorizationDescription String?
  authorizationToken    String?
  authorizationDecidedAt DateTime?

  amountRequested     Decimal?    @db.Decimal(12, 2)    // KwotaWnioskowana
  amountApproved      Decimal?    @db.Decimal(12, 2)    // ZatwKwota
  margin              Decimal?    @db.Decimal(12, 2)
  amountMaximum       Decimal?    @db.Decimal(12, 2)

  // рекламация (зеркало)
  reklamacjaSubmitted Boolean     @default(false)
  reklamacjaText      String?
  reklamacjaResponse  String?     // OdpMagtrans
  reklamacjaAmount    Decimal?    @db.Decimal(12, 2)
  hoursAdjusted       Boolean     @default(false)
  statusBeforeReklamacja ClaimStatus?
  origDateStart       DateTime?
  origDateEnd         DateTime?
  origMileage         Decimal?    @db.Decimal(10, 2)

  // связи
  authScreenshotUrl   String?     // S3 URL
  attachments         ClaimAttachment[]

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  @@index([carrierId, status])
  @@index([vehicleId])
  @@index([status, statusChangedAt])
  @@index([dateStart])
  @@map("claims")
}

model ClaimAttachment {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  claimId     String  @db.Uuid
  claim       Claim   @relation(fields: [claimId], references: [id], onDelete: Cascade)
  url         String
  mimeType    String?
  size        Int?
  uploadedById String? @db.Uuid
  createdAt   DateTime @default(now())

  @@map("claim_attachments")
}

// ─── DELEGATIONS (DELEGACJE) ────────────────────────────

model Delegation {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vehicleId           String   @db.Uuid
  vehicle             Vehicle  @relation(fields: [vehicleId], references: [id])
  trailerId           String?  @db.Uuid
  trailer             Trailer? @relation(fields: [trailerId], references: [id])
  driverId            String?  @db.Uuid
  driver              Driver?  @relation(fields: [driverId], references: [id])
  carrierId           String   @db.Uuid
  carrier             Carrier  @relation(fields: [carrierId], references: [id])

  driverNameSnapshot  String?
  driverPhoneSnapshot String?

  departureAt         DateTime
  departureCountry    String?
  departurePostalCode String?

  plannedReturnAt     DateTime?
  returnCountry       String?
  returnPostalCode    String?

  status              DelegationStatus @default(zgloszony)
  actualReturnAt      DateTime?

  reportedById        String?  @db.Uuid
  reportedBy          User?    @relation("DelegationReporter", fields: [reportedById], references: [id])
  reportedAt          DateTime @default(now())
  verifiedById        String?  @db.Uuid
  verifiedBy          User?    @relation("DelegationVerifier", fields: [verifiedById], references: [id])
  verifiedAt          DateTime?

  notes               String?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  @@index([vehicleId, status])
  @@index([carrierId, status])
  @@index([status, departureAt])
  @@map("delegations")
}

// ─── LIMITS (LIMITY KM) ─────────────────────────────────

model MonthlyLimit {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  year        Int
  month       Int     // 1..12
  kmPerDay    Decimal? @db.Decimal(8, 2)
  ratePerKm   Decimal? @db.Decimal(6, 4)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([year, month])
  @@map("monthly_limits")
}

// ─── AUDIT_LOG ──────────────────────────────────────────

model AuditLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String?  @db.Uuid
  user        User?    @relation(fields: [userId], references: [id])
  userRole    Role?
  action      String
  targetType  String?  // 'Claim', 'Vehicle', ...
  targetKey   String?  // nrZgl, plateNumber, ...
  before      Json?
  after       Json?
  reason      String?
  metadata    Json?
  ipAddress   String?  @db.Inet

  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([targetType, targetKey])
  @@index([action])
  @@index([createdAt])
  @@map("audit_log")
}

// ─── REFRESH TOKENS (для JWT rotation) ──────────────────

model RefreshToken {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @db.Uuid
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash   String   @unique             // SHA-256, не сам токен
  expiresAt   DateTime
  revokedAt   DateTime?
  ipAddress   String?  @db.Inet
  userAgent   String?

  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

// ─── APP CONFIG (заменяет CONFIG-объект и hardcoded значения) ───

model AppConfig {
  key         String   @id
  value       String
  description String?
  updatedAt   DateTime @updatedAt

  @@map("app_config")
}
```

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
| AP | KorektaGodzin | `hoursAdjusted` | Boolean |
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

8 листов в Sheets — это 8 таблиц с одинаковой структурой, отличаются только `Rola`. В новой схеме это **одна таблица `users`** с полем `role: Role`. Для перевозчика расширенные поля (NIP, IBAN, OpiekunLogin и т.д.) живут в отдельной таблице `Carrier`, связанной с `User` 1:1. Это дедупликация структуры.

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
| `getClaimsForCarrier` | `claims(carrierId, status)` |
| `getMyFleet` авто перевозчика | `vehicles(carrierId, active)` |
| Активные авто планисты | `vehicles(plannerId)` |
| Делегации авто | `delegations(vehicleId, status)` |
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

Создаются через `prisma migrate dev --name <descriptive>`:

```
packages/database/prisma/migrations/
├── 20260501000000_init/
│   └── migration.sql
├── 20260520000000_add_audit_index/
│   └── migration.sql
└── ...
```

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
