# 03. Роли и права доступа

> 8 ролей пользователей. Этот документ — главный референс по бизнес-правилам авторизации.
> Лидерство (`User.lider`, 2026-09-25) — флаг **поверх** пяти из них, а не девятая роль: см. [§«Лидеры»](#lider).

## Откуда берётся роль

С внедрением Google SSO (docs/24, реализовано) роль сотрудника выводится из его
**stanowiska в MAGSpace** через таблицу маппинга `StanowiskoRoleMapping`, которую
ведёт admin на `/employee/sso`. Правила, которые важно держать в голове, читая
эту матрицу:

- **`admin` и `przewoznik` из stanowiska не выводятся никогда.** `admin` — только
  локальная учётка (break-glass на случай, когда Google или MAGSpace лежат);
  перевозчик заводится через `POST /carriers`. Оба варианта отклоняются и Zod-ом,
  и CHECK-констрейнтами в БД.
- **`pracownik`, `weryfikator` и `eksport` маппингом тоже не выдаются** — решение
  от 2026-09-09. Внутри одной должности эти люди сидят вперемешку (в
  `CONTROLLING` двое: один `weryfikator`, другой `pracownik`; среди `HANDEL_*`
  пара человек с `eksport`), а роли слишком чувствительные — верификация
  wniosków и деньги. Таким сотрудникам admin выдаёт роль **вручную**, полем
  `User.roleOverride` — одним шагом, кнопкой «Nadaj dostęp» у отклонённого
  входа на `/employee/sso` (`POST /sso/access-grants`); reconcile её не
  перезаписывает, но доступ при увольнении всё равно гасит.
- Автоматически из stanowiska выводятся только `dyspozytor` (`DYSPOZYTOR*`),
  `planista` (`PLANISTA*`) и `opiekun` (`DAF`). Остальные 11 из 17 кодов
  MAGSpace доступа не дают — попытка входа даёт 403 `SSO_NO_ROLE` и письмо
  админам с именем человека.
- Пользователь с `managedBy = 'magspace'` имеет `role` и `active` **только для
  чтения** в админке: их переписывает синхронизация. `PATCH /users/:id` на такую
  попытку отвечает 422 `USER_MANAGED_BY_MAGSPACE`.
- **Флаг лидера `User.lider`** (2026-09-25, [docs/28](28-lider-roles-plan.md))
  идёт вместе с ролью и подчиняется тем же правилам владения: у
  `magspace`-учётки без `roleOverride` — из `StanowiskoRoleMapping.lider`
  (`PLANISTA_LIDER`, `DYSPOZYTOR_KIEROWNIK`), иначе ставит admin. Лидер — не
  роль, см. [§«Лидеры»](#lider).

Матрица ниже описывает, **что может роль**, независимо от того, как она была
назначена.

> **Источник истины — код** (решение 2026-09-14). Документ выверен по `@Roles` на
> 139 эндпоинтах и scope-веткам сервисов; при расхождении прав код, а док
> правится. Инвентаризация и будущий слой permissions —
> [25-permissions-layer-plan.md](25-permissions-layer-plan.md).

## Сводная таблица

| Роль | UI-лейбл (PL) | Описание | Главный экран |
|---|---|---|---|
| `admin` | Admin | Полный доступ. Может всё. | Employee panel + Diagnostics |
| `pracownik` | **Opiekun wniosków** | Узкий «оператор заявок» — только верификация wniosków | Employee panel (Dashboard + Wnioski) |
| `opiekun` | Opiekun | Куратор группы перевозчиков | Employee panel (раздел Moja opieka) |
| `planista` | Planista | Спедитор закреплённых авто | Planista panel (read-only) |
| `dyspozytor` | Dyspozytor | Диспетчер по конкретным авто | Dyspozytor panel (read-only) |
| `przewoznik` | Przewoźnik | Перевозчик-субподрядчик | Carrier panel |
| `eksport` | Eksport | Эксперт экспорта | Eksport panel (доска выездов, отметка `gotowy`) |
| `weryfikator` | Weryfikator | Верификатор делегаций | Weryfikator panel |

> ⚠️ Роль называется `pracownik` в БД и в коде, но в UI она всегда отображается как **«Opiekun wniosków»** (claims-caretaker). Это сохраняем — пользователи MagTrans привыкли к этому термину. Не путать с ролью `opiekun` (куратор перевозчиков, совсем другой scope).

> 🗓️ **Phase 11 (Team) — реализовано 2026-06-17:** сущность `Team` (команда диспетчеров) даёт **gchat-уведомления о выездах** (интеграция выпиливалась 2026-07-28, возвращена 2026-08-07) и доступ диспетчеров к авто своей команды. Отдельного approval выезда нет: акцептом служит статус `gotowy`, который ставит `eksport` (решение 2026-07-03, см. [20-phase-7-eksport-weryfikator.md](20-phase-7-eksport-weryfikator.md) §0″).

---

## <a id="przewoznik"></a>🚛 Перевозчик (`przewoznik`)

**Кто это:** субподрядчик MagTrans — компания, владеющая автомобилями и водителями. Главный «end-user» системы.

**Атрибуты:** login, email, имя, NIP, IBAN (EUR + PLN), контакты, привязанный куратор (`opiekunId`), даты страхования / лицензии, число KREPTD-выписок.

### Что может делать

| Действие | Ограничение |
|---|---|
| Подать заявление о гарантии км | Только для **своих** авто |
| Просмотреть свои заявления | Только свои |
| Подать рекламацию к заявлению | Только своё, в разрешённом статусе |
| Просмотр своих водителей (read-only) | Только своих |
| Просмотр своих прицепов (read-only) | Только своих |
| Зарегистрировать выезд (delegacja) | Для своих авто |
| Анулировать свой выезд | Только в статусе `zgloszony` |
| Просмотреть свои выезды | Только свои |
| Получить агрегат «моя флота» | Свои авто/водители/прицепы |

### Что НЕ может

- Создавать или редактировать **автомобили** — это делает admin/opiekun. В carrier-панели флота **read-only**.
- Создавать, редактировать, деактивировать или удалять **водителей** — это делает admin/opiekun. Перевозчик их только просматривает.
- Создавать или редактировать **прицепы** — это делает admin/opiekun. Перевозчик их только просматривает.
- Менять статус заявления.
- Видеть данные других перевозчиков.
- Менять ставки EUR/км или лимиты.

### Особенности

- При `active = false` логин блокируется.
- Одна учётка = одна роль. Переключателя панелей нет (см. [Multi-role](#multi-role)).
- Google-вход для перевозчика запрещён (403 `SSO_NOT_FOR_CARRIER`) — только логин, пароль и 2FA.

---

## <a id="opiekun"></a>🛡️ Опекун (`opiekun`)

**Кто это:** сотрудник MagTrans, курирующий группу перевозчиков (тех, у кого `carrier.opiekunId = его id`). Может полноценно администрировать «своих».

### Что может делать (только для своих перевозчиков)

| Действие | Сущности |
|---|---|
| Просмотр флоты со статистикой | Carrier, Vehicle, Driver, Trailer |
| Создание, редактирование, деактивация перевозчиков | Carrier (только свои; **удаление** перевозчика — только admin) |
| CRUD авто, прицепов, водителей и их вложений | Vehicle / Trailer / Driver под своими carrier; удаление — только soft, hard-delete у admin |
| Reset password перевозчику | Только свои |
| Видеть wnioski | Только своих перевозчиков (read-only, без верификации) |
| Видеть выезды | Только своих перевозчиков, все статусы |
| Km-рапорт | Полная флота своих перевозчиков, включая стоящие машины |
| Алерты по документам, compliance гарантии, эпизоды watchdog | Только свои перевозчики |
| VIES, Biała Lista, info-car | В формах перевозчика и машины |
| GPS-позиции | Машины своих перевозчиков |
| Заявка на смену планисты машины, отмена своей заявки, журнал планистов машины | Машины своих перевозчиков. Решает admin или лидер текущего планисты ([29](29-vehicle-planner-transfer-plan.md)) |

### Что НЕ может

- Менять планисту машины напрямую — только заявкой (docs/29 R1). Планиста выбирается сразу только при создании машины.
- Действовать на перевозчиках с другим `opiekunId` (403).
- Верифицировать заявления и принимать по ним решения (это `pracownik`/`admin`).
- Видеть **все** wnioski — только wnioski **своих** перевозчиков.
- Удалять перевозчиков и делать hard-delete чего-либо.

### Audit log

Каждое действие опекуна **обязательно** пишется в audit log с указанием user, action, target, before/after, reason. Audit пишется и для admin/pracownik (см. ниже), но для opiekun — это ключевая фича accountability.

### Статистика «Moja opieka»

По каждому подопечному перевозчику считаются:
- `jezdzace` — авто, которые ездили в последние N дней (по полю `Vehicle.lastDroveAt`),
- `stojace` — авто, не выезжавшие давно,
- `nieaktywne` — `active=false`,
- `potencjalne` — `numberOfVehicle - aktualnaLiczbaAut` (потенциал по KREPTD).

---

## <a id="planista"></a>📋 Планиста (`planista`)

**Кто это:** спедитор, отвечающий за загрузку конкретных автомобилей.

**Атрибуты:** login, email, имя, **`liderId`** — его лидер (планиста с `lider = true`). Лидер решает заявки на передачу машин этого планисты и получает CC писем по wnioskam его машин. Ставит admin; MAGSpace иерархии не отдаёт. Заменил `liderEmail` ([29](29-vehicle-planner-transfer-plan.md) R8).

### Что может делать
- Видеть авто, у которых `vehicle.plannerId = его id` — **текущий** планиста (включая ставки DE/UE/Export/Import — в отличие от диспетчера). Флот, km-рапорт и GPS живые: после передачи машина пропадает у старого планисты сразу, включая прошлые недели км.
- Видеть водителей и прицепы перевозчиков своих авто (read-only, через панель `/fleet/planista`).
- Видеть **выезды, которые он вёл**: `Delegation.plannerId` — снимок планисты на момент регистрации выезда. После передачи машины старый планиста продолжает видеть свои выезды, новый — только выезды после передачи (docs/29 R5, R6).
- Видеть km-рапорт по своим авто и GPS-позиции.
- Подать заявку на передачу своей машины другому планисте и отменить свою заявку (`/planista/przekazania`).
- **Лидер планистов** — решать заявки своих планистов (`/planista/zatwierdzenia`), см. [Лидеры](#lider).

### Что НЕ может
- Ничего редактировать, кроме заявки на передачу своей машины (и её отмены).
- Видеть заявления.
- Видеть номер и PIN топливной карты.

---

## <a id="dyspozytor"></a>🎯 Диспетчер (`dyspozytor`)

**Кто это:** диспетчер по конкретным автомобилям. Состоит в **команде** (`Team`, обычно 2 диспетчера по сменам 6–14 / 14–22). Авто привязываются к команде, а не к одному человеку, поэтому оба сменщика «ведут» одни и те же машины.

> Доступ через команду (`Team`, `Vehicle.dispatchTeamId`) реализован 2026-06-17. Верификации выезда диспетчером нет.

### Что может делать
- Видеть авто, у которых `vehicle.dispatchTeamId = его команда` (`User.teamId`) — **оба сменщика** видят одни и те же авто.
- Видеть **делегации (выезды)** этих авто.
- Видеть km-рапорт по своим авто (read-only) и GPS-позиции.
- Просматривать водителей и прицепы (через панель `/fleet/dyspozytor`).

### Что НЕ может
- Менять данные авто или подавать заявления.
- Менять состав команд (`Team`) — это `admin`.
- Видеть ставки машин (DE/UE/Export/Import) и данные топливной карты — сервер отдаёт `null`.

### Отличие от планисты
- Планиста смотрит на загрузку (что заказать, куда поедет).
- Диспетчер смотрит на текущий рейс (где машина, когда вернётся).

---

## <a id="pracownik"></a>👨‍💼 Opiekun wniosków (`pracownik`)

**Кто это:** сотрудник MagTrans, чья **единственная задача — верифицировать заявления (wnioski)**. Не управляет перевозчиками, авто, водителями или прицепами. Не имеет доступа к настройкам или административным панелям.

> В legacy GAS-коде эта роль так и закомментирована: *«Pracownik = widzi wszystko, rozlicza wnioski, BEZ ustawień»* ([Code.gs:944](../Code.gs)). UI-лейбл — «Opiekun wniosków», не «Pracownik». В новой системе — то же.

### Главный экран

`Employee panel` с **двумя вкладками только**:
1. **📊 Dashboard** — KPI, urgent-список, ostatnia aktywność, monthly-trend, top-przewoźnicy, reklamacje, top-payouts, wypłaty na planistę.
2. **📋 Wnioski** — таблица всех wniosków с фильтрами (статус, перевозчик, текстовый поиск).

Вкладки `Carriers / Vehicles / Drivers / Trailers / Trailer types` ему **не показываются** — они для `admin`. Вкладка `Moja opieka` — для `opiekun`.

### Что может делать

| Действие | Endpoint (legacy → new) |
|---|---|
| Видеть **все** заявления с фильтром по статусу/перевозчику | `getAllClaims` → `GET /claims` |
| Верифицировать заявление (изменить статус, пересчитать km/доплату, добавить komentarz) | `updateClaimFull` → `PATCH /claims/:nrZgl` |
| Поправить деривированные часы заявления (`timeFrom`/`timeTo` — подставлены из точных времён выезда) — двойная проверка на случай ошибки weryfikatora; live re-calc | `updateClaimFull` → `PATCH /claims/:nrZgl` |
| Применить korekta godzin (вычесть простой/сервис из dni jezdne) | `updateClaimFull` (поле `korektaGodzin`) |
| Указать `nrZlecenia` (номер заказа) при акцепте | `updateClaimFull` (поле `nrZlecenia`) |
| Авто-гейт авторизации (ручного запроса нет): при zapisie weryfikacji с `doplata > getAuthThreshold(dniJezdne)` wniosek **автоматически** переходит в `OCZEKUJE NA AUTORYZACJĘ` + email Maksim'у | `sendAuthorizationRequest` → авто внутри `PATCH /claims/:nrZgl/verification` |
| Загрузить screenshot подтверждения Maksima (после внесистемного email-потока; разблокирует решение) | `uploadAuthScreenshot` → `POST /claims/:nrZgl/authorization-confirmation` |
| Решение по reklamacji: `UZNANA` (с обязательным `reklamacjaOrderNumber`) или `ODRZUCONA`; статус wniosku возвращается в прежний, payout-поля не трогаются | `PATCH /claims/:nrZgl` |
| Видеть dashboard со статистикой по всем wnioskom | `GET /diagnostics/dashboard` |

### Что **НЕ** может

| ❌ Запрещено | Причина / какая роль это делает |
|---|---|
| Создавать / редактировать / деактивировать **перевозчиков** | `admin` (все) или `opiekun` (свои) |
| Создавать / редактировать / деактивировать **авто, водителей, прицепы** | `admin` (все) или `opiekun` (свои) |
| Управлять справочником **типов прицепов** | `admin` |
| Менять лимиты км / ставки EUR (`MonthlyLimit`) | `admin` |
| Создавать / редактировать **пользователей** любой роли | `admin` |
| Видеть / читать **audit log** | `admin` |
| Делать **hard-delete** чего бы то ни было | `admin` |
| Доступ к **diagnostic**-эндпоинтам | `admin` |
| Менять статус **делегаций** (in-transit, returned) | `weryfikator` |
| Видеть **выезды** вообще (в т.ч. eksport-доску) | pracownik исключён из всех `@Roles` delegations (quirk #13) — в отличие от легаси |
| Видеть «своих» подопечных перевозчиков (Moja opieka) | `opiekun` |

> Legacy enforcement: все CRUD-функции по carrier/vehicle/driver/trailer/trailer-type обёрнуты в `requireAdmin(callerLogin)` ([Code.gs:1212](../Code.gs)). `pracownik` в этих эндпоинтах получает `'Brak uprawnień (wymaga admin)'`. В UI вкладки этих сущностей просто не рендерятся для `pracownik` ([index.html:4682-4690](../index.html)).

### Внешние проверки (VIES, Biała Lista MF, info-car)

В legacy эти эндпоинты не имеют permission-check (любой залогиненный вызывает). В новой системе — они **используются только в формах carrier/vehicle**, поэтому де-факто доступны только `admin` и `opiekun`. `pracownik` их UI не открывает (нет вкладок Carriers/Vehicles).

---

## <a id="admin"></a>🛡️ Админ (`admin`)

**Кто это:** супер-пользователь MagTrans. Пересечение `pracownik` ∪ `opiekun` (без ограничения по ownership) ∪ управление справочниками и пользователями ∪ диагностика.

### Сверх того, что умеет `pracownik`, admin может

| Действие | Endpoint (legacy → new) |
|---|---|
| Видеть в Employee panel **ещё 4 вкладки**: Carriers, Vehicles, Drivers, Trailers | `index.html:4682-4686` (UI guard `isAdminRole`) |
| CRUD **перевозчиков** (всех, не только своих) | `addCarrier` / `updateCarrier` / `toggleCarrierActive` / `deleteCarrierHard` / `resetCarrierPassword` → `POST/PATCH/DELETE /carriers` |
| CRUD **авто** (всех) + редактирование `dispatchTeamId`, ставок (DE/UE/Ekspoort/Import). Планиста — только при создании; сменить его нельзя даже admin, admin **решает** заявки на смену (любые) и заявку не подаёт ([29](29-vehicle-planner-transfer-plan.md) R1, U1) | `addVehicle` / `updateVehicleDetails` / `toggleVehicleActive` / `removeVehicle`; `/planner-transfers/*` |
| CRUD **водителей** (всех) | `addDriver` / `updateDriver` / `toggleDriverActive` / `removeDriver` |
| CRUD **прицепов** (всех) | `addNaczepa` / `updateNaczepa` / `toggleNaczepaActive` / `removeNaczepa` |
| Управление **справочником типов прицепов** | `addNaczepaTyp` / `toggleNaczepaTypActive` |
| Менять **лимиты км / ставки** (`MonthlyLimit`) | `getLimityKm` (read) / `PUT /limits` (новое в API) |
| CRUD **пользователей** всех ролей (admin / pracownik / opiekun / planista / dyspozytor / eksport / weryfikator) | `POST/PATCH/DELETE /users` |
| Hard-delete (cascading) перевозчиков, авто, водителей, прицепов с обязательным `powod` | `deleteCarrierHard` etc. |
| Читать **audit log** | `GET /audit` |
| Diagnostic-эндпоинты (диагностика email-доставки, raw-снапшот wniosków, БД-сводка) | `diagnostykaMaili`, `DIAGNOSTYKA_WNIOSKÓW` → `GET /diagnostics/*` |
| В Carrier panel видеть **все** wnioski (а не только своих) — debug-fallback | `getClaimsForCarrier` (`if caller.rola === 'admin' пропускает фильтр nazwa`) |
| Anulować любой активный выезд | `POST /delegations/:id/cancel` (admin; перевозчик — только свой `zgloszony`; weryfikator — **нет**) |
| Отметить выезд `gotowy` и откатить | `POST /delegations/:id/ready` (admin, eksport) |
| Команды диспетчеров, маппинг stanowisko → роль, выдача доступа через SSO | `/teams`, `/sso/*` |

> На уровне guards в новой системе: `@Roles('admin')` для всего из этой таблицы; `@Roles('admin', 'pracownik')` — только для эндпоинтов claims-верификации. Никогда не `@Roles('admin', 'pracownik')` для CRUD entities.

---

## <a id="специальные-роли"></a>🔍 Специальные роли

### `eksport` — эксперт экспорта

- Видит **все** выезды (без ownership-scope); по умолчанию доска активных (`zgloszony`, `w_trasie`), тумблер `includeHistory` расширяет до всех статусов.
- Ставит выезду `gotowy` (= акцепт после zlecenia в SpedTrans, обязателен `spedOrderNumber`) и откатывает `gotowy → zgloszony`, пока выезд не `w_trasie`.
- Видит km-рапорт по всем машинам и дневной км любой машины (read-only).
- Не видит wnioski, не редактирует флоту.

### `weryfikator` — дневной километраж машин + статусы выездов

> ⚠️ **REWORK (2026-06-12, §0′):** у weryfikatora ДВА окна — ежедневный км-лист (источник пробега) **и** управление статусами выездов (переходы `gotowy→w_trasie` и `w_trasie→zjechał`). На этих переходах weryfikator фиксирует **точные datetime** выезда/съезда (`actualDepartureAt` / `actualReturnAt`), из которых деривируются часы wniosek. См. [20-phase-7-eksport-weryfikator.md](20-phase-7-eksport-weryfikator.md) §0′.

Первый экран — **недельная km-доска** (`/weryfikator/km`): все активные машины; по каждой за день проставляет либо `drove` + км, либо `idle` («стоит»); нет отметки = «не проверено». Это **источник истины для пробега в `Claim`** (`Σ VehicleDailyKm`).

- `PUT /vehicles/:id/daily-km` — upsert отметки за день (km/state/notes); при `drove` обновляет `Vehicle.lastDroveAt`.
- `GET /vehicles/:id/daily-km` — история по машине.
- Производный статус машины (`w ruchu` / `nie jeździ` / `nieznany`) — в шапке доски.

Второй экран — **статусы выездов** (`/weryfikator/delegations`):

- `POST /delegations/:id/in-transit` — переход `gotowy→w_trasie`; задаёт **точный datetime выезда** `actualDepartureAt` (обязателен; дата + время).
- `POST /delegations/:id/returned` — переход `w_trasie→zjechał`; задаёт **точный datetime съезда** `actualReturnAt` (обязателен; дата + время); в той же транзакции `Vehicle.lastDroveAt` + авто-пересчёт связанного wniosek.
- Точные времена выезда/съезда → из них деривируются `timeFrom`/`timeTo` в wniosek (перевозчик их не вводит; `pracownik` может поправить при верификации).
- Видит все выезды — та же доска, что у eksport (активные по умолчанию, `includeHistory` — все).
- **НЕ** делает: cancel выездов — это зона перевозчика (свой `zgloszony`) и админа; отметку `gotowy` — это eksport.

---

## <a id="lider"></a>⭐ Лидеры (`User.lider`)

> Реализовано 2026-09-25 по [28-lider-roles-plan.md](28-lider-roles-plan.md).
> **Лидер — не значение `enum Role`**, а булев флаг над одной из пяти ролей:
> «lider_planista» = `role: planista` + `lider: true`. В enum `lider_*` не
> добавлять никогда (docs/28 §7 R1): каждый `@Roles`, scope-ветка и
> `Record<Role, …>` молча пропустили бы такую роль, а `OpiekunOwnershipGuard`
> пропускает любую не-`opiekun` роль без проверки ownership.

| | |
|---|---|
| Для каких ролей | `LIDER_ROLES` = `planista`, `dyspozytor`, `opiekun`, `pracownik`, `eksport`. `admin` и так может всё, `przewoznik` — не сотрудник, `weryfikator` не запрошен (добавить = одна строка в shared + новая миграция для двух CHECK) |
| Инвариант | `lider = true ⇒ role ∈ LIDER_ROLES`, в трёх местах как у `AssignableRole`: Zod (`refineLiderPair`), сервисы (частичный `PATCH`, пара с `roleOverride`), CHECK в БД (`user_lider_requires_lider_role`, `stanowisko_role_mapping_lider_requires_lider_role`) |
| Что даёт сегодня | **Лидер планистов** решает (одобряет / отклоняет) заявки на передачу машин **своих** планистов — тех, у кого `liderId` = его id ([29](29-vehicle-planner-transfer-plan.md)). Не может решить заявку, которую подал сам или в которой машину передают ему — её решает admin. Проверка на уровне ресурса в сервисе (`planner-transfer.rules.ts`), флаг `lider` читается в момент решения. Отдельный пункт меню «Do zatwierdzenia» — только при `lider`. **Лидеры остальных ролей — ничего сверх базовой роли.** Тип пользователя, scope, ownership, панель, landing и все `@Roles` — от `role`. Общие права лидера — `LIDER_PERMISSIONS[role]` в слое permissions ([docs/25](25-permissions-layer-plan.md) B1) |
| Откуда берётся | Как `role`: `magspace` без `roleOverride` — из маппинга stanowiska (`PLANISTA_LIDER`, `DYSPOZYTOR_KIEROWNIK` → `+ lider`, docs/24 §10); с `roleOverride` («Nadaj dostęp» с галкой «Lider» или UserSheet) и `local` — admin. Лидеры DAF (`opiekun`), opiekunów wniosków (`pracownik`) и eksportu выдаются только руками — в MAGSpace нет соответствующих stanowisk |
| UI-лейбл | `roles.lider.<role>`: «Lider planistów», «Lider dyspozytorów», «Lider DAF», «Lider opiekunów wniosków», «Lider eksportu» (EN: «Planners lead» …). Базовый `roles.<role>` не меняется; в списке пользователей — чип роли **плюс** чип «Lider», фильтр «Tylko liderzy» |
| Где виден | `/auth/me.lider` и все ответы с `user`, `UserDtoFull.lider`, `GET /users?lider=true`, колонка «Lider» на `/employee/sso`, галка в «Nadaj dostęp», лейбл в меню пользователя и в автокомплите аудита, `lider` в DTO пикеров lookups. В JWT флага **нет** — читается из БД на каждом запросе, как `teamId` |
| Связь «кто чей лидер» | `User.liderId` у планисты → планиста с `lider = true` (UserSheet «Przełożony (lider)», ставит admin). Заменил текстовый `User.liderEmail` ([quirk #14](19-known-quirks.md#liderEmail)): колонка ещё в БД, но не читается и удаляется отдельным релизом. Снятие флага `lider` не очищает `liderId` подчинённых — их заявки тогда решает admin |

---

## Матрица доступа

> Цель таблицы — закрепить **узость scope-а pracownik**. Если какое-то действие у `pracownik` стоит ✅, оно касается только wniosków или dashboard-статистики; никаких CRUD по справочным сущностям.

| Действие | admin | pracownik | opiekun | planista | dyspozytor | przewoznik | eksport | weryfikator |
|----------|:-----:|:---------:|:-------:|:--------:|:----------:|:----------:|:-------:|:-----------:|
| Подать заявление | — | — | — | — | — | ✅ | — | — |
| Верифицировать заявление | ✅ | ✅ | — | — | — | — | — | — |
| Видеть все заявления + dashboard | ✅ | ✅ | — | — | — | — | — | — |
| Авто-гейт авторизации Maksima (ручного запроса нет) | ✅ | ✅ | — | — | — | — | — | — |
| Загрузить screenshot авторизации | ✅ | ✅ | — | — | — | — | — | — |
| Повторная верификация в `OCZEKUJE_NA_AUTORYZACJE` | ✅ | — | — | — | — | — | — | — |
| Видеть свои заявления / заявления своих перевозчиков | — | — | ✅ (своих перев.) | — | — | ✅ (свои) | — | — |
| Подать reklamację | — | — | — | — | — | ✅ | — | — |
| CRUD перевозчиков (все) + удаление | ✅ | **—** | — | — | — | — | — | — |
| Создание / правка / деактивация перевозчиков (свои), reset пароля | — | — | ✅ | — | — | — | — | — |
| CRUD авто (все) | ✅ | **—** | — | — | — | — | — | — |
| CRUD авто (свои перев.) | — | — | ✅ | — | — | — | — | — |
| Видеть свои авто (planner / dispatch team) | — | — | — | ✅ | ✅ | — | — | — |
| Подать заявку на смену планисты машины / отменить свою | — | — | ✅ (своих перев.) | ✅ (текущий планиста машины) | — | — | — | — |
| Решить заявку на смену планисты | ✅ (любую, кроме своей) | — | — | ✅ (лидер планисты-отправителя; не автор и не получатель) | — | — | — | — |
| Журнал планистов машины | ✅ | — | ✅ (своих перев.) | ✅ (текущий планиста и его лидер) | — | — | — | — |
| Видеть ставки авто | ✅ | — | ✅ | ✅ | **—** | ✅ | — | — |
| Видеть номер и PIN топливной карты | ✅ | — | ✅ | — | — | ✅ | — | — |
| Hard-delete водителей / прицепов / перевозчиков | ✅ | — | — | — | — | — | — | — |
| CRUD водителей (все) | ✅ | **—** | — | — | — | — | — | — |
| CRUD водителей/прицепов (свои) | — | — | ✅ | — | — | **—** | — | — |
| Видеть своих водителей/прицепов/авто (read-only) | — | — | — | — | — | ✅ | — | — |
| CRUD прицепов (все) + типов прицепов | ✅ | **—** | — | — | — | — | — | — |
| Зарегистрировать выезд | — | — | — | — | — | ✅ | — | — |
| Отметить выезд `gotowy` / откатить | ✅ | — | — | — | — | — | ✅ | — |
| Менять статус выезда (`in-transit`/`returned`, с точными datetime выезда/съезда) | ✅ | — | — | — | — | — | — | ✅ |
| Anulować выезд | ✅ (любой активный) | — | — | — | — | ✅ (свой, `zgloszony`) | — | — |
| Проставлять дневной км машин | ✅ | — | — | — | — | — | — | ✅ |
| Видеть km-рапорт (read-only) | ✅ | — | ✅ (своих перев.) | ✅ (свои) | ✅ (своя команда) | ✅ (своя флота) | ✅ | ✅ |
| Видеть выезды | ✅ | — | ✅ (своих перев.) | ✅ (которые вёл — по снимку) | ✅ (своя команда) | ✅ (свои) | ✅ (все, активные по умолч.) | ✅ (все, активные по умолч.) |
| GPS-позиции машин | ✅ | — | ✅ (своих перев.) | ✅ (свои) | ✅ (своя команда) | ✅ (свои) | — | — |
| Алерты по документам, compliance гарантии, эпизоды watchdog | ✅ | — | ✅ (своих перев.) | — | — | ✅ (только compliance и эпизоды, `/me`) | — | — |
| VIES / Biała Lista / info-car | ✅ | — | ✅ | — | — | — | — | — |
| Управление лимитами / справочниками / командами / SSO-маппингом | ✅ | — | — | — | — | — | — | — |
| CRUD пользователей | ✅ | — | — | — | — | — | — | — |
| Audit log (чтение) | ✅ | — | — | — | — | — | — | — |
| Diagnostic endpoints | ✅ | — | — | — | — | — | — | — |

---

## Жизненный цикл пользователя

```
Создание: admin (POST /users), opiekun/admin (перевозчик через POST /carriers),
          SSO — автоматически при первом Google-входе или «Nadaj dostęp» (docs/24)
    ↓
Email с login + временным паролем (у SSO-учёток пароля нет)
    ↓
Первый вход → 2FA код по email → user-объект в сессии (JWT)
    ↓
[активная работа]
    ↓
Деактивация (active=false) → email-уведомление → блокировка логина
    ↓
[опционально] Реактивация → active=true → email
    ↓
[опционально] Hard delete (admin) → только если на сущность нет ссылок;
              иначе 409 *_HAS_REFERENCES (бизнес-каскадов нет, FK RESTRICT)
```

SSO-учётки (`managedBy = magspace`) деактивируются сами: reconcile раз в 15 минут
гасит доступ уволенным в MAGSpace (docs/24).

## Multi-role

⛔ **Не реализовано.** JWT несёт одну роль, `alternateRoles` и переключателя панелей нет. Человеку с двумя ролями нужны две учётки с разными логинами и email (email уникален). Исключения по правам для конкретного человека — будущие точечные права (docs/25 §B6), а не вторая роль.
