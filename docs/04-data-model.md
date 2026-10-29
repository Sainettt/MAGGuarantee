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
    │ │ plannerId/        │          │                     │
    │ │ dispatchTeamId ───┼──────────┼─── (User as planner; Team as dispatch team)
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
| `liderId` | ✅ **2026-09-28 (схема, миграция `20260928120000_vehicle_planner_transfer`)** — только для `planista`: FK → User, лидер этого планисты ([29](29-vehicle-planner-transfer-plan.md) R8, U9). Цель — активный `planista` с `lider = true`, не он сам (проверяет api). Ставит только admin; reconcile с MAGSpace поле не трогает. NULL = лидера нет → заявки на передачу его машин решает только admin (R4). Снятие флага `lider` у лидера `liderId` не очищает, но решать заявки может только тот, у кого `lider = true` в момент решения (U10) |
| `liderEmail` | ⛔ **устарело (2026-09-28)** — заменено `liderId`; миграция перенесла совпавшие e-mail, api поле больше не читает. Колонка удаляется отдельным релизом (R8) |
| `lider` | ✅ **2026-09-25** — флаг лидера **над** ролью из `LIDER_ROLES` (`planista` / `dyspozytor` / `opiekun` / `pracownik` / `eksport`); «lider_planista» = `role: planista` + `lider: true`, не значение `role`. CHECK `user_lider_requires_lider_role`. Владение как у `role` (маппинг stanowiska или admin). Не путать с `liderId` (кто лидер конкретного планисты). См. [03-roles.md#lider](03-roles.md#lider), [28-lider-roles-plan.md](28-lider-roles-plan.md) |
| `extraPermissions` | ✅ **2026-10-27 (схема, миграция `20261027120000_user_permission_overrides`)** — права **сверх** роли ([25](25-permissions-layer-plan.md) §3 B6), `text[]`, по умолчанию `{}`. Учитываются только значения из `GRANTABLE_EXTRA[role]` (shared): api фильтрует на записи (422) и на чтении, прочие строки инертны. Эффективные права = `(permissionsFor(role, lider) ∪ extraPermissions) − deniedPermissions`. Ставит только admin (UserSheet), в т.ч. у `managedBy = magspace`. Синхронизация со справочником их не ставит, но после смены `role`/`lider` вычищает неподходящие значения (с audit-строкой). Первый случай — перевозчик с `carrier_documents.read` + `.add` |
| `deniedPermissions` | ✅ **2026-10-27** — права, **отозванные** у роли, `text[]`, по умолчанию `{}`; отзыв побеждает добавление. Значение вне `permissionsFor(role, lider)` инертно; у admin всегда пусто (api 422). Владение и чистка — как у `extraPermissions`. CHECK по каталогу прав нет: каталог живёт в коде |
| `teamId` | ✅ **Phase 11 (реализовано 2026-06-17)** — только для `dyspozytor`, FK → Team (команда, в которой состоит диспетчер) |

> ⚠️ Поля `company` (Firma) на `User` **больше нет** — оно перенесено на `Carrier` миграцией `20260507223021_move_company_to_carrier`. Внутренние роли MAGTRANS (admin/pracownik/opiekun/planista/dyspozytor/eksport/weryfikator) — это сотрудники одной компании, поле было денормализованным наследием GAS-миграции, которое использовалось только перевозчиками.

**Связи:**
- 1:1 с `Carrier` (если role=przewoznik).
- 1:N с `Carrier.opiekun` (если role=opiekun).
- 1:N с `Vehicle.planner` (planista, ведущий спедитор — **текущий**).
- N:1 с `User` (via `liderId`, только planista) — его лидер; обратно `ledPlanners`.
- 1:N с `Delegation.planner` (снимок планисты периода выезда).
- 1:N с `VehiclePlannerTransfer` (как `fromPlanner` / `toPlanner` / `requestedBy` / `decidedBy`) и `VehiclePlannerAssignment` (как `planner` / `actor`).
- N:1 с `Team` (via `User.teamId`, только для dyspozytor).
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
| `plannerId` | FK → User (role=planista) — ведущий спедитор (один), **текущий**. Денормализованный указатель: равен планисте открытой строки `VehiclePlannerAssignment`. Задаётся при создании машины, дальше меняется **только** одобрением `VehiclePlannerTransfer` ([29](29-vehicle-planner-transfer-plan.md) R1, R7) |
| `dispatchTeamId` | ✅ **Phase 11 (реализовано 2026-06-17)** — FK → Team, **заменил** `dispatcherId` (миграция `20260617120000_phase11_team_dispatch`; оба сменщика видят авто через членство в команде) |
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
| `lastDroveAt` | **автообновление** от `VehicleDailyKm` drove-дня (`max(lastDroveAt, date)`). Никогда не редактируется руками — см. [19-known-quirks.md](19-known-quirks.md) |

**Вложения:** скан умовы и cabotage-разрешения хранятся как `VehicleAttachment` (метаданные + `storageKey` в MinIO; FK на Vehicle `ON DELETE CASCADE`; soft-delete `deletedAt`). Enum `VehicleAttachmentCategory { contract, cabotage_de, cabotage_fr }` — значение `adr` удалено 2026-05-29 (ADR-сертификат переехал на Driver). Boolean `Vehicle.adr` сохранён.

**Инварианты (data-model contract):**
- Уникальность `(carrierId, plateNumber)` — один номер на перевозчика.
- `plannerId` — пользователь с ролью planista (ведущий спедитор). Ставится при создании (обязателен, R7) вместе со строкой журнала `create`; после — только через одобренную заявку на передачу, в одной транзакции с закрытием/открытием строк журнала. Прямой правки нет ни у кого, включая admin (R1). `plannerId` = `plannerId` открытой строки `VehiclePlannerAssignment` (NULL ⇔ открытой строки нет).
- Экраны уровня машины (флот, GPS, отчёт по км, список и карточка машины) читают `plannerId` **живьём** — старый планиста теряет машину в них сразу после передачи (U7). Исторические — только выезды (`Delegation.plannerId`), получатели писем по wnioskam и имя планисты в Chat-сообщении.
- `dispatchTeamId` — ссылка на активную `Team`; все её `dispatchers` (role=dyspozytor) считаются ведущими авто.
- **CHECK `vehicle_gps_device_when_gps_on`** — если `gps=true`, то `gpsMobilePhone` обязан быть not-null. Это часть data-model contract, не имплементационная деталь.

**Операционный статус — производный (не хранится):** статус авто вычисляется на read-стороне из выездов + `createdAt`, отдельной колонки статуса НЕТ.
- `aktywna` — есть НЕ-терминальный `Delegation` (`status ∈ {zgloszony, gotowy, w_trasie}`).
- Иначе якорь = `max(Delegation.actualReturnAt по zjechal, не soft-deleted) ?? Vehicle.createdAt`; `daysSinceReturn` = **календарные** дни от якоря до сегодня: `stojąca` 0–14, `nieaktywna` 15–28, `do_usunięcia` ≥29. Дата якоря-съезда берётся из настенного варшавского времени как есть (`startOfWallClockDayUtc`, docs/19 #16), а `createdAt` как настоящий момент приводится к варшавской дате (UWAGI #26, 2026-10-27).
- Ежедневный cron шлёт всем активным админам письмо про каждое авто `≥29` дней (по ВСЕМ авто, не только гарантийным), повтор раз в 3 календарных дня; дедуп через `Vehicle.adminRemovalNotifiedAt` / `adminRemovalNotifyCount` (см. [12-database-schema.md](12-database-schema.md)). Сама формула статуса и cron — в api-слое.
- Ручной `active=false` = `wyłączona` — **ортогонален** этой шкале (админ выключил авто вручную; не путать с производной idle-эскалацией).

### `Team` — команда диспетчеров

> ✅ **РЕАЛИЗОВАНО (Phase 11, 2026-06-17)** — модель `Team` в схеме, `Vehicle.dispatchTeamId` заменил одиночный `dispatcherId` (миграция `20260617120000_phase11_team_dispatch`), admin ведёт CRUD команд в UI (см. [17-migration-roadmap.md](17-migration-roadmap.md) Шаг D — фаза закрыта).

> **2026-10-29 — одно поле `name`.** Пара `code` (строгий формат N.N.N) + необязательный `name` схлопнута в одно обязательное уникальное поле `name` («Nazwa zespołu», свободный текст, формат не проверяется; миграция `20261029120000_team_single_name`). Справочник — только команды диспетчеров («zespół dyspozytorów»); планиста выбирается на машине отдельно, поэтому второй ярлык был лишним. Понятие SPED «zespół prowadzący» = диспетчеры + планиста к этой сущности не относится.

Команда диспетчеров (название — обычно номер вида `1.23`), к которой привязывается авто. Отражает реальный процесс MAGTRANS: во внешней системе maciosoft (Sped Trans) машине приписывается не один человек, а целая команда; раньше состав команд вёлся вручную в Excel (raport DAF). В MAGGuarantee справочник команд ведёт **admin** — это явная замена тому Excel.

| Поле | Назначение |
|---|---|
| `name` | unique — название команды («Nazwa zespołu»), свободный текст, обычно номер вида `1.23`; формат не проверяется |
| `active` | флаг активности |
| `dispatchers` | 1:N → User (role=dyspozytor) — состав команды (обычно 2 по сменам, но число **НЕ** фиксировано) |

**Связи:**
- 1:N с `User` (via `User.teamId`) — диспетчер состоит ровно в одной команде.
- 1:N с `Vehicle` (via `Vehicle.dispatchTeamId`) — на одну команду назначено много авто.

**Инварианты:**
- `Team.name` уникален.
- `User.teamId` указывает на user с role=dyspozytor.
- `Vehicle.dispatchTeamId` ссылается на активную `Team`.

> **Смену (zmiana) НЕ храним** — она меняется каждую неделю; для уведомлений достаточно имён всех диспетчеров команды.

> **Спедитор — НЕ через команду.** В уведомление о выезде летит один ведущий спедитор = планиста **из снимка выезда** `Delegation.plannerId` (planista; при создании выезда = `Vehicle.plannerId`, [29](29-vehicle-planner-transfer-plan.md) §3.3). Team существует только для диспетчеров.

**Уведомление о zgłoszeniu wyjazdu** разворачивает получателей так: `Vehicle.dispatchTeam.dispatchers` (все) + `Delegation.planner` (один, снимок) + `Carrier.opiekun`. Верификацию/акцепт выезда выполняет диспетчер из команды авто (см. [03-roles.md](03-roles.md) и [17-migration-roadmap.md](17-migration-roadmap.md) Phase 11).

### `VehiclePlannerTransfer` — заявка на передачу машины другому планисте

> ✅ **Реализовано 2026-09-28** — схема (миграция `20260928120000_vehicle_planner_transfer`), api (`modules/planner-transfers/`), web ([29](29-vehicle-planner-transfer-plan.md) §11).

После создания машины планиста меняется **только** заявкой (R1). Подают: opiekun перевозчика машины, текущий планиста или admin на любую машину (R2; U1 пересмотрен 2026-10-23). Решают: admin или лидер `fromPlanner` (R3); автор заявки и получатель решить её не могут, у планисты без лидера решает только admin (R4) — заявку admin'а решает другой admin или лидер текущего планисты, а если таких нет, её можно только отменить. Автор может отменить свою `pending`-заявку (U4). Уведомлений нет (R9).

| Поле | Назначение |
|---|---|
| `vehicleId` | FK → Vehicle |
| `fromPlannerId` | FK → User — планиста машины в момент подачи (при одобрении api перепроверяет, что он всё ещё текущий, иначе 409 — U6) |
| `toPlannerId` | FK → User — кому передать (активный планиста, не текущий — U2) |
| `requestedById` | FK → User — автор (opiekun или текущий планиста) |
| `status` | `pending` → `approved` / `rejected` / `cancelled` (enum `PlannerTransferStatus`) |
| `reason` | причина подачи — обязательна (U3) |
| `decisionComment` | причина отклонения (обязательна при `rejected`) / комментарий к одобрению (опц.) |
| `decidedById`, `decidedAt` | кто и когда закрыл заявку — для всех трёх терминальных статусов (при `cancelled` — сам автор) |

**Инварианты:**
- ≤1 `pending`-заявки на машину — DB partial unique `VehiclePlannerTransfer_pending_vehicle_key`.
- `fromPlannerId ≠ toPlannerId`; `reason` непустая; `pending ⇔ decidedAt IS NULL`; `rejected` ⇒ непустой `decisionComment` — DB CHECK.
- Кто может подать / решить / отменить, «лидер именно `fromPlanner`» (`fromPlanner.liderId = решающий` и у решающего `lider = true` в момент решения — U10), активность машины и получателя — api (проверка ресурса в сервисе, §3.1 [29](29-vehicle-planner-transfer-plan.md)).
- Деактивация машины отменяет её `pending`-заявку (U6) — api.
- Одобрение (одна транзакция, §3.2 [29](29-vehicle-planner-transfer-plan.md)): `Vehicle.plannerId = toPlanner`; открытая строка журнала закрывается (`validTo = now`), открывается новая (`source = transfer`, ссылка на заявку); выезды машины `zgloszony`/`gotowy` с `plannerId = fromPlanner` переходят `toPlanner` (R6); заявка → `approved`.
- Append-only: строки не удаляются (soft-delete нет), меняется только статус и поля решения.

### `VehiclePlannerAssignment` — журнал назначений планисты

> ✅ **Схема — 2026-09-28** (та же миграция).

Кто был планистой машины и с какого по какое время. Показывается в карточке машины (кто, период, от кого к кому, кто подал, кто одобрил — через связанную заявку).

| Поле | Назначение |
|---|---|
| `vehicleId` | FK → Vehicle |
| `plannerId` | FK → User (planista) |
| `validFrom`, `validTo` | период назначения (timestamp); `validTo = NULL` — текущее. Передача вступает в силу сразу при одобрении (U5) |
| `source` | `create` (при создании машины) / `transfer` (одобренная заявка) / `backfill` (миграция — для машин, у которых планиста уже был) |
| `transferId` | FK → VehiclePlannerTransfer — заявка, открывшая строку (только и обязательно при `source = transfer`; 1:1) |
| `actorId` | FK → User — создатель машины (`create`) / одобривший (`transfer`); пусто для `backfill` |

**Инварианты:**
- ≤1 открытой строки на машину — DB partial unique `VehiclePlannerAssignment_open_vehicle_key`; её `plannerId` = `Vehicle.plannerId` (держит api в транзакции).
- `validTo ≥ validFrom`; `source = transfer ⇔ transferId` задан — DB CHECK.
- Append-only: единственное изменение — закрытие открытой строки. Физически удаляется только вместе с машиной (FK `ON DELETE CASCADE` — rollback неудачного создания машины).
- Получатели писем по wniosku без выезда — все планисты, чьи периоды назначения пересекают `[dateStart, dateEnd]` wniosku (U8).

> **Ограничение бэкфилла.** Кто вёл машину до выката фичи, неизвестно: миграция открыла по одной строке `backfill` c `validFrom = Vehicle.createdAt` на текущего планисту и приписала ему все прошлые выезды. Точная история начинается с выката.

### `VehicleDailyKm` — дневной километраж (weryfikator)

Новый процесс: `weryfikator` ежедневно проставляет, сколько км проехала каждая машина (сверяясь со SpedTrans+GPS). Одна запись на `(машина, день)`. **Фундамент денег** — пробег в `Claim` выводится отсюда. Заменяет route-status доску (см. [20-phase-7-eksport-weryfikator.md](20-phase-7-eksport-weryfikator.md) §0′).

| Поле | Назначение |
|---|---|
| `vehicleId` | FK → Vehicle |
| `date` | день (date-only) |
| `km` | Int? — км за день; null при `idle` |
| `state` | `drove` (ехала) / `idle` (проверено-стоит). Нет записи за день = «не проверено» (`nieznany`, не хранится) |
| `source` | `manual` (weryfikator) / `gps` (внешний, без notedBy) |
| `notedById` | FK → User (кто отметил; null для gps) |
| `notes` | заметка |

**Инварианты:** `@@unique(vehicleId, date)` (одна отметка/день, upsert). При `state=drove` api обновляет `Vehicle.lastDroveAt = max(lastDroveAt, date)`.

**Производный статус машины** (не хранится): последняя по `date` запись → `drove` ⇒ `w ruchu`; `idle` ⇒ `nie jeździ`; нет в периоде ⇒ `nieznany`.

> **Деньги:** `Claim.mileage` предзаполняется как `Σ km (state=drove)` за период машины; `pracownik` сверяет. Связи `Claim↔Delegation` НЕТ (см. `Delegation`).

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
| `delegationId` | FK → Delegation, **unique** (один wniosek на выезд). Nullable в БД (легаси), обязателен для новых. Выезд даёт машину/прицеп/водителя + два якоря правил (пол по `departureAt`, дедлайн от `actualReturnAt`); период, часы и пробег заявляет перевозчик — см. §0⁗ в [20](20-phase-7-eksport-weryfikator.md) |
| `dateStart`, `dateEnd` | период гарантии — **заявляет перевозчик** (разворот 2026-07-30); `dateStart` не раньше заявленной даты выезда, `dateEnd` не ограничена; pracownik правит при верификации |
| `timeFrom`, `timeTo` | часы (`HH:MM`, для дробных дней) — **вводит перевозчик** (обязательны, разворот 2026-07-30); `pracownik` может переопределить при верификации (снапшот заявленного — в `origTimeFrom`/`origTimeTo`) |
| `mileage` | фактический пробег км — **вводит перевозчик** (свободный, по данным SpedTrans; разворот 2026-07-30). `Σ VehicleDailyKm` больше не источник, а эталон для сверки в модалке pracownika; `pracownik` правит |
| `kmGuaranteed` | расчётный гарантированный км |
| `kmDifference` | gwarant − mileage |
| `paymentEur` | сумма доплаты |
| `ratePerKmEffective` | взвешенная EUR/km по месяцам |
| `breakdown` | JSON помесячного расчёта |
| `status` | `NA_WERYFIKACJI` / `ZAAKCEPTOWANO` / `ODRZUCONO` / `REKLAMACJA` / `OCZEKUJE_NA_AUTORYZACJE` |
| `decidedById` | FK → User (кто верифицировал) |
| `comment`, `orderNumber`, `orderDate` | мета |
| `decisionComment` | обоснование решения верификатора по wnioskowi: обязательно при `ODRZUCONO`, опционально при `ZAAKCEPTOWANO` (только api, без CHECK; миграция `20261022120000_claim_decision_comment`). `comment` с этого момента — только заметка перевозчика с submit, персонал его не пишет; у строк, решённых `ZAAKCEPTOWANO` до миграции, в `comment` может остаться текст верификатора. Ответы по рекламации — в `reklamacjaResponse` |
| **Авторизация — автоматический Maksim-gate** (для крупных сумм; порог `getAuthThreshold(drivenDays)` — см. [19-known-quirks.md](19-known-quirks.md#getAuthThreshold)): | |
| `maksimGateRequired`, `maksimGateNotifiedAt`, `maksimGateNotifiedAmount` | гейт armed при `paymentEur > próg` на zapisie weryfikacji → **авто-переход** в `OCZEKUJE_NA_AUTORYZACJE` + email Maksim'у (dedup по сумме) |
| `maksimGateClearedAt`, `maksimGateClearedById` | снятие гейта загрузкой скриншота подтверждения (`ClaimAttachment` категории `AUTORYZACJA_MAKSIMA`) — разблокирует решение |
| `origPaymentEur`, `paymentEur`, `amountApproved` | **цепочка из трёх сумм, читается только вместе:** `origPaymentEur` — что перевозчик запросил изначально (заморожено при submit, `null` у строк до миграции — показывать прочерк, НЕ подставлять текущее); `paymentEur` — km-calc ПОСЛЕ корректировок верификатора (переписывается каждой правкой и авто-пересчётом выезда); `amountApproved` — что реально платим (пишется только при переходе в `ZAAKCEPTOWANO`). Поле `amountRequested` удалено 2026-07-26 (`drop_claim_amount_requested`) — оно было побайтовым зеркалом `paymentEur`, но подписывалось в UI как «Wnioskowana» и выдавало пост-верификационную сумму за запрос перевозчика |
| **Рекламация** (зеркало для отката): | |
| `reklamacjaSubmitted`, `reklamacjaText`, `reklamacjaAmount` | одна рекламация на wniosek (`reklamacjaSubmitted` — one-shot флаг, не сбрасывается); подаётся только на **решённый** wniosek (`ZAAKCEPTOWANO`/`ODRZUCONO`) в течение 48ч от `statusChangedAt`; `reklamacjaAmount` ≤ `origPaymentEur − (amountApproved если ZAAKCEPTOWANO, иначе 0)` |
| `reklamacjaResponse` | ответ MAGTRANS перевозчику; **обязателен как обоснование** при исходе `ODRZUCONA` |
| `reklamacjaResolution` | **исход решения pracownika/admina** — `UZNANA` / `ODRZUCONA` (enum `ReklamacjaResolution`, миграция `20260731120000_add_reklamacja_resolution_fields`). `NULL` = рекламации не было **или** она ещё в работе (pending ⇔ `status = REKLAMACJA`). Намеренно **не** значение `ClaimStatus`: статус при решении откатывается к `statusBeforeReklamacja` при **любом** исходе, поэтому исход нуждается в собственной колонке |
| `reklamacjaOrderNumber` | «Nr zlecenia», по которому выплачивается **уznana** рекламация. Пишется только при `UZNANA`. Независим от `orderNumber` wniosku: UI префиллит из него, но значения могут расходиться (юридически MAGTRANS обычно правит старое zlecenie, иногда выпускает новое). DB CHECK `claim_reklamacja_resolution_complete` требует непустое значение при `UZNANA` |
| `reklamacjaSubmittedAt`, `reklamacjaDecidedAt`, `reklamacjaDecidedById` | аудит рекламации: когда подал перевозчик / когда и кто решил (FK → User, `ON DELETE SET NULL`). `reklamacjaSubmittedAt` нельзя вывести из `statusChangedAt` — решение его перештампывает при откате статуса |
| `statusBeforeReklamacja` | предыдущий статус до перехода в `REKLAMACJA`; **именно он** определяет, куда вернётся `status` при решении рекламации (для rollback) |
| ⚠️ `amountApproved`, `orderNumber`, `orderDate` | **никогда** не изменяются рекламацией — выплата wniosku и выплата рекламации живут раздельно (поэтому CHECK `claim_accepted_payment_complete` остаётся валидным при любом исходе рекламации) |
| `origDateStart`, `origDateEnd`, `origMileage`, `origHoursAdjusted` | immutable carrier snapshots (set-once at submit; `submitReklamacja` re-stamps с fallback `?? текущее значение`) |
| `origTimeFrom`, `origTimeTo` | immutable snapshot деривированных часов (`HH:MM`) на submit; `pracownik`-PATCH их не трогает (правит рабочие `timeFrom`/`timeTo`) |
| `hoursAdjustedValue` | currently applied korekta godzin — drives km-calc (`korektaDni = hoursAdjustedValue / 24`); верификатор PATCH может править только этот столбец, `origHoursAdjusted` остаётся неизменным |
| `periodAdjustedByVerifier` | `Boolean @default(false)` — маркер «период (`dateStart/dateEnd`) правил pracownik». Граница авто-пересчёта: если `true`, переход выезда `→ zjechal` НЕ перетирает период. См. §0″ [20](20-phase-7-eksport-weryfikator.md) |

> **`breakdown` (per-month JSON).** Каждая месячная строка несёт: `workingDays` (**теперь только будни**, пн–пт), `kmPerDay`, `ratePerKm`, `kmInMonth`, `excludedDays` и субботние поля субботней гарантии — `saturdaysCounted` (кол-во зачтённых нечётных суббот, целое ≥0), `kmPerSaturday` (км за субботу; `0` ⇒ фича для месяца выключена), `kmFromSaturdays` (= `round(saturdaysCounted × kmPerSaturday)`), `saturdayDays` (ISO-даты зачтённых суббот). Полное число дней месяца = `workingDays + saturdaysCounted`; `kmInMonth` — **гранд-тотал** = `round(workingDays × kmPerDay) + kmFromSaturdays` (Σ `kmInMonth` = `kmGuaranteed`). Зачётные субботы засчитываются как дни (`drivenDays`/`rawTotalDays`) и потому влияют на порог авторизации Максима и средний км/день. Форма — `MonthBreakdownSchema`, см. [13-api-design.md](13-api-design.md).

**Инварианты (data-model contract):**
- `nrZgl` уникален глобально, генерируется атомарно через `ClaimSequence` (per `YY-MM`).
- При переходе в `REKLAMACJA` копируются `dateStart/dateEnd/mileage` в `origDateStart/origDateEnd/origMileage` (frozen mirror — см. [19-known-quirks.md](19-known-quirks.md#reklamacja-mirror)).
- `status` всегда из enum (валидируется на API-уровне).
- `vehicleId` может стать NULL если авто удалено — тогда показываем `vehiclePlateSnapshot`.
- **State machine** — Claim status переходы ограничены 10 легальными ребрами. Источник истины — `apps/api/src/modules/claims/claim-state-machine.ts`. Сводка:
  - `NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJE` — **только автоматически** (zapis weryfikacji при `paymentEur > próg`; PATCH этот статус не таргетит)
  - `NA_WERYFIKACJI → ZAAKCEPTOWANO | ODRZUCONO`
  - `OCZEKUJE_NA_AUTORYZACJE → NA_WERYFIKACJI` — **только автоматически** (правка увела сумму под порог; гейт чистится)
  - `OCZEKUJE_NA_AUTORYZACJE → ZAAKCEPTOWANO | ODRZUCONO` (решение; разблокируется скриншотом подтверждения)
  - `ZAAKCEPTOWANO → REKLAMACJA` (carrier-инициированная — отдельный endpoint, не PATCH)
  - `ODRZUCONO → REKLAMACJA` (то же)
  - `REKLAMACJA → ZAAKCEPTOWANO | ODRZUCONO` — **решение рекламации (pracownik/admin). Оба ребра остаются легальными, но исход решения их НЕ выбирает:** статус возвращается к `statusBeforeReklamacja` при **любом** исходе (рекламация на отклонённом wniosku, признанная `UZNANA`, возвращает его в `ODRZUCONO`, а не в `ZAAKCEPTOWANO`). Какое ребро будет пройдено — диктует `statusBeforeReklamacja`; сам исход пишется в `reklamacjaResolution` (`UZNANA` требует `reklamacjaOrderNumber`, `ODRZUCONA` — `reklamacjaResponse`)
  - Любая иная пара (from, to) — 422 `Niedozwolone przejście statusu wniosku`.
- **CHECK `claim_accepted_payment_complete`** — при `status='ZAAKCEPTOWANO'` поля `orderNumber` (не пустое), `orderDate`, `amountApproved` обязаны быть заполнены. Часть data-model contract, не имплементация.
- **CHECK `claim_reklamacja_resolution_complete`** — при `reklamacjaResolution='UZNANA'` поле `reklamacjaOrderNumber` обязано быть непустым. Зеркальное правило (`ODRZUCONA` ⇒ непустой `reklamacjaResponse`) держит api-слой, не БД.

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
| `plannedReturnAt` (date-only, `@db.Date`), `returnCountry`, `returnPostalCode` | план возврата — заполняется на этапе `zgloszony` (продуктовое решение 2026-05). Остаётся date-only: перевозчик время съезда не заявляет |
| `actualDepartureAt` (timestamp) | **точный datetime выезда** — задаётся weryfikator'ом при переходе `gotowy → w_trasie` (дата + время). Из него деривируется `Claim.timeFrom` |
| `actualReturnAt` (timestamp) | **точный datetime съезда** — задаётся weryfikator'ом при переходе `w_trasie → zjechal` (дата + время). Из него деривируется `Claim.timeTo`. Тип БД без изменений; раньше вводилась только дата, теперь — дата + время |
| `status` | `zgloszony` → `gotowy` → `w_trasie` → `zjechal` / `anulowany`. **Операционный** (REWORK 2026-06-20): eksport ставит `gotowy`, weryfikator — `w_trasie`/`zjechal`. См. §0″ в [20](20-phase-7-eksport-weryfikator.md) |
| `reportedById` | FK → User (кто зарегистрировал) |
| `verifiedById` | FK → User (верификатор, изменивший статус) |
| `plannerId` | ✅ **2026-09-28** — FK → User: **снимок** планисты периода выезда ([29](29-vehicle-planner-transfer-plan.md) R5). При создании = `Vehicle.plannerId`; одобрение передачи переписывает его только у `zgloszony`/`gotowy` (R6). По нему — scope выездов планисты, «ZESPÓŁ PROWADZĄCY», имя планисты в Chat-сообщении, получатели писем по wniosku (U8) |
| `notes` | заметки |

**Инварианты (data-model contract):**
- **✅ Status выезда — операционный (REWORK 2026-06-20, §0″ [20](20-phase-7-eksport-weryfikator.md)):** `zgloszony→gotowy→w_trasie→zjechal` проставляются через приложение (eksport→`gotowy`, weryfikator→`w_trasie`/`zjechal`, строгий порядок). `Vehicle.lastDroveAt` обновляется при `zjechal` (`= actualReturnAt`) **и** `VehicleDailyKm` (drove-строка) — `max(...)`. Отменяет «мёртвый груз» 2026-06-12.
- Анулирование (`anulowany`): перевозчик — только свой `zgloszony`; **admin — любой активный** (`zgloszony`/`gotowy`/`w_trasie`). weryfikator/eksport права cancel не имеют (eksport может лишь откатить свой `gotowy→zgloszony`).
- `trailerId`, `driverId`, `plannedReturnAt`, `returnCountry`, `returnPostalCode` — все NOT NULL (migration `20260518113943_delegation_required_fields_and_date_only`). План возврата задаётся уже на момент `zgloszony`.
- `status='zjechal'` ⇒ `actualReturnAt` обязан быть заполнен. Раньше это гарантировал DB CHECK `delegation_returned_complete` — он удалён, теперь правило enforced на уровне api (в сервисе при переходе статуса).
- DB CHECK на длину: `returnCountry` 2..8 символов (covers `EL`), `returnPostalCode` ≤ 16. Формат-валидация (per-country regex) — на Zod-уровне через `EU_POSTAL_CODES` (см. `packages/shared/src/constants/eu-postal-codes.ts`).
- **`plannerId` — исторический снимок, не живое значение.** Старый планиста продолжает видеть выезды, которые вёл; новый видит только выезды после передачи. При одобрении передачи `zgloszony`/`gotowy` уходят новому планисте, `w_trasie` доводит старый до возврата, `zjechal`/`anulowany` остаются за старым (R6). Ставит и переписывает только api (не редактируется в UI). NULL — только у выездов машины, у которой на момент миграции не было планисты.
- **≤1 активный выезд на машину** — у машины может быть максимум один НЕ-терминальный выезд (`status ∈ {zgloszony, gotowy, w_trasie}`). Enforced на уровне api при создании (`DelegationsService.add` → 409 Conflict, если машина уже на/ожидает рейс); терминальные (`zjechal`/`anulowany`) и soft-deleted строки не блокируют. Проверка только на create — далее инвариант держится по индукции (DB unique-constraint нет, это service-level guard).

> ⚠️ **ЧАСТИЧНО ОТМЕНЕНО РАЗВОРОТОМ 2026-07-30 (§0⁗):** связь `Claim.delegationId` остаётся, но период и `mileage` **из выезда больше не берутся** — их заявляет перевозчик; авто-пересчёт при позднем `zjechal` мёртв (подача возможна только из `zjechal`). Ниже — историческая формулировка.
>
> ✅ **ВВЕДЕНО ОБРАТНО (REWORK 2026-06-20 #4, §0″ [20](20-phase-7-eksport-weryfikator.md)):** связь `Claim.delegationId` (FK, **unique**) вводится. Перевозчик подаёт wniosek на конкретный выезд (`w_trasie`/`zjechal`), период берётся из выезда, `mileage` = `Σ VehicleDailyKm` за период. При позднем `zjechal` с другой датой — авто-пересчёт периода wniosek **только в `NA_WERYFIKACJI`** (untouched); после любого решающего действия pracownik (отправка на авторизацию / решение / правка периода) — заморожен (границы — см. §0″). Это разворачивает «нет FK» (2026-06-12) и возвращает идею memory `wniosek-wyjazd-linked` (2026-06-11) в коде. `mileage` по-прежнему = `Σ VehicleDailyKm` (предзаполнение + override). Approval-workflow Аркадиуша — отдельный Phase 11, не в этом слайсе.

### `MonthlyLimit` — лимиты на месяц

Двумерная таблица (год × месяц). На каждый месяц — `kmPerDay` (дневной лимит км), `ratePerKm` (ставка EUR/km) и опц. `kmPerSaturday` (км за одну зачётную субботу). Используется в расчёте `calcKmGwarantPerMonth`.

| Поле |
|---|
| `year` |
| `month` (1..12) |
| `kmPerDay` |
| `ratePerKm` |
| `kmPerSaturday` (опц.) |

**Трёхзначная семантика значений (2026-09-20).** На админском листе лимитов (`/employee/limits`) есть чекбоксы «gwarancja włączona» и «soboty»; при снятии галки в БД пишется `0`. Раньше `0` был невозможен (Zod `.positive()`), теперь `NULL` и `0` — **разные бизнес-состояния**, и разница несёт деньги:

| Значение в БД | Смысл | Что делает km-calc |
|---|---|---|
| строки нет / `NULL` | месяц не сконфигурирован | fallback: `AppConfig.km_dziennie_default` (540) и `AppConfig.stawka_eur_default` (0.5); для суббот — `0` |
| `0` | гарантия осознанно выключена администратором | `0` км за этот месяц |
| `> 0` | заданное значение | как задано |

Отсюда:

- **Существование строки `MonthlyLimit` — единственный признак того, что администратор осознанно сконфигурировал месяц.** Отсутствующий месяц **не** выключен: он получает fallback 540 / 0.5 (wniosek не отклоняется и предупреждения не показываются — см. [19-known-quirks.md](19-known-quirks.md#monthlyLimit-fallback)).
- **Fallback владеет API** (`km-calc.service.ts`), а не БД: `@default` на колонках нет и добавлять нельзя — иначе `NULL` перестанет отличаться от `0`.
- Fallback подставляется **пополево**: строка с `kmPerDay = 0` и `ratePerKm = NULL` даёт 0 км по ставке 0.5 €/км (раньше такая строка отбрасывалась целиком, и месяц получал полный fallback).
- Миграции под это изменение **нет** — DDL прежний (nullable, без `@default`), поменялась только интерпретация. См. [12-database-schema.md](12-database-schema.md) §«LIMITY KM → MonthlyLimit».

`kmPerSaturday` — километры за **одну зачётную нечётную субботу**; оцениваются по существующей месячной ставке `ratePerKm` (отдельной EUR-ставки нет). Здесь — в отличие от `kmPerDay` — `NULL` и `0` поведенчески **идентичны**: обе ⇒ субботняя гарантия для месяца выключена (субботний fallback и так `0`, считается в km-calc-слое, **не** в БД). Опт-ин помесячный — суббота даёт км и день только при `kmPerSaturday > 0`. См. шаг «зачётные нечётные субботы» в [01-overview.md](01-overview.md).

**Инвариант:** unique `(year, month)`.

### `AppConfig` — глобальные параметры

Key-value хранилище для всех бизнес-параметров, которые могут меняться без релиза:

| Ключ | Значение | Описание |
|---|---|---|
| `stawka_eur_default` | `0.5` | EUR/km, fallback (если `MonthlyLimit.ratePerKm` для (year, month) отсутствует или `NULL` — но **не** если он `0`) |
| `km_dziennie_default` | `540` | km/день, fallback (если `MonthlyLimit.kmPerDay` для (year, month) отсутствует или `NULL` — но **не** если он `0`: `0` = гарантия выключена) |
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

**Append-only гарантирован базой данных (2026-09-14).** Триггер на `audit_log` отклоняет любые `DELETE`, `TRUNCATE` и `UPDATE`. Единственное исключение — когда пользователь физически удаляется (hard-delete), его записи остаются, а `userId` обнуляется (FK `ON DELETE SET NULL`); `userRole` и остальные поля сохраняют контекст «кто это был». Обнулить `userId` у ещё существующего (в т.ч. soft-deleted) пользователя нельзя. Лазейки-флага для приложения нет: осознанная чистка — только отдельной ревьюируемой миграцией. Это защита от **багов и скомпрометированных запросов приложения**, а не от владельца БД/суперпользователя (тот может отключить триггер). Детали — [12-database-schema.md §«AuditLog — append-only на уровне БД»](12-database-schema.md#auditlog--append-only-на-уровне-бд-2026-09-14).

### `EmailLog` — журнал доставки писем

Одна запись на каждое письмо из очереди `email-send` по его **финальному** исходу: `sent` (провайдер принял) или `failed` (все ретраи исчерпаны). Промежуточные попытки записей не дают — их число в `attempts`. Отвечает на вопрос «ушло ли письмо X адресату Y по wniosku Z, а если нет — почему».

| Поле | Назначение |
|---|---|
| `template` | ключ шаблона (`2fa-code`, `carrier-decision`, …) |
| `jobId` | id задачи BullMQ (опц.) |
| `recipients` | список адресов получателей |
| `subject` | тема (опц.) |
| `status` | `sent` / `failed` |
| `attempts` | сколько попыток сделано, включая финальную |
| `errorName` / `errorMessage` | класс и короткий очищенный текст ошибки (для `failed`) |
| `providerMessageId` | id сообщения у провайдера (Gmail / SMTP) |
| `targetType` / `targetKey` | бизнес-объект, как в `AuditLog` (`Claim` + `nrZgl`, …) |
| `triggeredBy` | FK → User, чьё действие вызвало письмо; пусто для cron/системных |
| `createdAt` / `sentAt` | когда записано / когда провайдер принял |

**Никогда не хранит** тело письма, данные шаблона, 2FA/reset-коды, временные пароли, токены — только метаданные доставки. `errorMessage` очищает writer (api).

**Инварианты:** `status = sent` ⇒ `sentAt` заполнен; `attempts >= 0` (DB CHECK). Строки не редактируются (write-once), soft-delete нет; api удаляет записи старше `EMAIL_LOG_RETENTION_DAYS` (по умолчанию 180 дней). При hard-delete пользователя `triggeredBy` обнуляется.

### `RefreshToken` — JWT-сессии

Для rotation refresh-токенов. Подробности в [15-auth-strategy.md](15-auth-strategy.md).

## Ключевые отношения

| Связь | Описание |
|---|---|
| `User` 1:1 `Carrier` | один аккаунт carrier ↔ один профиль перевозчика |
| `User` 1:N `Carrier` (via opiekunId) | опекун курирует много перевозчиков |
| `Carrier` 1:N `Vehicle/Driver/Trailer` | перевозчик владеет автопарком |
| `Vehicle` N:1 `User` (planner) | ведущий спедитор MagTrans — текущий |
| `User` N:1 `User` (via `liderId`) | планиста → его лидер (planista с `lider = true`) |
| `Vehicle` 1:N `VehiclePlannerAssignment` | журнал назначений планисты (одна открытая строка) |
| `Vehicle` 1:N `VehiclePlannerTransfer` | заявки на передачу (≤1 `pending`) |
| `VehiclePlannerTransfer` 1:0..1 `VehiclePlannerAssignment` | одобренная заявка открывает строку журнала |
| `Delegation` N:1 `User` (planner) | снимок планисты периода выезда |
| `Vehicle` N:1 `Team` (dispatchTeam) | команда диспетчеров авто |
| `Team` 1:N `User` (dispatchers, via teamId) | состав команды диспетчеров |
| `Carrier` 1:N `Claim` | перевозчик подаёт заявления |
| `Vehicle` 1:N `Claim` | заявление на конкретное авто |
| `Vehicle` 1:N `Delegation` | выезды авто |
| `Trailer` 1:N `Delegation` | прицеп обязателен |
| `Driver` 1:N `Delegation` | водитель обязателен |
| `Trailer` N:1 `TrailerType` | тип из справочника |
| `User` 1:N `AuditLog` | действия |
| `User` 1:N `EmailLog` (via triggeredById) | письма, вызванные действием пользователя |

## Ключевые инварианты

| Инвариант | Где |
|---|---|
| `Vehicle.plateNumber` уникален в рамках Carrier | DB unique constraint |
| `Claim.nrZgl` уникален глобально | DB unique constraint, atomic generation через `ClaimSequence` |
| `Driver.loginSlug` уникален глобально | DB unique constraint, suffix-2/-3 |
| `Trailer.plateNumber` уникален в рамках Carrier | DB unique constraint |
| `Carrier.opiekunId` указывает на user с role=opiekun | проверка в сервисе при assign |
| `Vehicle.plannerId` → User.role=planista | проверка в сервисе (при создании машины и при одобрении передачи) |
| `Vehicle.plannerId` меняется только одобрением передачи; = планиста открытой строки журнала | сервис (транзакция одобрения); ≤1 открытой строки — DB partial unique `VehiclePlannerAssignment_open_vehicle_key` |
| ≤1 `pending`-заявки на передачу на машину | DB partial unique `VehiclePlannerTransfer_pending_vehicle_key` (+ 409 в сервисе) |
| Заявка: `fromPlanner ≠ toPlanner`; причина непустая; `pending ⇔ decidedAt IS NULL`; `rejected` ⇒ комментарий | DB CHECK `vehicle_planner_transfer_*` |
| Журнал: `validTo ≥ validFrom`; `source = transfer ⇔ transferId` | DB CHECK `vehicle_planner_assignment_*` |
| Кто подаёт / решает / отменяет заявку (R2–R4, U1, U10) | проверка ресурса в сервисе |
| `User.liderId` → активный planista с `lider = true`, не сам; только у planista | проверка в сервисе (межстрочное, CHECK не выразит) |
| `Delegation.plannerId` — снимок: ставится при создании, переписывается только одобрением передачи (`zgloszony`/`gotowy`) | сервис |
| `Vehicle.dispatchTeamId` → активная Team | проверка в сервисе при assign |
| `User.teamId` → User.role=dyspozytor | проверка в сервисе |
| `Team.name` уникален | DB unique constraint |
| `Claim.status` всегда из enum | DB enum |
| `Delegation.status` всегда из enum | DB enum |
| Claim status-переходы — только 9 легальных рёбер | `claim-state-machine.ts` + сервис; см. секцию `Claim` |
| Status-переходы Delegation строгие | проверка в сервисе |
| Claim ZAAKCEPTOWANO ⇒ orderNumber+orderDate+amountApproved | DB CHECK `claim_accepted_payment_complete` |
| Delegation zjechal ⇒ actualReturnAt заполнен | сервис (api enforce) при переходе статуса. План возврата (`returnCountry`/`returnPostalCode`) уже NOT NULL на этапе `zgloszony` |
| Vehicle gps=true ⇒ gpsMobilePhone | DB CHECK `vehicle_gps_device_when_gps_on` |
| `Vehicle.lastDroveAt` выставляется системой при `VehicleDailyKm` drove-дне (`max`) | сервис, не UI |
| Audit пишется для всех mutating ops | interceptor |
| `AuditLog` append-only (нет UPDATE/DELETE/TRUNCATE, кроме FK SET NULL `userId` при hard-delete User) | DB trigger `audit_log_append_only_guard` |
| `EmailLog` status=sent ⇒ sentAt; attempts ≥ 0 | DB CHECK `email_log_sent_has_sent_at`, `email_log_attempts_non_negative` |

> **CHECK constraints как часть data-model contract.** Это не имплементационная деталь и не оптимизация — это бизнес-правила, которые должны держаться независимо от того, какой код пишет в БД. См. [12-database-schema.md#миграции](12-database-schema.md#миграции) для точного SQL и [19-known-quirks.md](19-known-quirks.md) для нюансов.

## Soft-delete

| Сущность | Стратегия |
|---|---|
| User, Carrier, Vehicle, Driver, Trailer, Claim, Delegation | soft (`deletedAt: timestamp?`) |
| RefreshToken | hard (по `expiresAt`) |
| AuditLog | append-only, не удаляется — закреплено триггером в БД |
| EmailLog | write-once; hard-delete только retention-очисткой api (старше `EMAIL_LOG_RETENTION_DAYS`, дефолт 180) |
| VehiclePlannerTransfer, VehiclePlannerAssignment | append-only (без `deletedAt`, вне allowlist soft-delete); заявка живёт статусом, строка журнала — закрытием (`validTo`). Журнал физически уходит только каскадом вместе с машиной |

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
