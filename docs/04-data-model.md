# 04. Domain model — сущности и отношения

> Логика отношений между сущностями. Это бизнес-описание, **не схема БД**. Реализация в Postgres — в [12-database-schema.md](12-database-schema.md).

## Карта сущностей

```
                    ┌──────────────────┐
                    │       User       │
                    │ (1 row per role) │
                    └──────────────────┘
                            │
                ┌───────────┴───────────────┬──────────────┐
                │                           │              │
        role=przewoznik              role=opiekun     other roles
                │                           │              │
                ▼                           │              │
         ┌──────────┐    opiekunId ◄────────┘              │
         │ Carrier  │◄───────────                          │
         └──────────┘                                      │
              │                                            │
    ┌─────────┼──────────┬─────────────┐                   │
    ▼         ▼          ▼             ▼                   │
 ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐               │
 │Vehic-│ │Driver│ │ Trailer  │ │  Claim   │               │
 │ le   │ │      │ │          │ │ (wniosek)│               │
 └──────┘ └──────┘ └──────────┘ └──────────┘               │
    │ │       │       │              │ vehicleId           │
    │ │ plannerId/    │              │                     │
    │ │ dispatcherId ─┼──────────────┼─── (User as planner/dispatcher)
    │ │       │       │              │                     │
    │ └───────┴───────┴──┐           │                     │
    │                    ▼           │                     │
    │              ┌────────────┐    │                     │
    │              │ Delegation │    │                     │
    │              │  (выезд)   │    │                     │
    │              └────────────┘    │                     │
    │                    │           │                     │
    │              vehicleId, etc.   │                     │
    │                                │                     │
    │              decidedById ──────┘                     │
    │                                                      │
    │                   ┌──────────────┐                   │
    │                   │TrailerType   │ ◄── trailerTypeId │
    │                   │ (справочник) │                   │
    │                   └──────────────┘                   │
    │                                                      │
    │  ┌─────────────────┐  ┌──────────────┐               │
    │  │ MonthlyLimit    │  │  AppConfig   │               │
    │  │ (год, месяц)    │  │ (глобальные  │               │
    │  └─────────────────┘  │  параметры)  │               │
    │                       └──────────────┘               │
    │                                                      │
    └──────────────────────────────► AuditLog ◄────────────┘
                                     (кто что когда)
```

## Сущности

### `User` — единый аккаунт

Все 8 ролей хранятся в одной таблице (различаются полем `role`). Это упрощает auth и multi-role переключение.

