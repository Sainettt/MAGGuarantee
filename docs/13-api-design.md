# 13. REST API design

> Маппинг всех публичных GAS-функций на REST endpoints. Цель — функциональная идентичность, не побитовая копия.

## Соглашения

### Базовый префикс

Все endpoints живут под `/api/v1/`. Версия в URL, чтобы можно было ввести v2 в будущем без brick'инга клиентов.

### Аутентификация

- Все endpoints (кроме `/auth/login`, `/auth/verify-code`, `/auth/refresh`, `/health`) защищены `JwtAuthGuard`.
- JWT передаётся в `Authorization: Bearer <access_token>` или в HttpOnly cookie `mt_access` (для web).
- `RolesGuard` дополнительно проверяет роль через `@Roles(...)`. Помни: `pracownik` — это узкая роль («Opiekun wniosków»), допущенная только к claims-эндпоинтам и dashboard. Никогда не комбинируй `@Roles('admin', 'pracownik')` для CRUD по carriers/vehicles/drivers/trailers — там должно быть `@Roles('admin', 'opiekun')`.
- `OwnershipGuard` для opiekun-эндпоинтов: проверяет, что `carrierId` в pathparam принадлежит текущему opiekun.

### Формат ответов

**Успех:** статус 2xx, body — JSON с данными прямо (без обёртки `{data}` — лишний шум).

```json
{ "id": "...", "nrZgl": "GWA/001/05/26", ... }
```

**Ошибки:** RFC 7807 problem-details, HTTP-статус соответствует:

```json
{
  "type": "/problems/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "DataStop must be after DataStart",
  "errors": { "dateEnd": "must be after dateStart" }
}
```

Дополнительные опциональные поля envelope:

- `violations: string[]` — мульти-violation 422 (см. `POST /claims` ниже).
  Сервис кидает `UnprocessableEntityException({ violations })`, фильтр
  передаёт массив в ответ. UI отрисовывает список нарушений баннером.
- `extensions: Record<string, unknown>` — структурированные машинные поля,
  специфичные для конкретного 422 (например `nextAllowedAt: ISO` для
  vehicle-cooldown). Никаких глобальных ключей не зарезервировано — каждый
  сервис документирует свои в разделе соответствующего endpoint-а.

Стандартные коды:

| Код | Когда |
|---|---|
| 400 | Валидация (Zod / class-validator) |
| 401 | Нет токена / истёк |
| 403 | Роль не позволяет |
| 404 | Ресурс не найден |
| 409 | Конфликт (дубликат NrRej, NrZgl уже занят) |
| 422 | Бизнес-правило (например `KwotaWnioskowana > порог авторизации`) |
| 423 | Заблокирован (5 неудачных попыток 2FA) |
| 429 | Rate limit |
| 500 | Internal |

### Пагинация

Cursor-based для длинных списков (claims, delegations, audit). Параметры:

```
GET /api/v1/claims?cursor=<id>&limit=50&status=NA_WERYFIKACJI&sort=-statusChangedAt
```

Ответ:

```json
{
  "items": [...],
  "nextCursor": "uuid-or-null",
  "total": 1247  // опц., только если cheap
}
```

### Фильтрация

Фильтры — query params (snake-case в URL, camelCase в body):

```
GET /api/v1/claims?carrier_id=...&status=ZAAKCEPTOWANO&from=2026-01-01&to=2026-04-30
```

### CORS / Security

- CORS: только `NEXT_PUBLIC_APP_URL`.
- Helmet, rate-limit (100 req/min на IP, 5 login/min на IP).
- CSRF: не нужен если JWT в `Authorization` header, нужен для cookie-режима — `X-CSRF-Token` через double-submit cookie.

## Карта endpoint-ов

### Auth — `/api/v1/auth`

| Method + Path | GAS-аналог | Назначение |
|---|---|---|
| POST `/auth/login` | `sendLoginCode` (`Code.gs:1003`) | Принимает `{login, password}`. Если ok → `{ codeSent: true, maskedEmail: 'ma***@magtrans.eu', sessionToken }` (sessionToken — короткоживущий, нужен для verify) |
| POST `/auth/verify-code` | `verifyLoginCode` (`Code.gs:1064`) | Принимает `{sessionToken, code}`. Возвращает `{accessToken, refreshToken, user}` (`user` несёт `mustChangePassword`). Set-cookie если режим cookie. |
| POST `/auth/resend-code` | `resendLoginCode` (`Code.gs:1131`) | Принимает `{sessionToken}`. Rate-limited. |
| POST `/auth/refresh` | — (новое, не было в GAS) | Refresh access из refresh. Rotation. `user` несёт `mustChangePassword`. |
| POST `/auth/logout` | — | Инвалидирует refresh-токен (записывает в `revokedAt`). |
| GET `/auth/me` | `validateCaller` | Возвращает текущего user-а на основе access-токена (вкл. `mustChangePassword`). |
| POST `/auth/forgot-password` | — (новое) | `{login}`. **Always 200** `{sessionToken, maskedEmail}` (anti-enumeration: decoy для неизвестного login). Шлёт reset-код на email (Redis `pwreset:*`, attempts/lockout как 2FA). Rate 5/min/IP. |
| POST `/auth/reset-password` | — (новое) | `{sessionToken, code, newPassword}` → 204. Верифицирует код, хеширует, ставит `passwordChangedAt`, чистит `mustChangePassword`, **отзывает все refresh-токены**. Без авто-логина. Rate 10/min. |
| POST `/auth/resend-reset-code` | — (новое) | `{sessionToken}`. Cooldown как `resend-code`. Rate 2/min. |
| POST `/auth/change-password` | — (новое, authenticated) | `{newPassword}` — forced/voluntary смена. Чистит `mustChangePassword`, ставит `passwordChangedAt`, выдаёт свежую пару токенов (claim сброшен), **отзывает прочие сессии**. |
| GET `/auth/google` | — (опц.) | Redirect на Google OAuth |
| GET `/auth/google/callback` | — (опц.) | Колбэк OAuth, выдаёт JWT |

> **JWT-claim `mustChangePassword`.** Access-токен несёт флаг — web-middleware декодирует `mt_access` и гейтит навигацию на `/login/change-password`, пока флаг стоит. Снимается после `change-password` (свежая пара токенов).

### Users (admin only) — `/api/v1/users`

