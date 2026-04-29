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
| `name`, `company` | контакты |
| `active` | блокировка логина |
| `liderEmail` | только для `planista` — email лидера группы (для рассылки) |

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
| `nip`, `vatId` | налоговые идентификаторы |
| `contactPerson`, `phone`, `ordersEmail` | контакты |
| `accountEur`, `accountPln` | IBAN счета |
| `paymentTerms` | срок оплаты в днях |
| `insuranceValue`, `insuranceExpiry`, `licenseExpiry` | документы |
| `numberOfPermits` | KREPTD-выписки |
| `companyAddress` | адрес |
| `opiekunId` | FK → User (с role=opiekun) — кто курирует |

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
| `certificateL` | L1 / L2 / L3 (шумовой класс) |
| `euro` | III / IV / V / VI |
| `adrClasses` | string[] классов опасных грузов |
| `gps`, `fuelCard`, `cabotageDe`, `cabotageFr`, `gb`, `it`, `fr`, `agreement`, `contract` | флаги допусков |
| `type` | MEGA / STD / COIL |
| `wasteAllowed`, `wasteCountries` | разрешения на отходы |
| `rateDe`, `rateUe`, `rateExport`, `rateImport` | EUR/km по направлениям |
| `gpsMobilePhone` | телефон GPS-устройства |
| `nextInspectionDate` | следующий техосмотр |
| `sideNumber` | NrBoczny |
| `lastDroveAt` | автообновление от Delegation.markReturned |

**Инварианты:**
- Уникальность `(carrierId, plateNumber)` — один номер на перевозчика.
- `plannerId` / `dispatcherId` — пользователи с соответствующей ролью.

### `Driver` — водитель

Принадлежит перевозчику.

| Поле | Назначение |
|---|---|
| `carrierId` | FK → Carrier |
| `loginSlug` | уникальный slug `имя.фамилия` (с суффиксом -2/-3 при коллизии) |
| `firstName`, `lastName` | имя |
| `phone`, `phone2`, `email` | контакты |
| `driverLicenseNumber`, `licenseExpiry` | права |
| `bankAccount` | IBAN |
| `active` | флаг |

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
| **Авторизация** (для крупных сумм): | |
| `authorizationRequired`, `authorizationDescription`, `authorizationToken`, `authorizationDecidedAt` | |
| `amountRequested`, `amountApproved`, `margin`, `amountMaximum` | |
| `authScreenshotUrl` | URL screenshot-а в file-storage |
| **Рекламация** (зеркало для отката): | |
| `reklamacjaSubmitted`, `reklamacjaText`, `reklamacjaResponse`, `reklamacjaAmount` | |
| `hoursAdjusted`, `statusBeforeReklamacja` | |
| `origDateStart`, `origDateEnd`, `origMileage` | оригинальные значения |

**Инварианты:**
- `nrZgl` уникален глобально, генерируется атомарно.
- При переходе в `REKLAMACJA` копируются `dateStart/dateEnd/mileage` в `origDateStart/origDateEnd/origMileage`.
- `status` всегда из enum (валидируется на API-уровне).
- `vehicleId` может стать NULL если авто удалено — тогда показываем `vehiclePlateSnapshot`.

### `Delegation` — выезд (рейс)

Описывает один логистический рейс.

| Поле | Назначение |
|---|---|
| `vehicleId` | FK → Vehicle |
| `trailerId` | FK → Trailer (опц.) |
| `driverId` | FK → Driver (опц.) |
| `carrierId` | FK → Carrier |
| `driverNameSnapshot`, `driverPhoneSnapshot` | snapshot контактов на момент выезда |
| `departureAt`, `departureCountry`, `departurePostalCode` | старт |
| `plannedReturnAt`, `returnCountry`, `returnPostalCode` | план возврата |
| `actualReturnAt` | факт возврата |
| `status` | `zgloszony` → `w_trasie` → `zjechal` (или `anulowany` на любой стадии) |
| `reportedById` | FK → User (кто зарегистрировал) |
| `verifiedById` | FK → User (верификатор, изменивший статус) |
| `notes` | заметки |

**Инварианты:**
- Status-переходы строгие: `zgloszony → w_trasie → zjechal`. Переход `markReturned` обновляет `Vehicle.lastDroveAt`.
- Перевозчик может анулировать только свои `zgloszony`.
- Верификатор может анулировать любой.

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
| `stawka_eur_default` | `0.5` | EUR/km, fallback |
| `km_dziennie_default` | `540` | km/день, fallback |
| `auth_threshold_low` | `1000` | EUR — порог авторизации (low) |
| `auth_threshold_high` | `5000` | EUR — порог авторизации (high) |
| `min_days_to_submit` | `10` | минимум дней до подачи |
| `login_code_ttl` | `600` | секунд — время жизни 2FA-кода |
| `login_max_attempts` | `5` | максимум попыток ввода кода |

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
| `Trailer` 1:N `Delegation` | (опц.) с прицепом |
| `Driver` 1:N `Delegation` | (опц.) с водителем |
| `Trailer` N:1 `TrailerType` | тип из справочника |
| `User` 1:N `AuditLog` | действия |

## Ключевые инварианты

| Инвариант | Где |
|---|---|
| `Vehicle.plateNumber` уникален в рамках Carrier | DB unique constraint |
| `Claim.nrZgl` уникален глобально | DB unique constraint, atomic generation |
| `Driver.loginSlug` уникален глобально | DB unique constraint, suffix-2/-3 |
| `Trailer.plateNumber` уникален в рамках Carrier | DB unique constraint |
| `Carrier.opiekunId` указывает на user с role=opiekun | проверка в сервисе при assign |
| `Vehicle.plannerId` → User.role=planista | проверка в сервисе при assign |
| `Vehicle.dispatcherId` → User.role=dyspozytor | проверка в сервисе при assign |
| `Claim.status` всегда из enum | DB enum |
| `Delegation.status` всегда из enum | DB enum |
| Status-переходы Delegation строгие | проверка в сервисе |
| Audit пишется для всех mutating ops | interceptor |

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