| Поле | Назначение |
|---|---|
| `id` | UUID PK |
| `login` | unique, человекочитаемый идентификатор |
| `email` | unique, для 2FA |
| `passwordHash` | bcrypt; nullable если email-only auth |
| `role` | `admin` / `pracownik` / `opiekun` / `planista` / `dyspozytor` / `przewoznik` / `eksport` / `weryfikator` |
| `name` | имя |
| `active` | блокировка логина |
| `liderEmail` | только для `planista` — email лидера группы (для рассылки). Per-role tech debt — см. [19-known-quirks.md](19-known-quirks.md#liderEmail) |

> ⚠️ Поля `company` (Firma) на `User` **больше нет** — оно перенесено на `Carrier` миграцией `20260507223021_move_company_to_carrier`. Внутренние роли MAGTRANS (admin/pracownik/opiekun/planista/dyspozytor/eksport/weryfikator) — это сотрудники одной компании, поле было денормализованным наследием GAS-миграции, которое использовалось только перевозчиками.

**Связи:**
- 1:1 с `Carrier` (если role=przewoznik).
- 1:N с `Carrier.opiekun` (если role=opiekun).
- 1:N с `Vehicle.planner`, `Vehicle.dispatcher`.
- 1:N с `Delegation.reportedBy`, `Delegation.verifiedBy`.
- 1:N с `Claim.decidedBy`.
- 1:N с `AuditLog.user`.

### `Carrier` — перевозчик (расширение User)

Дополнительные поля для роли `przewoznik`. Отдельная таблица 1:1 с `User`, чтобы не хранить null-поля у других ролей.

| Поле | Назначение |
|---|---|
| `userId` | FK → User (unique) |
| `company` | Firma — название компании перевозчика (перенесено сюда из `User` в Phase 3) |
| `nip` | NIP — польский налоговый ID. Foreign carriers его НЕ имеют. См. [19-known-quirks.md#nip-vatid](19-known-quirks.md) |
| `vatId` | EU VAT (PL+NIP для PL-перевозчиков; DE/CZ/etc. для иностранных) |
| `contactPerson`, `phone`, `ordersEmail` | контакты |
| `accountEur`, `accountPln` | IBAN счета (PLN опц. — иностранцы могут не иметь) |
| `paymentTerms` | срок оплаты в днях (default 30) |
| `insuranceValue`, `insuranceExpiry`, `licenseExpiry` | документы (DB nullable, но обязательны на API+UI — см. three-layer pattern в [12-database-schema.md](12-database-schema.md)) |
| `numberOfVehicle` | KREPTD-выписки |
| `companyAddress` | адрес |
| `opiekunId` | FK → User (с role=opiekun) — кто курирует |

**Вложения:** документы компании перевозчика (страховка OCP, лицензия, выписка KREPTD, обязательный ADR-документ — один официальный документ со списком ADR-машин/водителей, прочее) хранятся как `CarrierAttachment` (метаданные + `storageKey` в MinIO; FK на Carrier `ON DELETE CASCADE`; soft-delete `deletedAt`). Enum `CarrierAttachmentCategory { insurance, license, kreptd, adr, other }`. Часть per-entity attachment-паттерна.

**Инварианты:**
- `Carrier.opiekunId` должен указывать на `User.role=opiekun`.
- Удаление Carrier каскадно деактивирует все его Vehicle/Driver/Trailer (soft-delete).

### `Vehicle` — автомобиль

Принадлежит перевозчику. Имеет назначенных планисту и диспетчера (это другие сотрудники MagTrans, не люди перевозчика).

| Поле | Назначение |
|---|---|
| `carrierId` | FK → Carrier |
| `plateNumber` | NrRej |
| `active` | флаг активности |
| `plannerId` | FK → User (role=planista) |
| `dispatcherId` | FK → User (role=dyspozytor) |
| `brand`, `model`, `year` | характеристики |
| `certificateL` | Boolean — TAK/NIE (есть ли L-сертификат). До 2026-05 — enum L1/L2/L3, конвертировано миграцией `20260515130307_vehicle_certificate_l_to_boolean`. |
| `euro` | III / IV / V / VI |
| `adrClasses` | string[] классов опасных грузов |
| `gps`, `fuelCard`, `cabotageDe`, `cabotageFr`, `gb`, `it`, `fr`, `agreement`, `contract` | флаги допусков |
| `adr` | Boolean — флаг ADR-допуска авто (сохранён). NB: ADR-сертификат как **vehicle**-вложение убран 2026-05-29 — сам скан świadectwo ADR теперь привязан к Driver |
| `type` | MEGA / STD / COIL |
| `wasteAllowed`, `wasteCountries` | разрешения на отходы |
| `rateDe`, `rateUe`, `rateExport`, `rateImport` | EUR/km по направлениям |
| `gpsMobilePhone` | ID GPS-трекера (НЕ телефонный номер — misnomer, см. [19-known-quirks.md#gpsMobilePhone](19-known-quirks.md)) |
| `nextInspectionDate` | следующий техосмотр |
| `sideNumber` | NrBoczny |
| `lastDroveAt` | **автообновление** от Delegation→`zjechal`. Никогда не редактируется руками — см. [19-known-quirks.md](19-known-quirks.md) |

**Вложения:** скан умовы и cabotage-разрешения хранятся как `VehicleAttachment` (метаданные + `storageKey` в MinIO; FK на Vehicle `ON DELETE CASCADE`; soft-delete `deletedAt`). Enum `VehicleAttachmentCategory { contract, cabotage_de, cabotage_fr }` — значение `adr` удалено 2026-05-29 (ADR-сертификат переехал на Driver). Boolean `Vehicle.adr` сохранён.

**Инварианты (data-model contract):**
- Уникальность `(carrierId, plateNumber)` — один номер на перевозчика.
- `plannerId` / `dispatcherId` — пользователи с соответствующей ролью.
- **CHECK `vehicle_gps_device_when_gps_on`** — если `gps=true`, то `gpsMobilePhone` обязан быть not-null. Это часть data-model contract, не имплементационная деталь.

### `Driver` — водитель

Принадлежит перевозчику.

| Поле | Назначение |
|---|---|
| `carrierId` | FK → Carrier |
| `loginSlug` | уникальный slug `имя.фамилия` (с суффиксом -2/-3 при коллизии) |
| `firstName`, `lastName` | имя |
| `phone`, `phone2`, `email` | контакты |
| `idDocumentNumber` | номер удостоверения личности — паспорт, dowód osobisty и т.п. (раньше `driverLicenseNumber` → `passportNumber`, переименовано 2026-06-01) |
| `licenseExpiry` | срок действия водительского удостоверения |
| `adr` | Boolean — флаг ADR-допуска (świadectwo ADR). Сам скан сертификата — в `DriverAttachment` (category=adr) |
| `active` | флаг |

**Вложения:** скан świadectwo ADR хранится как `DriverAttachment` (метаданные + `storageKey` в MinIO; FK на Driver `ON DELETE CASCADE`; soft-delete `deletedAt`). Enum `DriverAttachmentCategory { adr }` (одно значение, расширяемо). Это часть per-entity attachment-паттерна — отдельной полиморфной таблицы Document нет.

### `Trailer` — прицеп

Принадлежит перевозчику. Тип берётся из справочника `TrailerType`.

| Поле | Назначение |
|---|---|
| `carrierId` | FK → Carrier |
| `plateNumber` | NrRej (unique в рамках carrier) |
| `trailerTypeId` | FK → TrailerType |
| `brand`, `model`, `year` | характеристики |
| `equipment`, `belts`, `mats`, `airSuspension` | оборудование |
| `innerLength`, `innerWidth`, `innerHeight`, `capacity` | размеры |
| `loadFromBack`, `loadFromSide`, `loadFromTop` | способы загрузки |
| `slidingRoof`, `edschaSlidingRoof` | крыша |
| `nextInspectionDate` | техосмотр |

### `TrailerType` — справочник типов прицепов

Глобальный справочник (не привязан к перевозчику). Предзаполняется при seed: Firanka, Plandeka, Chłodnia, Wywrotka, Mega, Jumbo, Frigo, Niska, Burtowa, Kontener, Cysterna, HDS, Walking Floor.

| Поле |
|---|
| `name` (unique) |
| `shortCode` |
| `description` |
| `active` |

### `Claim` — заявление (wniosek)

Главная сущность системы. Перевозчик подаёт, сотрудник верифицирует.

| Поле | Назначение |
|---|---|
| `nrZgl` | unique, формат `GWA/NNN/MM/YY` (последовательный номер с reset на месяц) |
| `carrierId` | FK → Carrier (кто подал) |
| `vehicleId` | FK → Vehicle (на какое авто) |
| `vehiclePlateSnapshot` | snapshot номера на случай удаления авто |
| `dateStart`, `dateEnd` | период гарантии |
| `timeFrom`, `timeTo` | часы (для дробных дней) |
| `mileage` | фактический пробег км |
| `kmGuaranteed` | расчётный гарантированный км |
| `kmDifference` | gwarant − mileage |
| `paymentEur` | сумма доплаты |
| `ratePerKmEffective` | взвешенная EUR/km по месяцам |
| `breakdown` | JSON помесячного расчёта |
| `status` | `NA_WERYFIKACJI` / `ZAAKCEPTOWANO` / `ODRZUCONO` / `REKLAMACJA` / `OCZEKUJE_NA_AUTORYZACJE` / `AUTORYZACJA_KWOTA_MAKSIMA` |
| `decidedById` | FK → User (кто верифицировал) |
| `comment`, `orderNumber`, `orderDate` | мета |
| **Авторизация** (для крупных сумм; пороги по `getAuthThreshold(drivenDays)` — см. [19-known-quirks.md](19-known-quirks.md)): | |
| `authorizationRequired`, `authorizationDescription`, `authorizationToken`, `authorizationDecidedAt` | |
| `amountRequested`, `amountApproved`, `margin`, `amountMaximum` (KwotaMaksima — manual override от Maksim) | |
| `authScreenshotUrl` | URL screenshot-а в file-storage (audit trail Maksim'овой email-decision) |
| **Рекламация** (зеркало для отката): | |
| `reklamacjaSubmitted`, `reklamacjaText`, `reklamacjaResponse`, `reklamacjaAmount` | |
| `statusBeforeReklamacja` | предыдущий статус до перехода в `REKLAMACJA` (для rollback) |
| `origDateStart`, `origDateEnd`, `origMileage`, `origHoursAdjusted` | immutable carrier snapshots (set-once at submit; `submitReklamacja` re-stamps с fallback `?? текущее значение`) |
| `hoursAdjustedValue` | currently applied korekta godzin — drives km-calc (`korektaDni = hoursAdjustedValue / 24`); верификатор PATCH может править только этот столбец, `origHoursAdjusted` остаётся неизменным |

**Инварианты (data-model contract):**
- `nrZgl` уникален глобально, генерируется атомарно через `ClaimSequence` (per `YY-MM`).
- При переходе в `REKLAMACJA` копируются `dateStart/dateEnd/mileage` в `origDateStart/origDateEnd/origMileage` (frozen mirror — см. [19-known-quirks.md](19-known-quirks.md#reklamacja-mirror)).
- `status` всегда из enum (валидируется на API-уровне).
- `vehicleId` может стать NULL если авто удалено — тогда показываем `vehiclePlateSnapshot`.
- **State machine** — Claim status переходы ограничены 9 легальными ребрами. Источник истины — `apps/api/src/modules/claims/claim-state-machine.ts`. Сводка:
  - `NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJE | ZAAKCEPTOWANO | ODRZUCONO`
  - `OCZEKUJE_NA_AUTORYZACJE → ZAAKCEPTOWANO | ODRZUCONO`
  - `ZAAKCEPTOWANO → REKLAMACJA` (carrier-инициированная — отдельный endpoint, не PATCH)
  - `ODRZUCONO → REKLAMACJA` (то же)
  - `REKLAMACJA → ZAAKCEPTOWANO | ODRZUCONO` (verifier-сторона)
  - `AUTORYZACJA_KWOTA_MAKSIMA` — terminal-like, исходящих переходов нет на верификаторской стороне (legacy frozen state).
  - Любая иная пара (from, to) — 422 `Niedozwolone przejście statusu wniosku`.
- **CHECK `claim_accepted_payment_complete`** — при `status='ZAAKCEPTOWANO'` поля `orderNumber` (не пустое), `orderDate`, `amountApproved` обязаны быть заполнены. Часть data-model contract, не имплементация.

### `Delegation` — выезд (рейс)

Описывает один логистический рейс.

| Поле | Назначение |
|---|---|
| `vehicleId` | FK → Vehicle |
| `trailerId` | FK → Trailer |
| `driverId` | FK → Driver |
| `carrierId` | FK → Carrier |
| `driverNameSnapshot`, `driverPhoneSnapshot` | snapshot контактов на момент выезда |
| `departureAt`, `departureCountry`, `departurePostalCode` | старт |
| `plannedReturnAt` (date-only, `@db.Date`), `returnCountry`, `returnPostalCode` | план возврата — заполняется на этапе `zgloszony` (продуктовое решение 2026-05) |
| `actualReturnAt` (timestamp) | факт возврата, выставляется только при переходе в `zjechal` |
| `status` | `zgloszony` → `w_trasie` → `zjechal` (или `anulowany` на любой стадии) |
| `reportedById` | FK → User (кто зарегистрировал) |
| `verifiedById` | FK → User (верификатор, изменивший статус) |
| `notes` | заметки |

**Инварианты (data-model contract):**
- Status-переходы строгие: `zgloszony → w_trasie → zjechal`. Переход `markReturned` обновляет `Vehicle.lastDroveAt = now()` (auto-side-effect, не выставляется руками).
- Перевозчик может анулировать только свои `zgloszony`.
- Верификатор может анулировать любой.
- `trailerId`, `driverId`, `plannedReturnAt`, `returnCountry`, `returnPostalCode` — все NOT NULL (migration `20260518113943_delegation_required_fields_and_date_only`). План возврата задаётся уже на момент `zgloszony`.
- `status='zjechal'` ⇒ `actualReturnAt` обязан быть заполнен. Раньше это гарантировал DB CHECK `delegation_returned_complete` — он удалён, теперь правило enforced на уровне api (в сервисе при переходе статуса).
- DB CHECK на длину: `returnCountry` 2..8 символов (covers `EL`), `returnPostalCode` ≤ 16. Формат-валидация (per-country regex) — на Zod-уровне через `EU_POSTAL_CODES` (см. `packages/shared/src/constants/eu-postal-codes.ts`).

> 🗓️ **PLANNED (Phase 11+):** approval workflow для Delegation + жёсткая связь `Claim.delegationId` (один wniosek на один wyjazd) + блок `departureAt < today`. Появятся новые status-ы `oczekuje_na_akceptacje` / `odrzucony`, поля `plannerSnapshotId` / `dispatcherSnapshotId` / `approvedById` / `approvedAt` / `rejectedById` / `rejectedAt` / `rejectionReason`. Полная спецификация — [17-migration-roadmap.md#фаза-11--wyjazd-approval-workflow-планируется-после-launch](17-migration-roadmap.md#фаза-11--wyjazd-approval-workflow-планируется-после-launch).
>
> 🔁 **Подтверждено 2026-06-11:** связь `Claim.delegationId` — **ядро фазы, не отменяется** (кратковременная «отмена» 2026-06-09 была недоразумением из-за потери контекста между сессиями). Эволюция: gating-статус выезда для подачи wniosek смещается к новому **`zakończony`** (рейс закрыт + км weryfikatora проверены по дням), а `mileage` wniosku **выводится из Σ дневных км weryfikatora** — перевозчик в идеале лишь выбирает `zakończony`-выезд и подтверждает. Детали — в roadmap-спеке (Шаг B).

### `MonthlyLimit` — лимиты на месяц

Двумерная таблица (год × месяц). На каждый месяц — `kmPerDay` (дневной лимит км) и `ratePerKm` (ставка EUR/km). Используется в расчёте `calcKmGwarantPerMonth`.

| Поле |
|---|
| `year` |
| `month` (1..12) |
| `kmPerDay` |
| `ratePerKm` |

Если для месяца запись пустая — fallback на `AppConfig.km_dziennie_default` (540) и `AppConfig.stawka_eur_default` (0.5).

**Инвариант:** unique `(year, month)`.

### `AppConfig` — глобальные параметры

Key-value хранилище для всех бизнес-параметров, которые могут меняться без релиза:

| Ключ | Значение | Описание |
|---|---|---|
| `stawka_eur_default` | `0.5` | EUR/km, fallback (если для (year, month) нет `MonthlyLimit.ratePerKm`) |
| `km_dziennie_default` | `540` | km/день, fallback (если для (year, month) нет `MonthlyLimit.kmPerDay`) |
| `auth_threshold_low` | `1000` | EUR — порог авторизации (low) |
| `auth_threshold_high` | `5000` | EUR — порог авторизации (high) |
| `min_days_to_submit` | `10` | минимум дней до подачи |
| `login_code_ttl` | `600` | секунд — время жизни 2FA-кода |
| `login_max_attempts` | `5` | максимум попыток ввода кода |

> **Authorization threshold ≠ AppConfig.** Порог авторизации зависит от количества дней в трассе, а не от суммы (см. legacy `getAuthThreshold(drivenDays)` — 1000 EUR при ≥61 дне, 800 при ≥31, 500 при ≥16, 300 при 10–15). Эти константы пока зашиты в коде; backlog — вынести в новую таблицу `AuthThresholds` или поля `MonthlyLimit`. Подробности в [19-known-quirks.md](19-known-quirks.md).

### `AuditLog` — аудит

Append-only журнал всех критических операций.

| Поле | Назначение |
|---|---|
| `userId` | FK → User (кто) |
| `userRole` | роль на момент действия (могла поменяться) |
| `action` | строка-идентификатор: `createCarrier`, `updateClaim`, `cancelDelegation`, ... |
| `targetType` | `Carrier` / `Claim` / `Vehicle` / ... |
| `targetKey` | человекочитаемый ключ: `nrZgl`, `plateNumber`, `login` |
| `before` | JSON состояния до |
| `after` | JSON состояния после |
| `reason` | свободный комментарий (опц.) |
| `metadata` | JSON (IP, user-agent, и т.п.) |
| `ipAddress` | IP клиента |

**Инвариант:** запись в audit пишется в той же транзакции, что и сам change. Если main change откатывается — audit тоже.

### `RefreshToken` — JWT-сессии

Для rotation refresh-токенов. Подробности в [15-auth-strategy.md](15-auth-strategy.md).

## Ключевые отношения

| Связь | Описание |
|---|---|
| `User` 1:1 `Carrier` | один аккаунт carrier ↔ один профиль перевозчика |
| `User` 1:N `Carrier` (via opiekunId) | опекун курирует много перевозчиков |
| `Carrier` 1:N `Vehicle/Driver/Trailer` | перевозчик владеет автопарком |
| `Vehicle` N:1 `User` (planner, dispatcher) | назначенные люди MagTrans |
| `Carrier` 1:N `Claim` | перевозчик подаёт заявления |
| `Vehicle` 1:N `Claim` | заявление на конкретное авто |
| `Vehicle` 1:N `Delegation` | выезды авто |
| `Trailer` 1:N `Delegation` | прицеп обязателен |
| `Driver` 1:N `Delegation` | водитель обязателен |
| `Trailer` N:1 `TrailerType` | тип из справочника |
| `User` 1:N `AuditLog` | действия |

## Ключевые инварианты

| Инвариант | Где |
|---|---|
| `Vehicle.plateNumber` уникален в рамках Carrier | DB unique constraint |
| `Claim.nrZgl` уникален глобально | DB unique constraint, atomic generation через `ClaimSequence` |
| `Driver.loginSlug` уникален глобально | DB unique constraint, suffix-2/-3 |
| `Trailer.plateNumber` уникален в рамках Carrier | DB unique constraint |
| `Carrier.opiekunId` указывает на user с role=opiekun | проверка в сервисе при assign |
| `Vehicle.plannerId` → User.role=planista | проверка в сервисе при assign |
| `Vehicle.dispatcherId` → User.role=dyspozytor | проверка в сервисе при assign |
| `Claim.status` всегда из enum | DB enum |
| `Delegation.status` всегда из enum | DB enum |
| Claim status-переходы — только 9 легальных рёбер | `claim-state-machine.ts` + сервис; см. секцию `Claim` |
| Status-переходы Delegation строгие | проверка в сервисе |
| Claim ZAAKCEPTOWANO ⇒ orderNumber+orderDate+amountApproved | DB CHECK `claim_accepted_payment_complete` |
| Delegation zjechal ⇒ actualReturnAt заполнен | сервис (api enforce) при переходе статуса. План возврата (`returnCountry`/`returnPostalCode`) уже NOT NULL на этапе `zgloszony` |
| Vehicle gps=true ⇒ gpsMobilePhone | DB CHECK `vehicle_gps_device_when_gps_on` |
| `Vehicle.lastDroveAt` всегда выставляется системой при Delegation→`zjechal` | сервис, не UI |
| Audit пишется для всех mutating ops | interceptor |

> **CHECK constraints как часть data-model contract.** Это не имплементационная деталь и не оптимизация — это бизнес-правила, которые должны держаться независимо от того, какой код пишет в БД. См. [12-database-schema.md#миграции](12-database-schema.md#миграции) для точного SQL и [19-known-quirks.md](19-known-quirks.md) для нюансов.

## Soft-delete

| Сущность | Стратегия |
|---|---|
| User, Carrier, Vehicle, Driver, Trailer, Claim, Delegation | soft (`deletedAt: timestamp?`) |
| RefreshToken | hard (по `expiresAt`) |
| AuditLog | append-only, не удаляется |

## Cascade при удалении Carrier

`hard-delete` Carrier (только admin) каскадно soft-deletes:
- все Vehicle перевозчика,
- все Driver перевозчика,
- все Trailer перевозчика.

Связанные `Claim` и `Delegation` остаются (compliance) — `vehicleId` становится NULL, snapshot-поля сохраняют исторический контекст.

## Связь с реализацией

- Postgres-схема (Prisma): [12-database-schema.md](12-database-schema.md).
- API endpoints CRUD: [13-api-design.md](13-api-design.md).
- Бизнес-правила доступа по ролям: [03-roles.md](03-roles.md).