| Method + Path | Назначение |
|---|---|
| GET `/users` | Список всех пользователей (фильтр `role=`) |
| GET `/users/:id` | Деталь |
| POST `/users` | Создать (admin) |
| PATCH `/users/:id` | Обновить |
| POST `/users/:id/deactivate` | `Aktywny=Nie` + email |
| POST `/users/:id/reactivate` | + email |
| POST `/users/:id/reset-password` | Body `{mode:'generate'}` или `{mode:'custom', password}`. Ставит `mustChangePassword=true` + `passwordChangedAt`, отзывает refresh-токены юзера, возвращает `temporaryPassword`. (Email-доставка — Phase 9.) |
| DELETE `/users/:id` | Soft delete |

### Carriers — `/api/v1/carriers`

| Method + Path | GAS | Роль |
|---|---|---|
| GET `/carriers` | `getCarriersList` | admin (все), opiekun (свои) |
| GET `/carriers/:id` | `getCarrier` (lookup) | admin / opiekun(own) |
| POST `/carriers` | `addCarrier` / `addCarrierByOpiekun` | admin / opiekun |
| PATCH `/carriers/:id` | `updateCarrier` / `updateCarrierByOpiekun` | admin / opiekun(own) |
| POST `/carriers/:id/deactivate` | `toggleCarrierActive` (off) | admin / opiekun(own) |
| POST `/carriers/:id/reactivate` | `toggleCarrierActive` (on) | admin / opiekun(own) |
| POST `/carriers/:id/reset-password` | `resetCarrierPassword` / `resetCarrierPasswordByOpiekun` | admin / opiekun(own) |
| DELETE `/carriers/:id` | `deleteCarrierHard` | **admin only** (hard delete). Phase 3 enforcement: `@Roles('admin')` — opiekun does NOT have a soft-delete path; deactivate via `/carriers/:id/deactivate` is the opiekun-accessible alternative. |

> Один endpoint, один сервис. Различия admin/opiekun — на уровне `RolesGuard` + `OwnershipGuard`. Дублей `*ByOpiekun` нет.
>
> ⚠️ `pracownik` **не имеет доступа** ни к одному из этих эндпоинтов — это admin/opiekun-only. Legacy enforcement: `requireAdmin(callerLogin)` в `Code.gs:1318, 1991, 2070, …` (admin-функции) и `_requireOpiekun` для opiekun-вариантов. Pracownik видит только wnioski-вкладку, не Carriers.

### Vehicles — `/api/v1/vehicles`

> Роль: `admin` (все), `opiekun` (свои перевозчики), `przewoznik` (свои авто — **read-only**: GET list/detail/attachments only, никаких write). **Не `pracownik`.** Enforcement: все mutating-эндпоинты (POST/PATCH/deactivate/reactivate/DELETE) — `@Roles('admin', 'opiekun')`; GET-эндпоинты — `@Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik')`. Перевозчик флоту не редактирует — carrier-панель render-ит её read-only (consistent с trailers). См. `apps/api/src/modules/vehicles/vehicles.controller.ts`.

| Method + Path | GAS | Роль |
|---|---|---|
| GET `/vehicles?carrierId=...` | `getVehiclesForCarrier` / `getMyVehicles` (carrier) / `getAllVehiclesForAdmin` | admin / opiekun / planista / dyspozytor / przewoznik |
| GET `/vehicles/:id` | `getVehicleDetails` | admin / opiekun / planista / dyspozytor / przewoznik |
| POST `/vehicles` | `addVehicle` / `addVehicleByOpiekun` | admin / opiekun — **`multipart/form-data`** |
| PATCH `/vehicles/:id` | `updateVehicleDetails` / `updateVehicleDetailsByOpiekun` | admin / opiekun — **`multipart/form-data`** |
| POST `/vehicles/:id/deactivate` | `toggleVehicleActive` (off) | admin / opiekun |
| POST `/vehicles/:id/reactivate` | (on) | admin / opiekun |
| DELETE `/vehicles/:id` | `removeVehicle` / `removeVehicleByOpiekun` | admin / opiekun |
| GET `/vehicles/active?login=...` | `getActiveVehiclesForLogin` (для carrier-login dropdown) | — |
| GET `/vehicles/:id/attachments` | (новое) — список umowa/cabotage-вложений | admin / opiekun / planista / dyspozytor / przewoznik |
| GET `/vehicles/:id/attachments/:attachmentId/download` | (новое) — proxy-стрим файла из MinIO | admin / opiekun / planista / dyspozytor / przewoznik |
| DELETE `/vehicles/:id/attachments/:attachmentId` | (новое) — soft-delete вложения | admin / opiekun / przewoznik |

#### Vehicle-modal: umowa / cabotage attachments + multipart contract

Поля `Vehicle.contract` (Umowa-boolean) больше нет — скан umowa теперь
файл, хранится в MinIO как строка `VehicleAttachment` (категория `contract`).
Поэтому `POST /vehicles` и `PATCH /vehicles/:id` принимают
**`multipart/form-data`**, а не JSON.

**Multipart-поля:**

- **Файловые части — по одному полю на категорию, каждое принимает несколько
  файлов** (`maxCount = 10`):
  - `contract`    → категория `contract` (скан umowa)
  - `cabotageDe`  → категория `cabotage_de`
  - `cabotageFr`  → категория `cabotage_fr`
- **Скалярные части** — все поля `CreateVehicleSchema` / `UpdateVehicleSchema`
  как текстовые части. Так как multipart передаёт всё строками, сервер
  коэрсит их перед Zod-валидацией:
  - boolean → строки `'true'` / `'false'`;
  - number  → числовые строки (`'2024'`, `'0.85'`);
  - массивы (`wasteCountries`, `removeAttachmentIds`) →
    **JSON-encoded строка**, напр. `wasteCountries='["DE","FR"]'`;
  - пустая часть = поле не передано (применяются `.optional()` / `.default()`).
- **`removeAttachmentIds`** (только PATCH) — JSON-массив UUID существующих
  вложений, которые надо удалить (soft-delete) в рамках этого запроса.

**Валидация файлов:** допустимы только `image/jpeg`, `image/png`,
`image/webp`, `application/pdf`; ≤ 10 MB на файл; нарушение → **422**.

**Правило обязательных вложений (service-layer, не Zod — файлы приходят
отдельными частями):**

- ≥ 1 вложение категории `contract` (umowa) **ВСЕГДА обязательно на create**
  (безусловно — больше не зависит от `gps`/чего-либо; umowa у всех машин);
- `cabotageDe=true` ⇒ ≥ 1 вложение категории `cabotage_de`;
- `cabotageFr=true` ⇒ ≥ 1 вложение категории `cabotage_fr`.

