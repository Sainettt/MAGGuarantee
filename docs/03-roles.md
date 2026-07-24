# 03. Роли и права доступа

> 8 ролей пользователей. Этот документ — главный референс по бизнес-правилам авторизации.

## Сводная таблица

| Роль | UI-лейбл (PL) | Описание | Главный экран |
|---|---|---|---|
| `admin` | Admin | Полный доступ. Может всё. | Employee panel + Diagnostics |
| `pracownik` | **Opiekun wniosków** | Узкий «оператор заявок» — только верификация wniosków | Employee panel (Dashboard + Wnioski) |
| `opiekun` | Opiekun | Куратор группы перевозчиков | Employee panel (раздел Moja opieka) |
| `planista` | Planista | Спедитор закреплённых авто | Planista panel (read-only) |
| `dyspozytor` | Dyspozytor | Диспетчер по конкретным авто | Dyspozytor panel (read-only) |
| `przewoznik` | Przewoźnik | Перевозчик-субподрядчик | Carrier panel |
| `eksport` | Eksport | Эксперт экспорта | Eksport panel (read-only) |
| `weryfikator` | Weryfikator | Верификатор делегаций | Weryfikator panel |

> ⚠️ Роль называется `pracownik` в БД и в коде, но в UI она всегда отображается как **«Opiekun wniosków»** (claims-caretaker). Это сохраняем — пользователи MagTrans привыкли к этому термину. Не путать с ролью `opiekun` (куратор перевозчиков, совсем другой scope).

