# Фаза 7 — Eksport + Weryfikator (имплементационная спека)

> Детализация Phase 7 из [`17-migration-roadmap.md`](17-migration-roadmap.md#фаза-7--eksport-weryfikator--1-неделя).
> Слайс по двум «специальным» ролям: **`eksport`** (read-only витрина выездов) и **`weryfikator`** (управление статусом выездов).
>
> **Статус:** scope уточнён заказчиком **2026-06-10** (ответы внесены ниже, см. § «Решения заказчика»). Базис — легаси `Code.gs`, но с **одним явным отклонением**: **`weryfikator` НЕ делает `cancel`** (нет таких полномочий). Его суть — ежедневно проверять автопарк внешними средствами (кто реально в трассе, кто съехал) и проставлять статус в приложении: `w_trasie` / `zjechal`. Cancel остаётся **carrier-only** (как сейчас). Не доизобретаем.

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