На `POST` правило проверяется **до любых записей** (422, multi-violation
envelope `{ violations: string[] }`, если отсутствует обязательное вложение —
как минимум `contract`). На `PATCH` правило применяется к итоговому набору
вложений после апдейта (существующие не-удалённые + новозагруженные − удалённые),
но безусловное требование `contract` относится только к моменту создания —
PATCH не вводит новую блокировку для существующих машин.

**Create-flow:** проверить правило → создать Vehicle → загрузить файлы в
MinIO по ключу `vehicles/<vehicleId>/<category>/<randomFileId>.<ext>` →
вставить строки `VehicleAttachment`. При любой пост-ошибке загруженные
объекты MinIO и строка Vehicle откатываются (all-or-nothing).

**Update-flow:** новые файлы загружаются + вставляются; `removeAttachmentIds`
soft-delete'ятся (объект в MinIO остаётся).

**Attachment-endpoints:**

- `GET /vehicles/:id/attachments` → `VehicleAttachmentDto[]` (без `storageKey`
  — это внутренний ключ). Те же read-роли/ownership, что у `GET /vehicles/:id`.
- `GET /vehicles/:id/attachments/:attachmentId/download` → proxy-стрим байтов
  из MinIO через API (`Content-Type`, `Content-Disposition: inline;
  filename=...`). MinIO **не** публично доступен — pre-signed URL не отдаём.
  Те же read-роли/ownership, что у `GET /vehicles/:id`.
- `DELETE /vehicles/:id/attachments/:attachmentId` → soft-delete строки
  (объект MinIO не трогаем). Те же write-роли, что у `PATCH /vehicles`.

**EURO-норма:** `Vehicle.euro` ограничена `{ V, VI }` — legacy `III`/`IV`
удалены. **`destinationCountries`** — массив ISO-3166-1 alpha-2 кодов,
ограниченный набором EU-27 + GB + NO + CH (`EUROPEAN_COUNTRY_CODES` в
`@magguarantee/shared`).

**Dispatch team (Phase 11).** Поле `dispatcherId` удалено — машина теперь
ссылается на команду через `dispatchTeamId` (nullable). В create/update —
скалярное поле `dispatchTeamId` (UUID, optional/nullable); сервис требует, чтобы
команда **существовала и была активна** (иначе 422). В response:
- полный `VehicleDto` (admin/opiekun) несёт `dispatchTeamId: string | null` и
  `dispatchTeam: { id, code, name, active, dispatchers: [{ id, name, login }] } | null`;
- slim `VehicleListItem` / fleet-list-item (дисп-панель, `FleetVehicleDetailModal`)
  additive-расширены тем же `dispatchTeam` (non-sensitive — без ставок, без нового
  эндпоинта).

**Scope диспетчера (Phase 11).** `GET /vehicles` (list), `GET /vehicles/km-report`,
`GET /fleet/dyspozytor`, `GET /delegations`, GPS — для роли `dyspozytor`
скопируются по **команде** (`Vehicle.dispatchTeamId === AuthUser.teamId`), а не
по `user.sub`. Диспетчер **без команды** видит пустой набор.

### Drivers — `/api/v1/drivers`

> Роль: `admin` (все), `opiekun` (свои), `przewoznik` (свои — **read-only**: GET list/detail only, никаких write). **Не `pracownik`.** Enforcement: все mutating-эндпоинты (POST/PATCH/deactivate/reactivate/DELETE) — `@Roles('admin', 'opiekun')`; GET-эндпоинты — `@Roles('admin', 'opiekun', 'przewoznik')`. Перевозчик водителей не редактирует — carrier-панель render-ит их read-only (consistent с trailers). См. `apps/api/src/modules/drivers/drivers.controller.ts`.

| Method + Path | GAS | Роль |
|---|---|---|
| GET `/drivers?carrierId=...` | `getDriversList` / `getMyDrivers` | admin / opiekun / przewoznik |
| GET `/drivers/:id` | `getDriverDetails` | admin / opiekun / przewoznik |
| POST `/drivers` | `addDriver` / `addDriverByOpiekun` | admin / opiekun |
| PATCH `/drivers/:id` | `updateDriver` / `updateDriverByOpiekun` | admin / opiekun |
| POST `/drivers/:id/deactivate` | `toggleDriverActive` | admin / opiekun |
| POST `/drivers/:id/reactivate` | | admin / opiekun |
| DELETE `/drivers/:id` | `removeDriver` / `removeDriverByOpiekun` | admin / opiekun |

### Trailers — `/api/v1/trailers`

> Роль: `admin` (все), `opiekun` (свои), `przewoznik` (свои — **read-only**: только GET list/detail, никаких write). **Не `pracownik`.** Enforcement: все mutating-эндпоинты (POST/PATCH/deactivate/reactivate/DELETE) — `@Roles('admin', 'opiekun')`; GET-эндпоинты — `@Roles('admin', 'opiekun', 'przewoznik')`. Перевозчик прицепы не редактирует — carrier-панель render-ит их read-only (consistent с vehicles). См. `apps/api/src/modules/trailers/trailers.controller.ts`.

| Method + Path | GAS |
|---|---|
| GET `/trailers?carrierId=...` | `getNaczepyList` / `getMyTrailers` |
| GET `/trailers/:id` | `getNaczepaDetails` |
| POST `/trailers` | `addNaczepa` / `addMyTrailer` / `addNaczepaByOpiekun` |
| PATCH `/trailers/:id` | `updateNaczepa` / `updateMyTrailer` / `updateNaczepaByOpiekun` |
| POST `/trailers/:id/deactivate` | `toggleNaczepaActive` / `toggleMyTrailerActive` |
| POST `/trailers/:id/reactivate` | |
| DELETE `/trailers/:id` | `removeNaczepa` / `removeMyTrailer` / `removeNaczepaByOpiekun` |

### Trailer types — `/api/v1/trailer-types`

> Роль: write — `admin` only; read — все employee-роли + carrier (для dropdown-а). **Pracownik** может только read через `/lookups/trailer-types`, не write.

| Method + Path | GAS |
|---|---|
| GET `/trailer-types` | `getNaczepyTypyList` |
| POST `/trailer-types` | `addNaczepaTyp` |
| PATCH `/trailer-types/:id` | (новое) |
| POST `/trailer-types/:id/deactivate` | `toggleNaczepaTypActive` |

### Teams (admin only) — `/api/v1/teams`