> 🗓️ **Phase 11 (Team — только уведомления):** сущность `Team` (команда диспетчеров) вводится для **gchat-уведомлений о выездах** и доступа диспетчеров к своим авто. ⛔ Approval/верификация выезда **НЕ делается** — статус выезда «мёртвый груз» (2026-06-12, см. [20-phase-7-eksport-weryfikator.md](20-phase-7-eksport-weryfikator.md) §0′). Спецификация — [17-migration-roadmap.md#фаза-11--wyjazd-approval-workflow-планируется-после-launch](17-migration-roadmap.md#фаза-11--wyjazd-approval-workflow-планируется-после-launch).

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
- Перевозчик может иметь дополнительную роль (`opiekun`/`pracownik`/`admin`) — тогда у него есть переключатель панелей.

---

## <a id="opiekun"></a>🛡️ Опекун (`opiekun`)

**Кто это:** сотрудник MagTrans, курирующий группу перевозчиков (тех, у кого `carrier.opiekunId = его id`). Может полноценно администрировать «своих».

### Что может делать (только для своих перевозчиков)

| Действие | Сущности |
|---|---|
| Просмотр флоты со статистикой | Carrier, Vehicle, Driver, Trailer |
| CRUD перевозчиков | Carrier (только свои) |
| CRUD авто | Vehicle (под своими carrier) |
| CRUD прицепов | Trailer (под своими carrier) |
| CRUD водителей | Driver (под своими carrier) |
| Reset password перевозчику | Только свои |

### Что НЕ может

- Действовать на перевозчиках с другим `opiekunId` (403).
- Верифицировать заявления (это `pracownik`/`admin`).
- Видеть **все** wnioski в Wnioski-вкладке. Видит только wnioski **своих** перевозчиков (фильтр scope-а — см. [Code.gs:4920-4940](../Code.gs)).

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

**Атрибуты:** login, email, имя, **liderEmail** (email лидера группы — он тоже получает уведомления о решениях по авто планисты).

### Что может делать
- Видеть авто, у которых `vehicle.plannerId = его id`.
- Видеть водителей и прицепы перевозчиков своих авто (read-only).

### Что НЕ может
- Ничего редактировать.
- Видеть заявления / делегации.

---

## <a id="dyspozytor"></a>🎯 Диспетчер (`dyspozytor`)

**Кто это:** диспетчер по конкретным автомобилям. Состоит в **команде** (`Team`, обычно 2 диспетчера по сменам 6–14 / 14–22). Авто привязываются к команде, а не к одному человеку, поэтому оба сменщика «ведут» одни и те же машины.

> 🗓️ **PLANNED (Phase 11):** доступ через команду (`Team`) ещё не реализован — в текущем коде у авто одиночный `dispatcherId`. Команда нужна для gchat-уведомлений и доступа обоих сменщиков к авто. ⛔ Верификация выезда диспетчером **отменена** (статус выезда — мёртвый груз). См. [17-migration-roadmap.md](17-migration-roadmap.md) Шаг D.

### Что может делать
- Видеть авто, у которых `vehicle.dispatchTeamId = его команда` (`User.teamId`) — **оба сменщика** видят одни и те же авто.
- Видеть **делегации (выезды)** этих авто.
- Видеть km-рапорт по своим авто (read-only).
- Просматривать водителей и прицепы.

### Что НЕ может
- Менять данные авто или подавать заявления.
- Менять состав команд (`Team`) — это `admin`.

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
| Обработать reklamację (zaakceptować частично с `reklamacjaZatwKwota` или odrzucić) | `updateClaimFull` (флаг `reklamacjaZlozona` + поля reklamacji) |
| Видеть dashboard со статистикой по всем wnioskom | `getDashboardStats` → `GET /claims/dashboard` |
| Видеть eksport-делегации (read-only) | `getDelegacjeForEksport` → `GET /delegations` (filter eksport) |

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
| CRUD **авто** (всех) + редактирование `plannerId`, `dispatcherId`, ставок (DE/UE/Ekspoort/Import) | `addVehicle` / `updateVehicleDetails` / `toggleVehicleActive` / `removeVehicle` |
| CRUD **водителей** (всех) | `addDriver` / `updateDriver` / `toggleDriverActive` / `removeDriver` |
| CRUD **прицепов** (всех) | `addNaczepa` / `updateNaczepa` / `toggleNaczepaActive` / `removeNaczepa` |
| Управление **справочником типов прицепов** | `addNaczepaTyp` / `toggleNaczepaTypActive` |
| Менять **лимиты км / ставки** (`MonthlyLimit`) | `getLimityKm` (read) / `PUT /limits` (новое в API) |
| CRUD **пользователей** всех ролей (admin / pracownik / opiekun / planista / dyspozytor / eksport / weryfikator) | `POST/PATCH/DELETE /users` |
| Hard-delete (cascading) перевозчиков, авто, водителей, прицепов с обязательным `powod` | `deleteCarrierHard` etc. |
| Читать **audit log** | `GET /audit` |
| Diagnostic-эндпоинты (диагностика email-доставки, raw-снапшот wniosków, БД-сводка) | `diagnostykaMaili`, `DIAGNOSTYKA_WNIOSKÓW` → `GET /diagnostics/*` |
| В Carrier panel видеть **все** wnioski (а не только своих) — debug-fallback | `getClaimsForCarrier` (`if caller.rola === 'admin' пропускает фильтр nazwa`) |
| Anulować любую делegację | `cancelDelegacja` (admin/weryfikator) |

> На уровне guards в новой системе: `@Roles('admin')` для всего из этой таблицы; `@Roles('admin', 'pracownik')` — только для эндпоинтов claims-верификации. Никогда не `@Roles('admin', 'pracownik')` для CRUD entities.

---

## <a id="специальные-роли"></a>🔍 Специальные роли

### `eksport` — эксперт экспорта

Видит делегации, относящиеся к экспортным операциям (фильтр по типу). Read-only.

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
- **НЕ** делает: cancel выездов — это зона перевозчика (свой `zgloszony`) и админа.

---

## Матрица доступа

> Цель таблицы — закрепить **узость scope-а pracownik**. Если какое-то действие у `pracownik` стоит ✅, оно касается только wniosków или dashboard-статистики; никаких CRUD по справочным сущностям.

| Действие | admin | pracownik | opiekun | planista | dyspozytor | przewoznik | eksport | weryfikator |
|----------|:-----:|:---------:|:-------:|:--------:|:----------:|:----------:|:-------:|:-----------:|
| Подать заявление | — | — | — | — | — | ✅ | — | — |
| Верифицировать заявление | ✅ | ✅ | — | — | — | — | — | — |
| Видеть все заявления + dashboard | ✅ | ✅ | — | — | — | — | — | — |
| Запросить авторизацию у Maksima (большие суммы) | ✅ | ✅ | — | — | — | — | — | — |
| Загрузить screenshot авторизации | ✅ | ✅ | — | — | — | — | — | — |
| Видеть свои заявления | — | — | — | — | — | ✅ | — | — |
| CRUD перевозчиков (все) | ✅ | **—** | — | — | — | — | — | — |
| CRUD перевозчиков (свои) | — | — | ✅ | — | — | — | — | — |
| CRUD авто (все) | ✅ | **—** | — | — | — | — | — | — |
| CRUD авто (свои перев.) | — | — | ✅ | — | — | — | — | — |
| Видеть свои авто (planner / dispatch team) | — | — | — | ✅ | ✅ | — | — | — |
| CRUD водителей (все) | ✅ | **—** | — | — | — | — | — | — |
| CRUD водителей/прицепов (свои) | — | — | ✅ | — | — | **—** | — | — |
| Видеть своих водителей/прицепов/авто (read-only) | — | — | — | — | — | ✅ | — | — |
| CRUD прицепов (все) + типов прицепов | ✅ | **—** | — | — | — | — | — | — |
| Зарегистрировать выезд | — | — | — | — | — | ✅ | — | — |
| Менять статус выезда (`in-transit`/`returned`, с точными datetime выезда/съезда) | ✅ | — | — | — | — | — | — | ✅ |
| Anulować выезд | ✅ (любой активный) | — | — | — | — | ✅ (свой, `zgloszony`) | — | — |
| Проставлять дневной км машин | ✅ | — | — | — | — | — | — | ✅ |
| Видеть km-рапорт (read-only) | ✅ | — | — | ✅ (свои) | ✅ (своя команда) | — | ✅ | ✅ |
| Видеть выезды | ✅ | — | — | — | ✅ (свои) | ✅ (свои) | ✅ | ✅ |
| Управление лимитами / справочниками | ✅ | — | — | — | — | — | — | — |
| CRUD пользователей | ✅ | — | — | — | — | — | — | — |
| Audit log (чтение) | ✅ | — | — | — | — | — | — | — |
| Diagnostic endpoints | ✅ | — | — | — | — | — | — | — |

---

## Жизненный цикл пользователя

```
Создание (admin/opiekun)
    ↓
Email с login + сгенерированным паролем (welcome email)
    ↓
Первый вход → 2FA код по email → user-объект в сессии (JWT)
    ↓
[активная работа]
    ↓
Деактивация (active=false) → email-уведомление → блокировка логина
    ↓
[опционально] Реактивация → active=true → email
    ↓
[опционально] Hard delete (admin) → удаление + каскад на связанные сущности
```

## Multi-role

У одного физического человека могут быть две роли — например, перевозчик, который также является опекуном для других перевозчиков. В системе это представлено как два связанных user-аккаунта (один с `role=przewoznik`, другой с `role=opiekun`), у которых может совпадать email. После login пользователь получает `alternateRoles` — массив дополнительных ролей, и в UI есть переключатель панелей.

См. [15-auth-strategy.md#multi-role](15-auth-strategy.md) для деталей реализации.
