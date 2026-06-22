# Фаза 7 — Eksport + Weryfikator (имплементационная спека)

> Детализация Phase 7 из [`17-migration-roadmap.md`](17-migration-roadmap.md#фаза-7--eksport-weryfikator--1-неделя).
> Слайс по двум «специальным» ролям: **`eksport`** (read-only витрина выездов) и **`weryfikator`** (управление статусом выездов).
>
> **Статус:** scope уточнён заказчиком **2026-06-10** (ответы внесены ниже, см. § «Решения заказчика»). Базис — легаси `Code.gs`, но с **одним явным отклонением**: **`weryfikator` НЕ делает `cancel`** (нет таких полномочий). Его суть — ежедневно проверять автопарк внешними средствами (кто реально в трассе, кто съехал) и проставлять статус в приложении: `w_trasie` / `zjechal`. Cancel остаётся **carrier-only** (как сейчас). Не доизобретаем.

## 0″. ⚠️ REWORK (2026-06-20 #4) — Статусы выезда ВОЗВРАЩАЮТСЯ (eksport + weryfikator) + связка wniosek↔wyjazd

> **Это АКТУАЛЬНАЯ спека для статусов выезда и связки с wniosek.** Отменяет «статус = мёртвый груз» (§0′, `docs/04`) и «нет связи Claim↔Delegation» (06-12). Причина разворота: у статусов снова есть **ответственные роли** (eksport + weryfikator) — значит они не осиротевшие. **km-доска `VehicleDailyKm` (§0′) ОСТАЁТСЯ** (weryfikator ведёт её — источник `mileage`) **И** weryfikator получает отдельное окно статусов выездов. Зафиксировано с пользователем 2026-06-20/22 (скрин-флоу + AskUserQuestion ×9). **Реализуем сейчас.**

### Продуктовое решение — жизненный цикл выезда снова операционный

| Из → В | Роль | Смысл / данные |
|---|---|---|
| — → `zgloszony` | carrier | zgłoszenie: `departureAt` (дата+время), `plannedReturnAt` (только дата). Без изменений. |
| `zgloszony → gotowy` | `eksport \| admin` | eksport нашёл `ładunek`, сделал `zlecenie` в SpedTrans → **чистый флип статуса** (данные выезда НЕ трогает; время старта знает, но не вводит — не нагружаем роль). Откат `gotowy→zgloszony` разрешён, пока не `w_trasie`. |
| `gotowy → w_trasie` | `weryfikator \| admin` | машина выехала. «Юридический» статус: даже если машина стоит/сломалась — она `w_trasie` (привязка к грузу/рейсу, а не к факту движения в секунду). |
| `w_trasie → zjechal` | `weryfikator \| admin` | body `{ actualReturnAt: дата }` (date-only; время НЕ вводит — его верифицирует pracownik на wniosek). `actualReturnAt` = точная дата завершения рейса. Транзакция: `vehicle.lastDroveAt = max(lastDroveAt, actualReturnAt)` + авто-пересчёт связанного wniosek (см. ниже). |
| `* → anulowany` | carrier (свой `zgloszony`) **+ admin (любой активный)** | carrier — как раньше. **Новое:** admin анулирует любой активный (`gotowy`/`w_trasie`) — закрывает дыру «рейс сорвался после zlecenia». |

**Строгий порядок:** только по цепочке `zgloszony→gotowy→w_trasie→zjechal`. weryfikator не может ставить `w_trasie`, пока eksport не поставил `gotowy` (admin есть во всех `@Roles` — может форсить).

### Связка wniosek ↔ wyjazd (`Claim.delegationId`) — ВВОДИТСЯ

Разворот решения 06-12 «нет FK». Теперь:
- `Claim.delegationId` — **FK → Delegation, `@unique`** (один wniosek на выезд), nullable в БД (легаси/миграция), **обязателен для новых** wniosek (app-level).
- Перевозчик при подаче **выбирает свой выезд** (`w_trasie`/`zjechal`, без привязанного wniosek) — период не вводит руками: `dateStart = departureAt`, `dateEnd = actualReturnAt ?? plannedReturnAt`, `mileage = Σ VehicleDailyKm (drove)` за период (предзаполнение + override).
- Подавать можно из `{w_trasie, zjechal}`. Из `w_trasie` — **с предупреждением** «Wyjazd jeszcze nie ma statusu „Zjechał" — точно подаёшь?». Из `gotowy`/`zgloszony` — нельзя.
- Время возврата (`timeTo`, HH:MM) — на claim, ставит/верифицирует **pracownik**; `Delegation.actualReturnAt` несёт только дату.

### Авто-пересчёт wniosek при позднем `zjechal`

Перевозчик подал на `w_trasie` (`dateEnd = plannedReturnAt`), позже weryfikator ставит `zjechal` с другим `actualReturnAt`. `returned()` в той же транзакции пере-считывает связанный wniosek — **с жёсткими границами**:
- **Применяем ТОЛЬКО если** `claim.status ∈ {NA_WERYFIKACJI, OCZEKUJE_NA_AUTORYZACJE}` (не решён) **И** период не правил человек (`periodAdjustedByVerifier = false`).
- **Меняем:** `dateEnd = actualReturnAt` → `mileage` пере-предзаполняем `Σ VehicleDailyKm` за новый период (если нет ручного override) → km-calc заново (`kmGuaranteed/kmDifference/paymentEur/amountRequested/breakdown`). **`timeTo` НЕ трогаем** (зона pracownik). `origDateEnd/origMileage` снапшоты **сохраняем**.
- **НЕ применяем** (решён ИЛИ правлен человеком): период не трогаем, флаг + audit `claim.autoRecalcSkipped`; UI-бейдж «требует внимания: фактическая дата съезда отличается».
- Аудит: всегда `delegation.markReturned`; при пересчёте — `claim.autoRecalc` (before/after). **Без email** (только аудит + флаг в UI).

### Модель данных (db-agent)
- `DelegationStatus` += **`gotowy`**: `zgloszony | gotowy | w_trasie | zjechal | anulowany`.
- `Claim.delegationId String? @db.Uuid` + relation→`Delegation`, **`@unique`**, индекс; на `Delegation` — обратная `claim Claim?`.
- `Claim.periodAdjustedByVerifier Boolean @default(false)` — маркер «период правил человек» (граница авто-пересчёта; ставится в `true`, когда pracownik PATCH-ит `dateStart/dateEnd`).
- Forward-only миграция (БД пустая, не в проде).

### Backend (api-agent)
- Новый `delegation-state-machine.ts` (по образцу `claim-state-machine.ts`).
- `POST /delegations/:id/ready` — `eksport|admin`, `zgloszony→gotowy` (+ откат `gotowy→zgloszony`, пока не `w_trasie`). `@Audit('delegation.markReady')`.
- `POST /delegations/:id/in-transit` — `weryfikator|admin`, `gotowy→w_trasie`, `verifiedBy/At`. `@Audit('delegation.markInTransit')`.
- `POST /delegations/:id/returned` — `weryfikator|admin`, `w_trasie→zjechal`, body `{ actualReturnAt: date }`, транзакция (lastDroveAt + авто-пересчёт). `@Audit('delegation.markReturned')`.
- `POST /delegations/:id/cancel` — добавить `admin` (любой активный); carrier без изменений (свой `zgloszony`).
- Вернуть `weryfikator` в `@Roles`/scope `GET /delegations` (активные, как eksport); `ACTIVE_DELEGATION_STATUSES` += `gotowy`.
- `POST /claims` + `/claims/preview` принимают **`delegationId`**; период/пробег из выезда; гейт статуса `{w_trasie, zjechal}`; warning-флаг при `w_trasie` (soft).
- Recalc — `claims.service.recalcFromDelegation()`, зовётся из `delegations.service.returned()`.
- shared: воссоздать `MarkReadySchema` / `MarkInTransitSchema` / `MarkReturnedSchema`; `SubmitClaimSchema` += `delegationId` (период-поля производные).

### Frontend (web-agent + uiux-agent)
- **eksport** (`EksportDelegationsView`): «Oznacz Gotowy» на `zgloszony` + откат; доска дефолт `{zgloszony, gotowy, w_trasie}` + тогл истории.
- **weryfikator**: km-доска (`weryfikator/km`) ОСТАЁТСЯ **+ новое окно** `weryfikator/delegations` — выезды с «W trasie» (из `gotowy`) и «Zjechał» (из `w_trasie`, диалог с датой, предзаполнен `plannedReturnAt`). Две вкладки.
- **carrier** (`claims/new`): **селектор выезда** вместо ручного периода → предзаполнение; warning + подтверждение при `w_trasie`.
- **pracownik** ClaimModal: связанный выезд (план vs факт) + бейдж авто-пересчёта.
- i18n: `eksport.delegations.*`, `weryfikator.delegations.*`, `carrier.claims.wyjazdPicker.*`, warning/badge-ключи. uiux: бейджи 5 статусов, confirm-диалоги, warning-баннер.

### Что НЕ входит в слайс
- **Approval-роль Аркадиуша** (`zaakceptowany`, назначение zespół/экспортёра) — отдельный Phase 11. См. memory `spedtrans-zlecenie-wyjazd-approval`.
- **GPS-интеграция** — только хуки (`actualReturnAt` сможет нести время, источник `manual|gps`); саму интеграцию не строим.

### Решения (locked, 2026-06-20/22 — скрин-флоу + AskUserQuestion ×9)
1. Связь wniosek↔wyjazd — `Claim.delegationId` жёсткий FK. · 2. Период при позднем `zjechal` — авто-пересчёт `dateEnd→actualReturnAt`. · 3. weryfikator — два окна (km-доска + статусы выездов). · 4. Статус eksport — `gotowy`. · 5. Граница авто-пересчёта — только нерешённые. · 6. Конфликт правок — правка человека приоритетнее. · 7. Уведомление — аудит + флаг в UI (без email). · 8. Строгость — строго `gotowy→w_trasie` (admin форсит). · 9. Отмена после `gotowy` — admin анулирует любой активный. · 10. `delegationId` обязателен для новых. · 11. подавать из `{w_trasie+warning, zjechal}`. · 12. `mileage = Σ VehicleDailyKm` + override. · 13. `actualReturnAt`=дата (weryfikator), `timeTo`=время (pracownik). · 14. chat — пока только при создании. · 15. GPS — хуки, не интеграция.

---

## 0′. ⚠️ REWORK (2026-06-12 #3) — `VehicleDailyKm`: дневной км-лист + развязка claim↔delegation

> ⚠️ **ЧАСТИЧНО SUPERSEDED — см. §0″ (REWORK 2026-06-20 #4) выше.** km-доска `VehicleDailyKm` ниже ОСТАЁТСЯ (weryfikator ведёт её + получил отдельное окно статусов выездов), но «статус = мёртвый груз» и «развязка claim↔delegation» — **ОТМЕНЕНЫ**: статусы снова операционные, `Claim.delegationId` введён.
>
> **Это АКТУАЛЬНАЯ спека для `weryfikator`.** Заменяет §0 (route-status board) в части доски статусов и финализирует роль. `eksport` — без изменений. Решения зафиксированы с пользователем 2026-06-12 (AskUserQuestion + обсуждение). **Реализуем сейчас.**

### Продуктовое решение

Суть роли `weryfikator` = **ежедневно проставлять, сколько км проехала каждая машина** (новый процесс в фирме; раньше — огромный Excel вручную, сверка со SpedTrans+GPS). Деньги (`Claim`) считаются **на машину за период**, поэтому:

1. **Статусы выезда (`Delegation`) — мёртвый груз.** Никто их не верифицирует; `w_trasie/zjechal` через приложение не проставляются. Роли `weryfikator`/`eksport` и `cancel` (carrier-only) **остаются** (заказчик считает их нужными), но операционной нагрузки на статус выезда больше нет. `Delegation` = мягкая заявка «дайте работу на даты» (`zgłoszenie`) + триггер gchat + источник визуальной связки в панели перевозчика.
2. **Связи `Claim ↔ Delegation` в коде НЕТ** (FK нет) — подтверждает memory `no-wniosek-delegation-linking`; отменяет re-linking из roadmap 2026-06-11 (Phase 11 Шаг B выпиливается). Заказчику «связь» отдаётся **визуально** (клик на выезд → км-календарь машины), не кодом.
3. **Пробег в `Claim` = `Σ VehicleDailyKm`** (state=drove) за период машины — предзаполнение; `pracownik` сверяет/правит при верификации. Ручной fallback, если данных нет. (Позже, возможно, заменится на GPS API — известный источник недоразумений принят сознательно.)

### Решения (AskUserQuestion, 2026-06-12)
1. **Одна недельная доска** (строка = машина, 7 колонок-дней). Поглощает route-board §0. Статус машины (`w ruchu` / `nie jeździ` / `nieznany`) — производное от ячеек, показывается в шапке (W RUCHU / NIE JEŻDŻĄ).
2. **Ячейка `(машина × день)` — 3 состояния:** `drove` (км>0) / `idle` («nie jeździ», проверено-стоит) / нет строки («не проверено сегодня»).
3. **Хранение — новая таблица `VehicleDailyKm`**, `@@unique([vehicleId, date])`.

### Модель данных (db-agent)
- Новый enum `VehicleDayState { drove, idle }`. Переиспользуем `VehicleStatusSource { manual, gps }`.
- Новая таблица `vehicle_daily_km`, model `VehicleDailyKm`:
  - `id` uuid, `vehicleId` (FK→Vehicle, `onDelete: Cascade`), `date` (`@db.Date`), `km` (`Int?` — null при `idle`), `state` (`VehicleDayState`), `source` (`VehicleStatusSource @default(manual)`), `notedById` (FK→User, nullable — gps без юзера), `notes` (`String?`), `createdAt`, `updatedAt`.
  - `@@unique([vehicleId, date])` (одна отметка на машину/день — upsert), `@@index([date])` (доска недели).
  - На `Vehicle` — обратная связь `dailyKm VehicleDailyKm[]`.
- **Удаляем** (DB пустая, не в проде — forward-only миграция): таблицу `vehicle_route_statuses` (`VehicleRouteStatusLog`) + enum `VehicleRouteStatus`. Board §0 поглощён. `VehicleStatusSource` и `Vehicle.lastDroveAt` остаются.
- **Производный статус машины** (НЕ хранится): по последней по `date` записи → `drove` ⇒ `w_ruchu`; `idle` ⇒ `nie_jezdzi`; нет записи в периоде ⇒ `nieznany`.

### Backend (api-agent)
- **`GET /vehicles/km-board?week=YYYY-Www`** (или `?from=<пн>`): все активные машины + 7 ячеек-дней (km/state/notes) + `Σ km` недели + производный статус + carrier/opiekun/planner/sideNumber. Роли `weryfikator | admin`. **Заменяет `GET /vehicles/route-board`.**
- **`PUT /vehicles/:id/daily-km`** body `{ date, state: drove|idle, km?, notes? }` — **upsert** по (vehicleId, date), `source=manual`, `notedById=caller`, `@Audit('vehicle.setDailyKm')`. Если `state=drove` → в той же транзакции `vehicle.lastDroveAt = max(lastDroveAt, date)`. **Заменяет `POST /vehicles/:id/route-status`.**
- **`GET /vehicles/:id/daily-km?from&to`** — история (модалка «Historia»). Заменяет `GET /vehicles/:id/route-status`.
- **Km-рапорт (read-only):** `GET /vehicles/km-report?week=...` — **только ехавшие** машины (есть `drove`-дни в периоде), scoped: `planista` (свои `plannerId`), `dyspozytor` (своя команда — Phase 11; пока `dispatcherId`), `eksport`/`admin`/`weryfikator` — все. Это «Raport km — moje pojazdy» со скрина.
- **Claim mileage:** в `POST /claims` (или предпросмотр) пробег предзаполняется `Σ VehicleDailyKm.km (state=drove)` за `[from,to]` машины; `pracownik` правит при верификации. **Без** `Claim.delegationId`.
- **Удалить** route-status: service/repo/контроллер-методы + shared `SetVehicleRouteStatusSchema`.
- shared: `SetVehicleDailyKmSchema` (Zod), `VehicleDailyKmDto`, `VehicleKmBoardItemDto`, enum `VehicleDayState`, derived-status helper.

### Frontend (web-agent + uiux-agent)
- **Доска weryfikator** `app/(weryfikator)/weryfikator/km/page.tsx` — недельная сетка (как Image 7): шапка (TYDZIEŃ Wnn, CIĄGNIKI, W RUCHU, NIE JEŻDŻĄ, Σ KM, NOTATEK), строки машин (nr rej / nr boczny / przewoźnik / opiekun / dyspozytor), 7 ячеек-дней (ввод km + drove/idle), `Σ KM`, notatka, «Historia». Навигация по неделям. Заменяет route-status страницу.
- **Read-only km-рапорт** для planista/dyspozytor — та же сетка, просмотр своих машин, фильтр «только ехавшие».
- **Панель перевозчика — клик на выезд → км-календарь:** в detail/модалке выезда показать календарик, где по `vehicleId` + пересечению `[departureAt, plannedReturnAt]` видны дневные км приписанной машины из `VehicleDailyKm`. Это «визуальная связь» выезд↔км без FK. uiux — над подачей.
- i18n: `weryfikator.km.*`, `delegation.kmCalendar.*`.

### Что НЕ трогаем
- `eksport` (read-only выезды), `Delegation` cancel (carrier-only), `DelegationStatus` enum (мёртвый груз, но остаётся).

---

## Легенда
- ✅ — уже есть в новом коде
- 🔲 — надо реализовать в этой фазе
- ❓ — открытый вопрос (scope не ясен, решаем дефолтом легаси)
- 🔗 — зависит от ранее принятого решения

---

## 0. ⚠️ REWORK (2026-06-10 #2) — Weryfikator работает с МАШИНАМИ, не с выездами

> ⛔ **ЧАСТИЧНО SUPERSEDED — см. §0′ (REWORK 2026-06-12 #3) выше.** Идея «weryfikator работает с машинами» — верна и остаётся, но **доска статусов `w_trasie/zjechal` (`VehicleRouteStatusLog`) поглощена дневным км-листом `VehicleDailyKm`** и удаляется. Ниже — история route-status-доски.
>
> **Это актуальная спека для `weryfikator`. Всё, что ниже про «weryfikator + delegacje», — superseded** (оставлено как история). `eksport` — без изменений, остаётся на выездах.

Заказчик уточнил после сбора инфы: **`weryfikator` не видит выезды (delegacje) вообще.** Он получает **список всех машин** и ежедневно проставляет операционный статус каждой: «в трассе» / «съехал». Фактический выезд машины определяется **внешним сервисом + людьми вне приложения**; связи `delegation ↔ vehicle` нет и не нужно.

### Решения (AskUserQuestion, 2026-06-10)
1. **Хранение — отдельная таблица-история** (append-only). Каждая отметка = новая строка. Текущий статус = последняя строка за сегодня. Поле `source` (`manual|gps`) — задел под внешний GPS-сервис. (НЕ колонка на `vehicles`, НЕ 1:1-таблица.)
2. **Старый delegation-поток у weryfikator убираем.** Эндпоинты `POST /delegations/:id/in-transit` + `/returned`, delegation state-machine, схемы `MarkInTransit/MarkReturned`, страница `weryfikator/delegations` и её хуки/диалоги — **удаляются**. `eksport` остаётся на выездах. `vehicle.lastDroveAt` теперь обновляется при отметке «съехал» у машины.
3. **Статусы машины:** enum `w_trasie | zjechal` + производный `nieznany` («не проверено сегодня» = нет записи за сегодня; в enum НЕ хранится).

### Модель данных (db-agent)
- Новый enum `VehicleRouteStatus { w_trasie, zjechal }` и `VehicleStatusSource { manual, gps }`.
- Новая таблица `vehicle_route_statuses` (`@@map`), model `VehicleRouteStatus` (или близкое имя):
  - `id` (uuid), `vehicleId` (FK→Vehicle, `onDelete: Cascade`), `status` (`VehicleRouteStatus`), `source` (`VehicleStatusSource @default(manual)`), `notedById` (FK→User, **nullable** — gps без юзера), `notedAt` (`DateTime @default(now())`), `notes` (`String?`), `createdAt`.
  - Индексы: `@@index([vehicleId, notedAt])` (latest-per-vehicle), `@@index([notedAt])` (доска за день).
  - На `Vehicle` — обратная связь `routeStatuses VehicleRouteStatus[]`. **Колонку статуса на `Vehicle` НЕ добавляем** (история — единственный источник). `lastDroveAt` остаётся.
- «Текущий статус на сегодня» = последняя по `notedAt` запись машины с `notedAt::date = сегодня`; иначе `nieznany`.

### Backend (api-agent)
- **Удалить** delegation `in-transit`/`returned` (controller + service + state-machine + shared `Mark*`-схемы); убрать `weryfikator` из `@Roles` и `_scopeListFilters` у delegations. **Eksport-ветку и `includeHistory` оставить.** `DelegationStatus` enum НЕ трогаем (значения `w_trasie/zjechal` просто перестанут проставляться через приложение — eksport-вью продолжит работать).
- **Список машин для weryfikator:** все активные машины (`active`, `!deletedAt`) с **`carrier`** (name), **`opiekun`** (= `vehicle.carrier.opiekun`, User), `planner`, `sideNumber` и текущим статусом (на сегодня). Роли `weryfikator | admin`. Дедик. endpoint `GET /vehicles/route-board`. (⚠️ 2026-06-10: в отображении и carrier, **и** opiekun — заказчик вернул carrier обратно, opiekun оставил.)
- **`POST /vehicles/:id/route-status`** — body `{ status: w_trasie|zjechal, notes? }`, роли `weryfikator | admin`, `@Audit('vehicle.setRouteStatus')`. Аппендит строку (`source=manual`, `notedById=caller`, `notedAt=now`); если `status=zjechal` → **в той же транзакции** `vehicle.lastDroveAt = notedAt` (date).
- **История машины:** `GET /vehicles/:id/route-status` — список записей (для модалки истории).
- shared: `SetVehicleRouteStatusSchema` (Zod), типы, enum-ы.

### Frontend (web-agent)
- **Удалить** `weryfikator/delegations` (page + `WeryfikatorDelegationsView` + `WeryfikatorDelegationsTable` + `DelegationStatusActionDialog`); убрать `markInTransit/markReturned` из `lib/api/delegations.ts` и соответствующие хуки.
- **Новая страница `app/(weryfikator)/weryfikator/vehicles/page.tsx`** — таблица всех машин:
  - Колонки: **nr rej** (`plateNumber`) / **nr boczny** (`sideNumber` — внутреннее название машины в фирме, отдельная колонка) / **перевозчик** (`carrier`) / **opiekun** (`vehicle.carrier.opiekun`) / **planista** (`planner`) / **статус** (`StatusBadge`: в трассе / съехал / не проверено) / кто+когда отметил / **действие**. **Без водителя.** (2026-06-10: carrier И opiekun обе колонки; `sideNumber` выделен в отдельную колонку.)
  - Действие: кнопки «В трассе» / «Съехал» → `POST /vehicles/:id/route-status`. Можно переотмечать. История по машине — модалка/expand.
  - Фильтр по статусу + (опц.) поиск по номеру/перевозчику/opiekun.
- Нав: лендинг weryfikator → редирект на `/weryfikator/vehicles`; обновить `ROLE_LANDING.weryfikator`.
- i18n: переписать `weryfikator.*` под доску машин.

### Что НЕ трогаем
- **Eksport** — read-only выезды, без изменений.
- **`DelegationStatus` enum** и **cancel** (carrier-only) — без изменений.
---

## 1. Роли — что они делают (по легаси)

Источники: [`03-roles.md` § Специальные роли](03-roles.md#специальные-роли) + `Code.gs`.

### `weryfikator` — верификатор выездов (delegacje) — ~~SUPERSEDED, см. § 0~~
> ⚠️ **Этот блок устарел** (rework 2026-06-10 #2): weryfikator больше НЕ работает с выездами, а с машинами. Актуальная спека — в § 0. Ниже — история.

Управляет жизненным циклом выезда. По легаси (`Code.gs`):
- **`markDelegacjaInTransit`** (`Code.gs:4071`) — `zgloszony → w_trasie`. Права: `weryfikator | admin`.
- **`markDelegacjaReturned`** (`Code.gs:4100`) — `w_trasie → zjechal`. Требует **фактическую дату зьезда** (`dataZjazduRzeczywista`), и **обновляет `AUTA.OstatnioJezdzilo`** = `Vehicle.lastDroveAt`. Права: `weryfikator | admin`.
- ~~**`cancelDelegacja`** (`Code.gs:4150`) — анулирование.~~ **ОТКЛОНЕНО заказчиком (2026-06-10):** у `weryfikator` НЕТ права cancel. Анулирование остаётся **carrier-only** (`przewoznik`: свой выезд + только `zgloszony`), как реализовано сейчас. Не трогаем.
- Видит **все** выезды, может включить историю архивных.

### `eksport` — эксперт экспорта
Read-only витрина выездов. По легаси (`getDelegacjeForEksport` `Code.gs:3980`, `getEksportData` `Code.gs:4196`):
- Видит **все `zgloszony` + `w_trasie` по умолчанию**, опционально — историю (`includeHistory`).
- Доступ в легаси открыт для `eksport | admin | pracownik`.
- Никаких мутаций.

> ⚠️ В `03-roles.md` eksport описан как «делегации, относящиеся к экспортным операциям (**фильтр по типу**)», а в `17-migration-roadmap.md` — как «свои» делегации. В легаси-коде же `getDelegacjeForEksport` отдаёт **все** активные. Это расхождение → см. § «Открытые вопросы», вопрос 1.

---

## 2. Текущее состояние нового приложения

### Данные ✅
[`Delegation`](12-database-schema.md) уже есть. Релевантное:
- `status: DelegationStatus` — enum `zgloszony | w_trasie | zjechal | anulowany`.
- `departureAt`, `plannedReturnAt` (**date-only**), `actualReturnAt` (`DateTime?`, ставится только при переходе в `zjechal`).
- `reportedBy/At`, `verifiedBy/At`, `notes`, soft-delete `deletedAt`.
- `vehicle.lastDroveAt` — операционный сигнал автопарка (его обновляет «returned»).

### Backend — что есть / чего нет
| Endpoint | Статус |
|---|---|
| `GET /delegations` (list) | ✅ |
| `GET /delegations/eligibility` | ✅ (не про эту фазу — готовность автопарка подать выезд) |
| `GET /delegations/:id` | ✅ |
| `POST /delegations` (создать) | ✅ |
| `POST /delegations/:id/cancel` | ✅ **остаётся carrier-only** (`przewoznik`: свой + `zgloszony`). По решению заказчика (2026-06-10) НЕ расширяем под `weryfikator`. Эту фазу не трогаем. |
| `POST /delegations/:id/in-transit` | 🔲 (есть только в комментарии контроллера, не реализован) |
| `POST /delegations/:id/returned` | 🔲 (то же) |
| Role-scope фильтры списка для `eksport` / `weryfikator` | 🔲 / ❓ |

### Frontend — только стабы
- `app/(eksport)/eksport/page.tsx` — заглушка.
- `app/(weryfikator)/weryfikator/page.tsx` — заглушка.
- Целевые страницы выездов (`.../delegations/page.tsx`) ещё не созданы.

---

## 3. Что делаем в этой фазе (baseline = легаси)

### Backend 🔲

1. **`POST /delegations/:id/in-transit`** — `weryfikator | admin`.
   - Переход `zgloszony → w_trasie` (валидировать текущий статус).
   - Проставить `verifiedById = caller`, `verifiedAt = now`.
   - Аудит (`@Audit('delegation.markInTransit')`).

2. **`POST /delegations/:id/returned`** — `weryfikator | admin`.
   - Переход `w_trasie → zjechal`.
   - Body: `{ actualReturnAt }` (**обязательно** — легаси требует дату зьезда). **Тип: date-only** (решение заказчика 2026-06-10, вопрос 2) — как `plannedReturnAt`.
   - Проставить `actualReturnAt`, `verifiedById/At`.
   - **Обновить `vehicle.lastDroveAt = actualReturnAt`** (в той же транзакции). Это ключевой deliverable — фле­товый сигнал «авто вернулось».
   - Аудит (`@Audit('delegation.markReturned')`).

3. **`POST /delegations/:id/cancel`** — ⛔ **НЕ трогаем.** Решение заказчика (2026-06-10): `weryfikator` НЕ получает cancel (нет таких полномочий). Эндпоинт остаётся carrier-only как есть (`@Roles('przewoznik')` + сервисный гейт `zgloszony`). Никаких изменений прав в этой фазе. ⚠️ Это отменяет прежний build-item, который требовал расширить cancel под weryfikator/admin.

4. **Role-scope список `GET /delegations`:**
   - `weryfikator` → видит **все** выезды, флаг `includeHistory` для архивных/`zjechal`/`anulowany`.
   - `eksport` → read-only, **все `zgloszony` + `w_trasie`** по умолчанию + `includeHistory` (дефолт легаси). ❓ см. вопрос 1.
   - Проверить, что текущий `GET /delegations` либо уже это умеет через фильтры, либо добавить role-aware-ветку.

5. **shared / contracts:** DTO для `in-transit` / `returned` (Zod-схемы), `DelegationStatus`-переходы в state-machine выездов (по аналогии с claim-state-machine).

### Frontend 🔲

1. **`app/(eksport)/delegations/page.tsx`** — read-only таблица выездов.
   - Переиспользовать паттерн read-only панелей Phase 6 (planista/dyspozytor) из [`14-design-system.md` § Phase 6](14-design-system.md).
   - Колонки: авто / прицеп / водитель / перевозчик / `departureAt` / `plannedReturnAt` / статус. Фильтр по статусу + тогл «история».

2. **`app/(weryfikator)/delegations/page.tsx`** — таблица + действия смены статуса + история.
   - Кнопки по статусу (**только 2 действия — cancel здесь НЕТ**):
     - `zgloszony` → **«Oznacz w trasie»** (in-transit).
     - `w_trasie` → **«Oznacz zjechał»** → диалог с вводом **даты зьезда** (`actualReturnAt`, date-only), затем returned.
   - Тогл «история» (архивные `zjechal`/`anulowany`).
   - Для action-UI (confirm-диалоги смены статуса) — небольшое DS-дополнение, согласовать с uiux-agent.

### Deliverables
- ✅ `weryfikator` меняет статус выезда (in-transit → returned с датой зьезда), видит все выезды + историю. **Cancel — НЕ его зона** (остаётся carrier-only).
- ✅ `returned` автоматически обновляет `Vehicle.lastDroveAt`.
- ✅ `eksport` видит read-only список выездов (все активные + история).

---

## 4. Решения заказчика (2026-06-10) — scope зафиксирован

1. **✅ Что видит `eksport`: ВСЕ активные.** Без фильтра по типу/перевозчику/стране. Дефолт — **все `zgloszony` + `w_trasie`**, read-only, + тогл истории (`includeHistory` показывает `zjechal`/`anulowany`). Расхождение доков (`03-roles` «по типу» / `roadmap` «свои») закрыто в пользу легаси-кода: всё активное.

2. **✅ `actualReturnAt` — date-only.** Принимаем просто дату (как `plannedReturnAt`), пишем в `actualReturnAt` и в `vehicle.lastDroveAt`. Время не нужно.
   - 🔗 Не путать с верификацией **времени приезда для claim** — это отдельная зона `pracownik` (см. п.3).

3. **✅ Связи `Claim ↔ Delegation` НЕТ — подтверждено.** Так и остаётся: связи между двумя таблицами нет. Weryfikator ведёт **операционный** жизненный цикл выезда (статус + `lastDroveAt`); «человеческую» верификацию точного времени приезда **для claim** делает `pracownik` в [`ClaimModal`](14-design-system.md). Потоки не связаны. См. memory `no-wniosek-delegation-linking`.

4. **✅ Роль `weryfikator` будет укомплектована** — минимум 1 человек. Строим полноценно. Суть роли: ежедневно внешними средствами определять, кто реально в трассе / съехал, и проставлять статус в приложении.

5. **✅ `weryfikator` НЕ делает `cancel`.** ⚠️ **Это переопределяет легаси и прежний build-item §3.3.** У роли нет таких полномочий — только `in-transit` и `returned`. Cancel остаётся carrier-only (`przewoznik` + `zgloszony`), эндпоинт не трогаем.

---

## 5. Маршрут реализации (когда стартуем)

`orchestrator-agent` → `db-agent` (модель готова — скорее всего no-op) → `api-agent` (in-transit / returned / scope-фильтры + shared DTO + state-machine; **cancel не трогаем**) → `web-agent` (две страницы delegations) ‖ `uiux-agent` (action-UI weryfikator-а в DS). Проверка: typecheck по воркспейсам + api-тесты на переходы статусов + обновление `lastDroveAt`.

## 6. Зависимости и ссылки
- Роли и матрица: [`03-roles.md`](03-roles.md#специальные-роли)
- Модель `Delegation`: [`12-database-schema.md`](12-database-schema.md), [`04-data-model.md`](04-data-model.md)
- API-контракты: [`13-api-design.md`](13-api-design.md)
- Роадмап (краткая версия фазы): [`17-migration-roadmap.md` § Фаза 7](17-migration-roadmap.md)
- Quirks (выезды / `lastDroveAt` / GPS): [`19-known-quirks.md`](19-known-quirks.md), [`16-jobs-and-integrations.md`](16-jobs-and-integrations.md)
- Решение «связки нет»: memory `no-wniosek-delegation-linking`