> **Phase 11.** A `Team` is a numbered dispatch team (code like `1.1.13`) that a vehicle is assigned to (`Vehicle.dispatchTeamId`). It replaces the legacy single `Vehicle.dispatcherId` FK — a vehicle now belongs to a whole team, and every dispatcher in the team (usually 2 by shift) sees it through team membership. The catalog is an explicit replacement for the external "raport DAF" Excel.
>
> `Team` uses an `active` flag (NOT a `deletedAt` soft-delete). All endpoints are **admin-only** (`@Roles('admin')` + `RolesGuard`). Every mutating endpoint is audited (`@Audit`).

| Method + Path | Назначение | Роль |
|---|---|---|
| GET `/teams?active=&q=` | Список команд с составом (`dispatchers: [{ id, name, login }]`) + `vehicleCount` | admin |
| GET `/teams/:id` | Деталь команды | admin |
| POST `/teams` | Создать. Body `{ code, name?, active?, dispatcherIds?[] }`. `code` валидируется регексом `^\d+\.\d+\.\d+$` (ровно 3 числовых сегмента); unique → **409**. Каждый `dispatcherId` должен быть активным `dyspozytor` (иначе **422**). Назначение диспетчера, уже состоящего в другой команде, — **молчаливый перенос** (просто перетирает `User.teamId`), без 422. | admin |
| PATCH `/teams/:id` | Обновить `{ code?, name?, active?, dispatcherIds?[] }`. Если `dispatcherIds` присутствует — **полная замена** состава (не указанные открепляются, указанные прикрепляются). Дубликат `code` → **409**. | admin |
| POST `/teams/:id/deactivate` | `active=false` (вывод из эксплуатации команды, на которую ссылаются машины/диспетчеры). 409 если уже неактивна. | admin |
| POST `/teams/:id/reactivate` | `active=true`. 409 если уже активна. | admin |
| DELETE `/teams/:id` | **Hard-delete, защищённый**: **409**, если на команду ссылаются машины (`Vehicle.dispatchTeamId`) ИЛИ диспетчеры (`User.teamId`). Для вывода из эксплуатации использовать `deactivate`. Без `reason`-body. | admin |

**`teamId` в JWT.** Не кладётся в JWT-payload — резолвится из БД в `JwtAccessStrategy.validate` (как `mustChangePassword`) и кладётся в `AuthUser.teamId`. Драйвит scope диспетчера в fleet / km-report / delegations / GPS. **Диспетчер без `teamId` → пустой набор** (явно, sentinel `__no_dispatch_team__` → 0 строк; никогда не «все»).

**Team DTO** (admin CRUD): `{ id, code, name, active, dispatchers: [{ id, name, login }], vehicleCount, createdAt, updatedAt }`.

### Claims (wnioski) — `/api/v1/claims`

> Это **основной scope** для роли `pracownik`. Pracownik видит и редактирует все claims (как admin), но не имеет CRUD по carrier/vehicle/driver/trailer.

| Method + Path | GAS | Роль |
|---|---|---|
| GET `/claims` | `getAllClaims` (admin/pracownik — все) / `getAllClaims` с opiekun-scope (свои перевозчики) / `getClaimsForCarrier` (carrier — свои) — единый endpoint, фильтрация по роли в сервисе | admin / pracownik / opiekun(scope) / przewoznik(scope) |
| GET `/claims/:nrZgl` | `buildClaimObj` | admin / pracownik / opiekun(own carrier) / przewoznik(own) |
| GET `/claims/dashboard` | `getDashboardStats` | admin / pracownik (полный) / opiekun (scope: свои перевозчики) |
| POST `/claims` | `submitNewClaim` | przewoznik |
| PATCH `/claims/:nrZgl` | `updateClaimFull` — корректировки + decision (status, korekta godzin, nrZlecenia, kwotaMaksima, reklamacjaZatwKwota). **Phase 4 — controller-stub в Phase 3 (throws InternalServerError).** Body — discriminated union `UpdateClaimSchema` в `@magguarantee/shared/schemas/claims.ts` (синтетические литералы `REKLAMACJA_ZAAKCEPTOWANO`/`REKLAMACJA_ODRZUCONO` как `targetStatus` дискриминатор; service переводит обратно в underlying `ZAAKCEPTOWANO`/`ODRZUCONO` перед persistence — это нужно чтобы UI мог различать «accept reklamacja» от «accept fresh claim», но БД хранит чистый enum). State-machine — `apps/api/src/modules/claims/claim-state-machine.ts`, 9 легальных рёбер, 422 на любой illegal transition. | **admin / pracownik** |
| POST `/claims/:nrZgl/reklamacja` | `submitReklamacja` | przewoznik (own claim) |
| POST `/claims/:nrZgl/preview` | (новое) — server-side расчёт live preview, заменяет client-side `carrierPreviewCalc` | любой залогиненный (помогает заполнить форму) |
| POST `/claims/:nrZgl/auth-screenshot` | `uploadAuthScreenshot` (multipart, S3) — pracownik/admin/opiekun (legacy: `requireEmployee`) | admin / pracownik / opiekun |
| POST `/claims/:nrZgl/request-authorization` | `sendAuthorizationRequest` — отсылает email Maksimu, помечает статус `OCZEKUJE_NA_AUTORYZACJĘ` | admin / pracownik / opiekun |
| GET `/claims/raw?nrZgl=...` | `getRawClaims` (admin diagnostics) | admin |

### Delegations (выезды) — `/api/v1/delegations`

| Method + Path | GAS |
|---|---|
| GET `/delegations` | Единый endpoint, фильтрация по роли. `eksport`/`weryfikator`: active-board `{zgloszony, gotowy, w_trasie}` + `?includeHistory=true`. carrier→свои, planista→свой `plannerId`, dyspozytor→своя team. (REWORK 2026-06-20: `weryfikator` снова видит выезды — §0″.) |
| GET `/delegations/:id` | (lookup) — incl. `weryfikator` |
| POST `/delegations` | `addDelegacja` (carrier → `zgloszony`) |
| POST `/delegations/:id/ready` | **NEW** — `eksport \| admin`: `zgloszony→gotowy` (+ откат `gotowy→zgloszony`, пока не `w_trasie`). Audit `delegation.markReady`. |
| POST `/delegations/:id/in-transit` | **NEW** — `weryfikator \| admin`: `gotowy→w_trasie`. Audit `delegation.markInTransit`. |
| POST `/delegations/:id/returned` | **NEW** — `weryfikator \| admin`: `w_trasie→zjechal`, body `{ actualReturnAt: date }`. Txn: `vehicle.lastDroveAt = max(...)` + авто-пересчёт связанного wniosek (границы — §0″). Audit `delegation.markReturned`. |
| POST `/delegations/:id/cancel` | carrier (свои `zgloszony`) **+ admin (любой активный)** → `anulowany`. |

