# Фаза 7 — Eksport + Weryfikator (имплементационная спека)

> Детализация Phase 7 из [`17-migration-roadmap.md`](17-migration-roadmap.md#фаза-7--eksport-weryfikator--1-неделя).
> Слайс по двум «специальным» ролям: **`eksport`** (read-only витрина выездов) и **`weryfikator`** (управление статусом выездов).
>
> **Статус:** scope частично неясен. Полный функционал этих ролей с заказчиком ещё не проговорён — поэтому **на этом этапе реализуем ровно то, что есть в легаси `Code.gs`**, а спорные места выносим в § «Открытые вопросы» и закрываем дефолтами легаси. Не доизобретаем.

## Легенда
- ✅ — уже есть в новом коде
- 🔲 — надо реализовать в этой фазе
- ❓ — открытый вопрос (scope не ясен, решаем дефолтом легаси)
- 🔗 — зависит от ранее принятого решения

---

## 1. Роли — что они делают (по легаси)

Источники: [`03-roles.md` § Специальные роли](03-roles.md#специальные-роли) + `Code.gs`.

### `weryfikator` — верификатор выездов (delegacje)
Управляет жизненным циклом выезда. По легаси (`Code.gs`):
- **`markDelegacjaInTransit`** (`Code.gs:4071`) — `zgloszony → w_trasie`. Права: `weryfikator | admin`.
- **`markDelegacjaReturned`** (`Code.gs:4100`) — `w_trasie → zjechal`. Требует **фактическую дату зьезда** (`dataZjazduRzeczywista`), и **обновляет `AUTA.OstatnioJezdzilo`** = `Vehicle.lastDroveAt`. Права: `weryfikator | admin`.
- **`cancelDelegacja`** (`Code.gs:4150`) — анулирование. Права: `admin/weryfikator` — **любой статус**; перевозчик — только свой и только `zgloszony`.
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
| `POST /delegations/:id/cancel` | ⚠️ **только `przewoznik`** (свой + статус `zgloszony`); `weryfikator`/`admin` → **403**. Cancel для weryfikator **ещё НЕ реализован** — явно отложен на эту фазу |
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
   - Body: `{ actualReturnAt }` (**обязательно** — легаси требует дату зьезда). Тип — обсудить: date-only (как `plannedReturnAt`) или полный timestamp. 🔗 см. вопрос 2.
   - Проставить `actualReturnAt`, `verifiedById/At`.
   - **Обновить `vehicle.lastDroveAt = actualReturnAt`** (в той же транзакции). Это ключевой deliverable — фле­товый сигнал «авто вернулось».
   - Аудит (`@Audit('delegation.markReturned')`).

3. **`POST /delegations/:id/cancel`** 🔲 **расширить под weryfikator** (сейчас НЕ работает для него). Проверено 2026-06-09: эндпоинт жёстко carrier-only — `@Roles('przewoznik')` на контроллере + сервис кидает `ForbiddenException` для любого не-`przewoznik` + статус-гейт только `zgloszony`; в коде прямой коммент «weryfikator handles them in Phase 7». `RolesGuard` — строгий whitelist без admin-bypass, поэтому и `admin` сейчас получает 403.
   - Сделать: добавить `weryfikator` (и `admin`) в `@Roles` cancel-эндпоинта; разветвить сервис — `przewoznik` (свой выезд + только `zgloszony`) vs `weryfikator`/`admin` (**любой** статус, как в легаси `Code.gs:4150`).
   - Записать `verifiedById/At` + причину в `notes` (легаси append к Uwagi).

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
   - Кнопки по статусу:
     - `zgloszony` → **«Oznacz w trasie»** (in-transit).
     - `w_trasie` → **«Oznacz zjechał»** → диалог с вводом **даты/времени зьезда** (`actualReturnAt`), затем returned.
     - любой не-`zjechal` → **«Anuluj»** → диалог с **powód** (reason) → cancel.
   - Тогл «история» (архивные `zjechal`/`anulowany`).
   - Для action-UI (confirm-диалоги смены статуса) — небольшое DS-дополнение, согласовать с uiux-agent.

### Deliverables (как в легаси)
- ✅ `weryfikator` меняет статус выезда (in-transit → returned с датой → / cancel в любом статусе), видит все выезды + историю.
- ✅ `returned` автоматически обновляет `Vehicle.lastDroveAt`.
- ✅ `eksport` видит read-only список выездов (+ история).

---

## 4. Открытые вопросы (scope не ясен — закрываем дефолтом легаси)

1. **❓ Что именно видит `eksport`?** Документы расходятся: «по типу» (`03-roles`) vs «свои» (`roadmap`) vs «все активные» (легаси-код). В **новой модели `Delegation` нет ни поля `type`, ни owner-связи с eksport** — значит «фильтр по типу»/«свои» 1:1 не переносится.
   - **Интерим (делаем сейчас):** как в легаси-дефолте — **все `zgloszony` + `w_trasie`**, read-only, + тогл истории.
   - **Нужно от заказчика:** реальный критерий видимости (тип операции? страна? перевозчик? всё?). До ответа — дефолт выше.

2. **❓ `actualReturnAt` — дата или дата+время?** Легаси `markDelegacjaReturned` берёт `dataZjazduRzeczywista` (date). `plannedReturnAt` — date-only, `actualReturnAt` — `DateTime?`. Для `lastDroveAt` достаточно даты.
   - **Интерим:** принимаем дату (date-only), пишем в `actualReturnAt`.
   - 🔗 Не путать с верификацией времени приезда для **wniosku** — это отдельная зона ответственности `pracownik` (см. вопрос 3).

3. **🔗 Связи `Claim ↔ Delegation` НЕ делаем** (решено, см. memory `no-wniosek-delegation-linking` + заметка Obsidian «Связка»). Weryfikator ведёт **операционный** жизненный цикл выезда (статус + `lastDroveAt`); точное время приезда **для claim** отдельно проверяет `pracownik` в [`ClaimModal`](14-design-system.md) (§6.5). Эти два потока не связаны.

4. **❓ Будет ли роль `weryfikator` вообще укомплектована людьми?** Из обсуждения «Связки»: возможно, её функцию позже заберёт `dyspozytor` или `pracownik`. **Строим как в легаси**, но держим scope изолированным, чтобы при необходимости свернуть в другую роль без переписывания.

5. **✅ Проверено (2026-06-09): `cancel` для weryfikator в новом коде НЕ реализован.** Эндпоинт carrier-only (`@Roles('przewoznik')` + сервисный `ForbiddenException` + гейт `zgloszony`); weryfikator/admin → 403; в коде явно «отложено на Phase 7». Это **не open-question, а build-item** — делаем как в легаси (weryfikator/admin анулируют любой статус). Детали в § 3.3.

---

## 5. Маршрут реализации (когда стартуем)

`orchestrator-agent` → `db-agent` (если нужен `actualReturnAt`-тип/индексы — скорее нет, модель готова) → `api-agent` (in-transit / returned / scope-фильтры / cancel-права + shared DTO + state-machine) → `web-agent` (две страницы delegations) ‖ `uiux-agent` (action-UI weryfikator-а в DS). Проверка: typecheck по воркспейсам + api-тесты на переходы статусов + обновление `lastDroveAt`.

## 6. Зависимости и ссылки
- Роли и матрица: [`03-roles.md`](03-roles.md#специальные-роли)
- Модель `Delegation`: [`12-database-schema.md`](12-database-schema.md), [`04-data-model.md`](04-data-model.md)
- API-контракты: [`13-api-design.md`](13-api-design.md)
- Роадмап (краткая версия фазы): [`17-migration-roadmap.md` § Фаза 7](17-migration-roadmap.md)
- Quirks (выезды / `lastDroveAt` / GPS): [`19-known-quirks.md`](19-known-quirks.md), [`16-jobs-and-integrations.md`](16-jobs-and-integrations.md)
- Решение «связки нет»: memory `no-wniosek-delegation-linking`