> **Side-effect (Google Chat):** контракт `POST /delegations` не меняется. После
> создания выезда `add()` асинхронно постит 4-строчную нотификацию в Google Chat
> space (очередь `chat-notify-wyjazd`, off the request path — никогда не ломает и
> не задерживает ответ). См. [16-jobs-and-integrations.md#google-chat-notifications](16-jobs-and-integrations.md#google-chat-notifications).

> ✅ **REWORK 2026-06-20 (#4):** статусы выезда снова операционные — `in-transit`/`returned` восстановлены (у `weryfikator`) + новый `ready` (`eksport` → `gotowy`). `weryfikator` ведёт **И** km-доску машин (ниже), **И** статусы выездов (отдельное окно). `Claim.delegationId` введён — `POST /claims`/`/claims/preview` принимают `delegationId`, период и `mileage` берутся из выезда (гейт статуса `{w_trasie, zjechal}`; из `w_trasie` — soft-warning). Полная спека: [`20-phase-7-eksport-weryfikator.md` §0″](20-phase-7-eksport-weryfikator.md). (Прежнее «удалено 2026-06-10 #2 / мёртвый груз» — отменено.)

### Vehicle daily-km (weryfikator) — `/api/v1/vehicles`

> ⚠️ **REWORK (2026-06-12 #3):** заменяет прежнюю route-status доску («в трассе / съехал»). Полная спека: [`20-phase-7-eksport-weryfikator.md` §0′](20-phase-7-eksport-weryfikator.md). `weryfikator` ежедневно проставляет **дневной км** каждой машины. Хранение — `vehicle_daily_km` (`@@unique[vehicleId, date]`, upsert). Производный статус машины (`w_ruchu`/`nie_jezdzi`/`nieznany`) считается на чтении по последней по дате записи периода. Связи `Claim ↔ Delegation` нет; пробег в `Claim` = `Σ VehicleDailyKm.km (state=drove)` за период.

| Method + Path | Назначение | Роли |
|---|---|---|
| GET `/vehicles/km-board?week=YYYY-Www` (или `?from=<пн>`) | Все активные машины + `carrier` + `opiekun` (= `carrier.opiekun`) + `planner` + `sideNumber`/`plateNumber` + `createdAt` (ISO datetime — нижняя граница месяца для модалки месячного km) + 7 ячеек-дней (`state`/`km`/`notes`) + `Σ km` недели + производный `motionStatus`. Окно — Monday-anchored 7 дней | weryfikator / admin |
| PUT `/vehicles/:id/daily-km` | Body `{ date, state: 'drove'\|'idle', km?, notes? }`. **Upsert** по (vehicleId, date), `source=manual`, `notedById=caller`. Инварианты: `drove`⇒`km>0`; `idle`⇒`km=null`. При `drove` → `vehicle.lastDroveAt = max(lastDroveAt, date)` в той же транзакции. Audit `vehicle.setDailyKm` | weryfikator / admin |
| GET `/vehicles/:id/daily-km?from&to` | История по машине (newest-first): `date`, `state`, `km`, `source` (manual\|gps), `notedBy`, `notes`. Окно `[from, to]` (date-only, inclusive) опционально. Модалка «Historia» **и** km-календарь в read-only модалке выезда. Read фанаутится по роли как `GET /vehicles/:id` (ownership-гварды short-circuit для не-`opiekun`/не-`przewoznik`): weryfikator/admin/planista/dyspozytor/eksport — любая машина; opiekun — машины подопечных; przewoznik — свои | weryfikator / admin / planista / dyspozytor / przewoznik / opiekun / eksport |
| GET `/vehicles/km-report?week=...` | Read-only недельный рапорт. Та же сетка, что km-board. Scoping (server-side, из JWT): planista→`plannerId`, dyspozytor→`dispatcherId`, eksport/admin/weryfikator→все, **przewoznik→своя машины (свой carrier)**, **opiekun→машины подопечных carrier'ов**. Машины: planista/dyspozytor/eksport/admin/weryfikator — **только с drove-днями** периода; przewoznik/opiekun — **все приписанные машины** (вкл. простаивавшие, пустые ячейки). Нет новых query-параметров — поведение выводится из роли | planista / dyspozytor / eksport / admin / weryfikator / przewoznik / opiekun |

**`POST /delegations` body — required fields** (post-migration `20260518113943_delegation_required_fields_and_date_only`):

| Field | Type | Notes |
|---|---|---|
| `vehicleId` | UUID | required |
| `trailerId` | UUID | required (was optional pre-migration) |
| `driverId` | UUID | required (was optional pre-migration) |
| `departureAt` | ISO datetime | required; must not be in the past — server rejects with 422 `DEPARTURE_IN_PAST` when `departureAt < now − 10 min` (full-timestamp granularity, with a ~10-min grace window for form fill-in — see `DEPARTURE_PAST_GRACE_MS`); bypassable via the `ALLOW_PAST_DEPARTURE` env flag (testing only) |
| `departureCountry` | enum (`EU_VAT_COUNTRY_CODES`, VIES dialect — Greece = `EL`) | required |
| `departurePostalCode` | string ≤ 16 chars, per-country format | required, validated against `EU_POSTAL_CODES` (see `packages/shared/src/constants/eu-postal-codes.ts`) |
| `plannedReturnAt` | ISO date `YYYY-MM-DD` (date-only) | required; must be on or after the date portion of `departureAt` |
| `returnCountry` | enum (same as `departureCountry`) | required |
| `returnPostalCode` | string ≤ 16 chars, per-country format | required, same validation rule |
| `comment` | string ≤ 2000 | optional |

DB CHECK enforces `returnCountry` length 2..8 (covers `EL`) and `returnPostalCode` ≤ 16; per-country format is enforced at the Zod layer. The legacy `delegation_returned_complete` CHECK has been dropped — `status='zjechal'` ⇒ `actualReturnAt` is now enforced by the api when the weryfikator triggers the state transition.

### Fleet aggregates — `/api/v1/fleet`

Агрегаты для главных экранов (вместо разрозненных `getXFleet` функций).

| Method + Path | GAS |
|---|---|
| GET `/fleet/my` | `getMyFleet` (carrier) |
| GET `/fleet/opiekun` | `getOpiekunFleet` (opiekun) |
| GET `/fleet/planista` | `getPlanistaFleet` |
| GET `/fleet/dyspozytor` | `getDyspozytorFleet` |
| GET `/fleet/eksport` | `getEksportData` |
| GET `/fleet/weryfikator` | `getWeryfikatorData` |

### Alerts (истекающие документы) — `/api/v1/alerts`

> 🗓️ **PLANNED (Sub-slice 5.2).** Расширяемый alert-движок: предупреждения о документах со сроком, которые истекают или уже истекли. Отдельный модуль `apps/api/src/modules/alerts/` на паттерне **реестра провайдеров** — каждый источник алерта = одна декларативная запись (`AlertProvider`); добавление нового типа = +1 провайдер в `ALERT_PROVIDERS` (+ поле-дата в сущность, если её ещё нет). Движок/контроллер/репозиторий при этом не меняются.
>
> **Scope сейчас — только документы с уже существующим полем-датой** (3 провайдера): `Carrier.insuranceExpiry` (OCP), `Carrier.licenseExpiry` (лицензия перевозчика), `Driver.licenseExpiry` (права водителя). Документы без даты (ADR, каботаж, техосмотр, паспорт, umowa, KREPTD) — НЕ обрабатываются (нет поля-даты); архитектура делает их добавление тривиальным позже.

| Method + Path | Назначение | Роль |
|---|---|---|
| GET `/alerts?severity=&type=` | Список алертов по истекающим документам, scoped. opiekun → свои (Carrier `opiekunId` / Driver через `carrier.opiekunId`), admin → все. **pracownik — 403.** Read-only (нет мутаций, нет `@Audit`). | admin / opiekun |

**Severity (1 порог из AppConfig `document_expiry_warn_days`, дефолт 30):** алерт включается если документ уже истёк ИЛИ истекает в течение N дней. `severity = 'expired'` (`daysToExpiry < 0`) \| `'warning'` (`0 ≤ daysToExpiry ≤ N`). Сортировка: `expired` первыми, затем по возрастанию `daysToExpiry`. Неактивные (`active=false`) и soft-deleted сущности исключаются.

**AlertItem DTO:** `{ type, documentCategory: 'ocp'|'carrier_license'|'driver_license', severity: 'expired'|'warning', subjectLabel (имя перевозчика/водителя), carrierId, carrierName, expiresOn (ISO date 'YYYY-MM-DD'), daysToExpiry (int, <0 = просрочено) }`. **Response:** `{ items: AlertItem[], meta: { warnDays, total } }`. Shared-схема — `packages/shared/src/schemas/alerts.ts`.

**Точки расширения (заложены, не в v1):** dismiss/snooze (будущая таблица `AlertDismissal`, `@@unique[userId, type, subjectId]`) — сейчас `_filterDismissed` no-op; пагинации нет (объём алертов опекуна мал).

### Limits — `/api/v1/limits`

| Method + Path | GAS |
|---|---|
| GET `/limits?year=2026` | `getLimityKm` |
| PUT `/limits` | (новое) — bulk update от admin (вместо ручного редактирования) |

### Lookups (для dropdown-ов) — `/api/v1/lookups`

| Method + Path | GAS |
|---|---|
| GET `/lookups/dyspozytor` | `getDyspozytorList` (нужен для назначения диспетчеров в команды) |
| GET `/lookups/planisci` | `getPlannerList` |
| GET `/lookups/opiekuni` | `getOpiekunList` |
| GET `/lookups/trailer-types` | `getNaczepyTypyList` (alias) |
| GET `/lookups/teams` | (Phase 11) — команды с составом для дропдауна формы машины. Отдаёт `[{ id, code, name, active, dispatchers: [{ id, name, login, active }] }]` (включает `active` диспетчера — веб рисует preview состава без N+1). Read-only, любой залогиненный (состав команды non-sensitive — без ставок). |

### External integrations — `/api/v1/integrations`

| Method + Path | GAS | Внешний API |
|---|---|---|
| GET `/integrations/vies/:country/:vat` | `viesLookup` | VIES |
| GET `/integrations/whitelist?nip=...&account=...` | `whiteListCheckAccount` | Biała Lista — проверка пары NIP + счёт |
| GET `/integrations/whitelist/search?nip=...` | `whiteListSearchByNip` | Biała Lista — auto-fill компании по NIP (`{ found: false }` для не-польских NIP, не ошибка) |
| GET `/integrations/inspection?vin=...` | `inspectionCheckLink` | info-car.pl URL builder |
| GET `/integrations/gps/positions` | — (новое) | GPS tracker (TBD — см. [16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api](16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api)) |
| GET `/integrations/gps/positions/:vehicleId` | — | GPS tracker (TBD) |
| GET `/integrations/gps/trips/:vehicleId?from=...&to=...` | — | GPS tracker (Phase 11+) |

> **GPS endpoints** в Phase 2 поднимаются как скелетон с mock-провайдером — реальные вызовы добавляются после получения credentials от MAGTRANS. Контракт ответа стабилен: `{ position, stale: boolean, lastFetchedAt }` для одиночного, `{ items, stale, lastFetchedAt }` для списка. Mock-провайдер возвращает детерминированные позиции от `plateNumber`, чтобы UI можно было разрабатывать параллельно. Ownership-фильтрация: carrier видит свои авто, opiekun — своих карьеров, planista/dyspozytor — закреплённых, admin — все. Если `Vehicle.gps = false` — 404.

### Audit — `/api/v1/audit` (admin)

| Method + Path | GAS |
|---|---|
| GET `/audit?targetType=...&targetKey=...` | (нет — лист открывается напрямую сейчас) |

### Diagnostics (admin only) — `/api/v1/diagnostics`

| Method + Path | GAS |
|---|---|
| GET `/diagnostics/mails` | `diagnostykaMaili` |
| POST `/diagnostics/mails/resend/:nrZgl` | `ponowWyslijEmail` |
| GET `/diagnostics/claims` | `DIAGNOSTYKA_WNIOSKÓW` |
| GET `/diagnostics/dashboard` | `getDashboardStats` |
| GET `/diagnostics/db` | (новое) — health-check Prisma + сводка по таблицам |

### Health / Ready — без префикса `/api/v1`

| Method + Path | Назначение |
|---|---|
| GET `/health` | Liveness (always 200 если процесс жив) |
| GET `/ready` | Readiness (db + redis ping) |

## Ключевые DTO

### Login flow

```ts
// POST /auth/login
type LoginRequest = { login: string; password: string };
type LoginResponse = { sessionToken: string; maskedEmail: string };  // 200
// или 401 problem-details

// POST /auth/verify-code
type VerifyCodeRequest = { sessionToken: string; code: string };
type VerifyCodeResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
};
type UserDto = {
  id: string;
  login: string;
  email: string;
  role: Role;
  name: string;
  // только для carrier:
  carrierId?: string;
  vehicles?: { id: string; plateNumber: string }[];
  // мульти-роль (если у carrier есть запись в OPIEKUN):
  alternateRoles?: Role[];
};
```

### Submit claim

```ts
// POST /claims — Phase 7 §0″ finish: carrier sends ONLY the outing +
// time-window. Everything else is server-derived from the linked delegation.
type SubmitClaimRequest = {
  delegationId: string;    // chosen outing (w_trasie | zjechal, no claim yet)
  timeFrom: string;        // HH:MM
  timeTo: string;          // HH:MM
  comment?: string;
  attachmentIds?: string[]; // pre-uploaded attachment UUIDs (max 20)
};
// SERVER-DERIVED from the delegation (NOT in the body):
//   • vehicleId / trailerId / driverId — from Delegation.vehicleId / trailerId
//     / driverId; `vehiclePlateSnapshot` from Delegation.vehicle.plateNumber.
//     (Claim persists only vehicleId + vehiclePlateSnapshot; trailer/driver are
//     carried by the linked Delegation, not duplicated onto Claim.)
//   • dateStart = date(departureAt), dateEnd = actualReturnAt ?? plannedReturnAt.
//   • mileage = Σ VehicleDailyKm.km (state=drove) over [dateStart, dateEnd] of
//     the delegation's vehicle. NO carrier override (was optional pre-§0″).
//   • amountRequested = km-calc paymentEur (rounded 2dp).
//   • hoursAdjusted — verifier-only (PATCH); submit always persists 0.
// OWNERSHIP: @CarrierOwns('delegationId','body','delegationId') — the outing
// must belong to the authenticated carrier (delegation.carrierId === carrier).

// 422 problem-details для POST /claims несёт мульти-violation envelope:
// {
//   type: "/problems/business-rule",
//   title: "Unprocessable Entity",
//   status: 422,
//   detail: "<человеческое сообщение или сводка>",
//   violations: string[],          // полный список нарушений на pl-PL
//   extensions?: {                 // опционально: машинные поля
//     nextAllowedAt?: string;      // ISO timestamp для vehicle_cooldown
//   }
// }
//
// Известные коды violations (single-violation responses кладут текст в
// `violations[0]`, multi-violation — каждый отдельной строкой):
//
//   • `duration_insufficient` — окно подачи не пройдено: ни календарный span
//     ≥ `carrier_period_span_min_days`, ни округлённые часы простоя
//     > `carrier_rounded_days_override_threshold`. Источник истины —
//     `canSubmitByDuration()` из `@magguarantee/shared`.
//   • `vehicle_cooldown` — на том же `vehicleId` уже есть claim в статусе
//     ≠ ODRZUCONO моложе `carrier_vehicle_cooldown_days * 24h` (граница
//     inclusive: ровно 144h проходит). В `extensions.nextAllowedAt` —
//     ISO timestamp, начиная с которого можно подать снова. Источник —
//     `cooldownCheck()` из `@magguarantee/shared`. ODRZUCONO-claims
//     игнорируются: после отказа карьер может подать заново сразу.
//
// Legacy `min_days_to_submit` AppConfig **больше не читается** сервисом
// (заменён парой `carrier_period_span_min_days` +
// `carrier_rounded_days_override_threshold`). Строка в seed оставлена
// для back-compat — никакого эффекта не оказывает.
//
// Legacy date-range overlap-блок (`findOverlapping`) **удалён** —
// заменён cooldown'ом по `(vehicleId, createdAt)`.
type ClaimDto = {
  id: string;
  nrZgl: string;
  status: ClaimStatus;
  carrier: { id: string; name: string };
  vehicle: { id: string; plateNumber: string };
  dateStart: string;
  dateEnd: string;
  // ...все поля Claim
  // Hours-adjustment split: на storage-уровне колонка `hoursAdjusted` (boolean,
  // legacy) распилена на два Decimal(5,2)?: `origHoursAdjusted` — immutable
  // carrier-snapshot (set-once at submit, нельзя править после), и
  // `hoursAdjustedValue` — currently applied значение (драйвит km-calc;
  // верификатор PATCH правит только его). При submit оба равны: response
  // выдаёт `origHoursAdjusted: 5.5, hoursAdjustedValue: 5.5`. После PATCH с
  // корректировкой — `origHoursAdjusted: 5.5, hoursAdjustedValue: 8` (snapshot
  // зафиксирован, applied изменён). `null` = нет данных; `0` = карьер явно
  // ввёл ноль.
  origHoursAdjusted: number | null;
  hoursAdjustedValue: number | null;
  breakdown: KmCalcBreakdown;
};

// POST /claims/preview (new-claim form) and POST /claims/:nrZgl/preview
// (reklamacja / verifier inspection). Two callers, two shapes:
//   • new-claim: { delegationId, timeFrom?, timeTo?, hoursAdjusted? } — the
//     api derives period + vehicle/trailer/driver + mileage from the outing.
//   • existing/verifier: { vehicleId?, dateStart?, dateEnd?, timeFrom?, timeTo?,
//     hoursAdjusted? } — caller-supplied dates drive the math; the existing
//     claim already carries vehicle/trailer/driver context.
// NO `mileage` in the body (Phase 7 §0″ finish — always the daily-km sum).
type PreviewRequest = {
  delegationId?: string;   // new-claim path → derive everything from the outing
  vehicleId?: string;      // existing/verifier path → vehicle for the km sum
  dateStart?: string;      // existing/verifier path (omit on the delegation path)
  dateEnd?: string;
  timeFrom?: string;       // HH:MM
  timeTo?: string;
  hoursAdjusted?: number;  // verifier inspection only; default 0
};
type PreviewResponse = {
  mileage: number;            // Σ VehicleDailyKm.km (state=drove) over the period
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  breakdown: KmCalcBreakdown;
  // Present ONLY on the delegation-derived (new-claim) path, so the carrier
  // form can render the read-only period + vehicle/trailer/driver:
  dateStart?: string;         // derived from the outing
  dateEnd?: string;           // derived from the outing
  delegationWarning?: 'NOT_YET_RETURNED'; // soft warn when outing still w_trasie
  delegationContext?: {       // read-only vehicle/trailer/driver from the outing
    vehicleId: string; vehiclePlate: string;
    trailerId: string; trailerPlate: string | null;
    driverId: string; driverName: string | null;
  };
};

// Источник истины формы `KmCalcBreakdown` — `KmCalcBreakdownSchema` в
// `packages/shared/src/schemas/claims.ts`. Высокоуровневая форма:
// {
//   totalDays: number,         // зачтённые рабочие дни (после Korekta godzin)
//   rawTotalDays: number,      // сырые рабочие дни (до Korekta godzin); legacy
//                              // JSONB-строки без этого ключа бэкфилятся в
//                              // `totalDays` — UI безопасно рендерит даже до
//                              // деплоя engine-изменения.
//   kmGuaranteed: number,
//   ratePerKmEffective: number,
//   breakdown: MonthBreakdown[]
// }
// Поле `rawTotalDays` нужно UI-компоненту `<HoursReadout>` (см.
// docs/14-design-system.md §"Phase 3.1") чтобы показать "240,00 h surowych /
// 215,50 h zaliczonych".
```

### Update claim (verification)

> Phase 3 закрепил форму через **discriminated union** на поле `targetStatus`. Источник истины — `packages/shared/src/schemas/claims.ts` (`UpdateClaimSchema`). PATCH endpoint — Phase 4 (в Phase 3 — controller-stub).

```ts
// PATCH /claims/:nrZgl — body shape (упрощённо)
// Опциональные correction-поля (`dateStart`, `dateEnd`, `timeFrom`, `timeTo`,
// `mileage`, `hoursAdjusted`) присутствуют в трёх ветках: `ZAAKCEPTOWANO`,
// `OCZEKUJE_NA_AUTORYZACJE`, `REKLAMACJA_ZAAKCEPTOWANO` — позволяют
// верификатору поправить ввод карьера перед фиксацией решения. На wire-
// уровне `hoursAdjusted` остаётся одним числом (replace-семантика); service
// маппит его на `hoursAdjustedValue` в БД, `origHoursAdjusted` НЕ трогает.
type UpdateClaimRequest =
  | { targetStatus: 'ZAAKCEPTOWANO';            /* + поля акцепта: orderNumber, orderDate, amountApproved, hoursAdjusted?, ... */ }
  | { targetStatus: 'ODRZUCONO';                /* + поля отказа: comment, ... */ }
  | { targetStatus: 'OCZEKUJE_NA_AUTORYZACJE';  /* + поля запроса авторизации, hoursAdjusted?, ... */ }
  | { targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO'; /* верификатор принял рекламацию — service переведёт в ZAAKCEPTOWANO; hoursAdjusted? разрешён */ }
  | { targetStatus: 'REKLAMACJA_ODRZUCONO';     /* верификатор отклонил рекламацию — service переведёт в ODRZUCONO */ };
```

`REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` — **synthetic wire-only литералы**, не настоящие `ClaimStatus`. UI использует их чтобы различить «accept fresh claim» от «accept reklamacja» (разные поля, разные подтверждения). Сервис translates back в underlying `ZAAKCEPTOWANO`/`ODRZUCONO` перед записью в БД — DB enum остаётся чистым. State-machine validation выполняется в `assertLegalTransition(from, to)` из `claim-state-machine.ts` после translate-back, до любых DB-операций.

## Версионирование

- В URL: `/api/v1/...` (как сейчас планируется).
- Любое **breaking** изменение → новая версия `/api/v2/...`. Старая поддерживается 3 месяца (если нужна — на этапе миграции это вряд ли потребуется).
- Не-breaking (добавление полей в response, новые опциональные поля в request) — без bump версии.

## Контракт API ↔ frontend

Source of truth — Zod-схемы в `packages/shared`. Никакого OpenAPI / Swagger не генерим (проект small-team, документация для внешних потребителей не нужна).

- DTO для каждого endpoint-а описаны как Zod-схема в `@magguarantee/shared` (`schemas/auth.ts`, `schemas/claims.ts`, …).
- `apps/api`: контроллеры используют `ZodValidationPipe`, который валидирует body/query/params по той же схеме. Типы DTO выводятся через `z.infer<typeof Schema>`.
- `apps/web`: импортирует те же схемы для React Hook Form (через `zodResolver`) и для типизации ответов TanStack Query.
- Изменение контракта = одно изменение Zod-схемы → TypeScript ломает оба приложения в местах, где старый формат больше не подходит. Это и есть проверка совместимости.

## Rate limiting

| Endpoint | Лимит |
|---|---|
| `/auth/login`, `/auth/verify-code` | 5 / минуту / IP |
| `/auth/resend-code` | 3 / 5 минут / sessionToken |
| `/integrations/vies/*` | 10 / минуту / IP (внешний API лимиты) |
| `/integrations/whitelist`, `/integrations/whitelist/search` | 10 / минуту / IP |
| `/claims/*/preview` | 30 / минуту / user |
| Остальные | 100 / минуту / user |

Реализация: `@nestjs/throttler` (`@Throttle()` декоратор + `ThrottlerGuard`).

## Idempotency

Для `POST /claims`, `POST /delegations` принимаем заголовок `Idempotency-Key: <uuid>`. Сохраняем (`{key, response}` в Redis на 24ч). Повторный запрос с тем же ключом → тот же response, без второго insert. Защищает от двойных кликов и retry клиента.

## Audit на уровне API

Все mutating endpoints автоматически логируются через `AuditInterceptor`. Сервис вызывает `@Audit('createCarrier', { targetKey: result.id })` или `@AuditTarget(req => req.params.id)` декоратор. Запись в `audit_log` идёт в той же транзакции, что и main change (через Prisma `$transaction`).

## Связь с GAS (legacy)

`Code.gs` + `index.html` — это **функциональный референс**, не работающий продакт. Никакого parallel-deployment, никакого cutover в смысле «переключить с одного на другое». После Фазы 10 (Launch — см. [17-migration-roadmap.md](17-migration-roadmap.md)) новое приложение работает само по себе. Legacy-файлы остаются в репо как историческая документация (или удаляются — решение в [18-launch-and-deployment.md](18-launch-and-deployment.md#что-делать-с-legacy-codegs--indexhtml)).
