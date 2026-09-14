# 13. REST API design

> Маппинг всех публичных GAS-функций на REST endpoints. Цель — функциональная идентичность, не побитовая копия.

## Соглашения

### Базовый префикс

Все endpoints живут под `/api/v1/`. Версия в URL, чтобы можно было ввести v2 в будущем без brick'инга клиентов.

### Аутентификация

- Все endpoints (кроме `/auth/login`, `/auth/verify-code`, `/auth/google`, `/auth/refresh`, `/health`) защищены `JwtAuthGuard`.
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

> Redirect-flow Google (`GET /auth/google` + `/auth/google/callback`) из ранних
> черновиков **не реализован**: вход построен на front-side id_token, поэтому
> callback-роута нет. Подробности — [15-auth-strategy.md](15-auth-strategy.md).

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
| POST `/auth/google` | — (новое, `@Public`) | Google SSO для сотрудников (docs/24). Принимает `{ idToken }` — подписанный `id_token` от Google Identity Services, полученный в браузере. Верифицирует подпись/`aud`/`iss`/`exp`/`email_verified`/`hd`, резолвит сотрудника в MAGSpace, выводит роль из stanowiska и заводит/синхронизирует `User`. Ответ **идентичен** `/auth/verify-code`: `{ user }` + cookies. Кода 2FA нет. Отказы — 403/503 с `extensions.code` из набора `SSO_*`. Rate 5/min/IP. Audit: строку `googleLogin` (актор — вошедший пользователь, `metadata.via` = `local` / `directory` / `directory_unavailable`) пишет сервис, **не** `@Audit` — см. [Audit на уровне API](#audit-на-уровне-api). |

> **JWT-claim `mustChangePassword`.** Access-токен несёт флаг — web-middleware декодирует `mt_access` и гейтит навигацию на `/login/change-password`, пока флаг стоит. Снимается после `change-password` (свежая пара токенов).

### Users (admin only) — `/api/v1/users`

| Method + Path | Назначение |
|---|---|
| GET `/users` | Список всех пользователей (фильтр `role=`) |
| GET `/users/:id` | Деталь |
| POST `/users` | Создать (admin) |
| PATCH `/users/:id` | Обновить. На `managedBy = magspace` менять `role`/`active` нельзя (422 `USER_MANAGED_BY_MAGSPACE`), кроме как вместе с `managedBy: 'local'`. **Переход `magspace` → `local` принудительно обнуляет `roleOverride`** (побеждает `roleOverride` в том же теле); текущая `role` остаётся и дальше принадлежит админке. |
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
| DELETE `/carriers/:id` | `deleteCarrierHard` (legacy name) | **admin only** — на деле **SOFT delete** (`deletedAt`) + ручной soft-каскад: vehicles/drivers/trailers (`deletedAt`+`active=false`) и 1:1 User (блок логина). Opiekun удалять не может — его альтернатива `/carriers/:id/deactivate`. |
| DELETE `/carriers/:id/hard` | (новое, Phase 4.4) | **admin only**, body `{reason}` → `audit_log.metadata.reason`. **Физическое** удаление carrier + его User (login освобождается). **409 `CARRIER_HAS_REFERENCES`**, если существует хоть одна строка vehicles / drivers / trailers / claims / delegations / guarantee_idle_episodes этого перевозчика — **включая soft-deleted** (FK `ON DELETE RESTRICT`, бизнес-каскадов нет — docs/12 §Soft-delete). Hard-delete только для «пустых» записей, созданных по ошибке. |
| GET `/carriers/:id/attachments` | (новое) — company docs (insurance/license/kreptd/other) | admin / opiekun(own) |
| POST `/carriers/:id/attachments` | (новое) — upload one doc — **`multipart/form-data`** (`file` + `category`). Multiple files per category allowed (carrier-level `adr` removed 2026-07). | admin / opiekun(own) |
| GET `/carriers/:id/attachments/:attachmentId/download` | (новое) — proxy-стрим файла из MinIO | admin / opiekun(own) |
| DELETE `/carriers/:id/attachments/:attachmentId` | (новое) — soft-delete + remove object | admin / opiekun(own) |
| GET `/carriers/:id/documents/overview` | (новое) — read-only aggregate for the opiekun "Dokumenty" tab: `CarrierDocumentsOverviewDto` — every live document tied to the carrier grouped by owning entity (company docs + per-vehicle files + per-trailer XL certs + per-driver ADR certs + ADR-flagged vehicles). Downloads reuse the existing per-entity download routes (the DTO carries the ids). | admin / opiekun(own) |

> Один endpoint, один сервис. Различия admin/opiekun — на уровне `RolesGuard` + `OwnershipGuard`. Дублей `*ByOpiekun` нет.
>
> **`GET /carriers/:id/documents/overview`** (opiekun "Dokumenty" tab, read-only). Guarded exactly like the carrier detail/attachments endpoints (`@Roles('admin','opiekun')` + `OpiekunOwnershipGuard` `@OpiekunOwns('id','param','carrierId')` — opiekun sees only carriers where `opiekunId = user.sub`). Response `CarrierDocumentsOverviewDto` (`packages/shared/src/schemas/carriers.ts`):
> - `carrierId: string`
> - `carrierDocs: CarrierAttachmentDto[]` — company documents (insurance/license/kreptd/other).
> - `vehicleDocs` — per category (`gps` | `agreement` | `cabotage_de_insurance`, mirroring `VehicleAttachmentCategory` order) → `{ attachmentId, fileName, size, createdAt, vehicle: { id, registration, sideNumber } }[]`. Every category key always present (empty array when none). `agreement` (porozumienie scan) IS included — core guarantee paperwork for the opiekun (see docs/14-design-system.md §5R).
> - `vehicleAdr: { vehicleId, plate, adrClasses }[]` — vehicles flagged `adr:true` (flag + classes only, **NO file**).
> - `trailerDocs: { attachmentId, fileName, size, createdAt, trailerId, registration }[]` — `cert_xl` certificates.
> - `driverDocs: { attachmentId, fileName, size, createdAt, driverId, fullName }[]` — ADR świadectwa.
>   Only live rows (`deletedAt:null`) surface; nested relation reads are filtered explicitly (soft-delete extension only auto-filters top-level ops). No new download routes — the web layer streams bytes via the existing `GET /{carriers|vehicles|trailers|drivers}/:id/attachments/:attachmentId/download`.
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
| DELETE `/vehicles/:id` | `removeVehicle` / `removeVehicleByOpiekun` | admin / opiekun — **soft** (`deletedAt`) |
| GET `/vehicles/active?login=...` | `getActiveVehiclesForLogin` (для carrier-login dropdown) | — |
| GET `/vehicles/:id/attachments` | (новое) — список porozumienie/gps/cabotage-вложений | admin / opiekun / planista / dyspozytor / przewoznik |
| GET `/vehicles/:id/attachments/:attachmentId/download` | (новое) — proxy-стрим файла из MinIO | admin / opiekun / planista / dyspozytor / przewoznik |
| DELETE `/vehicles/:id/attachments/:attachmentId` | (новое) — soft-delete строки; **MinIO-объект остаётся** (историческое исключение — у drivers/trailers/carriers явный DELETE стирает и объект) | admin / opiekun / przewoznik |

> **Удаление пойзда = только soft (vehicle-status rework, Step B).** Прежний
> физический hard-delete (`DELETE /vehicles/:id/hard`, admin-only, body
> `{reason}`, 409 `VEHICLE_HAS_REFERENCES`) **удалён**. Админское удаление теперь
> ведёт себя как обычный soft-delete всех остальных ролей (`DELETE /vehicles/:id`,
> ставит `deletedAt`, сигнатура без `reason` — actor+action уже в audit): строка и
> номер остаются в базе — их требует будущее правило «нельзя добавить тот же номер
> в течение 3 месяцев после админского удаления».
>
> **Анти-абьюз: пере-создание пойзда с plate soft-deleted-строки (`POST
> /vehicles`).** Пере-создание пойзда с той же парой `(carrierId, plateNumber)`,
> что и у **soft-deleted** (tombstone) строки, блокируется явным **409
> `VEHICLE_PLATE_SOFT_DELETED`** (машинный `code` и в top-level, и в `extensions`
> bag RFC-7807; PL-сообщение объясняет, что номер принадлежит ранее удалённому
> пойзду). Это защита от delete→recreate ради сброса «часов простоя»
> (idle-clock). **ACTIVE** дубликат по-прежнему получает generic 409 «już
> istnieje» из unique-индекса — unchanged. Уникальный индекс `(carrierId,
> plateNumber)` НЕ ослаблен; будущее правило «3 месяца» смягчит именно этот
> 409 (позволит re-add после 3 месяцев с воскрешением tombstone для сохранения
> idle-anchor), сейчас — жёсткая блокировка.

#### Vehicle-modal: porozumienie / gps / cabotage attachments (multipart)

Документы машины (скан porozumienia, umowa GPS, каботажные разрешения) —
файлы, хранятся в MinIO как строки `VehicleAttachment`. Поэтому `POST
/vehicles` и `PATCH /vehicles/:id` принимают **`multipart/form-data`**, а не
JSON. (Категория `contract` — скан «umowa» — удалена 2026-07: концепции umowa
больше нет; porozumienie (категория `agreement`) — единственный
документ-соглашение машины.)

**Multipart-поля:**

- **Файловые части — по одному полю на категорию, каждое принимает несколько
  файлов** (`maxCount = 10`):
  - `gps`                 → категория `gps`
  - `agreement`           → категория `agreement`
  - `cabotageDeInsurance` → категория `cabotage_de_insurance`
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

- `cabotageDe=true` ⇒ ≥ 1 вложение категории `cabotage_de_insurance`.

На `POST` правило проверяется **до любых записей** (422, multi-violation
envelope `{ violations: string[] }`, если отсутствует обязательное вложение).
На `PATCH` правило применяется к итоговому набору вложений после апдейта
(существующие не-удалённые + новозагруженные − удалённые).

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

**Фильтр по статусу жизненного цикла (`?lifecycleStatus=`, 2026-07-29).**
`GET /vehicles` принимает `lifecycleStatus ∈ {aktywna, stojaca, nieaktywna,
do_usuniecia, wylaczona}` — drill-down из KPI-кафелей «Moja opieka»
(docs/14 §15). Композируется со всеми существующими фильтрами (`carrierId`,
`plannerId`, `dispatchTeamId`, `q`, `active`, `cursor`, `limit`) и **не отменяет
role-scope**.

Статус — **не колонка**: `wylaczona` ≡ `active=false` (обычный SQL-путь,
cursor-пагинация без изменений), остальные четыре — read-time классификация по
делегациям + idle-якорю. Для них сервис сканирует уже role-scoped `active=true`
набор (кап **500** строк — та же посадка, что у fleet-агрегатов), классифицирует
через **тот же** батчевый delegation-lookup, что считает KPI-кафели (кафель и
список не могут разойтись), и пагинирует в памяти; `cursor` сохраняет смысл
(последний id предыдущей страницы) и резолвится по отфильтрованной
последовательности, неизвестный cursor → с начала.

Противоречивая комбинация (`active=true` + `lifecycleStatus=wylaczona` и
наоборот) — валидный запрос, который просто ничего не матчит: ответ
`{ items: [], nextCursor: null }` без запроса в БД.

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
| DELETE `/drivers/:id` | `removeDriver` / `removeDriverByOpiekun` | admin / opiekun — **soft** (`deletedAt`) |
| DELETE `/drivers/:id/hard` | (новое, Phase 4.4) | admin, body `{reason}` → audit. **Физическое** удаление (каскадом — только `driver_attachments`-метаданные). **409 `DRIVER_HAS_REFERENCES`** при любых delegations (FK RESTRICT, включая soft-deleted). |
| DELETE `/drivers/:id/attachments/:attachmentId` | (новое) — soft-delete строки + **удаление MinIO-объекта** | admin / opiekun |

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
| DELETE `/trailers/:id` | `removeNaczepa` / `removeMyTrailer` / `removeNaczepaByOpiekun` — admin/opiekun, **soft** (`deletedAt`) |
| DELETE `/trailers/:id/hard` | (новое, Phase 4.4) — admin, body `{reason}` → audit. **Физическое** удаление (каскадом — только `trailer_attachments`-метаданные). **409 `TRAILER_HAS_REFERENCES`** при любых delegations (FK RESTRICT, включая soft-deleted). |
| DELETE `/trailers/:id/attachments/:attachmentId` | (новое) — admin/opiekun, soft-delete строки + **удаление MinIO-объекта** |

### Trailer types — `/api/v1/trailer-types`

> Роль: write — `admin` only; read — все employee-роли + carrier (для dropdown-а). **Pracownik** может только read через `/lookups/trailer-types`, не write.

| Method + Path | GAS |
|---|---|
| GET `/trailer-types` | `getNaczepyTypyList` |
| POST `/trailer-types` | `addNaczepaTyp` |
| PATCH `/trailer-types/:id` | (новое) |
| POST `/trailer-types/:id/deactivate` | `toggleNaczepaTypActive` |
| DELETE `/trailer-types/:id/hard` | (новое) — admin, body `{reason}` → audit. **Физическое** удаление (у TrailerType нет `deletedAt`); **409**, если тип ещё используется прицепами (FK RESTRICT / P2003). |

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
| PATCH `/claims/:nrZgl/verification` | (новое) **«Zapisz weryfikację»** — pracownik сохраняет свои корректировки ДО любого решения. Body — `VerifyClaimSchema` (только correction-поля: `dateStart`/`dateEnd`/`timeFrom`/`timeTo`/`mileage`/`hoursAdjusted`, все optional; **пустое тело легально** = «подтверждено как есть»). Ставит `verifiedAt`/`verifiedById`, при наличии корректировок пере-считывает km-calc (тот же движок, что PATCH) и перезаписывает `paymentEur` (`origPaymentEur` при этом НЕ трогается — он и есть запрошенная сумма). **Авто-переход статуса по порогу** (единственный механизм авторизации — ручного флоу нет): если итоговая dopłata СТРОГО выше `getAuthThreshold(drivenDays)`, wniosek авто-переводится `NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJE` (и система шлёт Maksimu письмо-подтверждение, amount-aware dedup); admin re-verify в `OCZEKUJE_NA_AUTORYZACJE`, опустивший сумму под порог, авто-откатывает статус `OCZEKUJE_NA_AUTORYZACJE → NA_WERYFIKACJI` и полностью чистит гейт. `decidedById` при авто-переходе НЕ трогается (это верификация, не решение). Повторяемо (re-verify перезаписывает; идемпотентный re-save над порогом в `OCZEKUJE` статус не трогает, re-notify только по amount-aware dedup). Авто-пересчёт выезда (`w_trasie→zjechal`) сбрасывает `verifiedAt`/`verifiedById` в NULL (данные изменились → нужна ре-верификация). 422 если статус ∉ {`NA_WERYFIKACJI`, `OCZEKUJE_NA_AUTORYZACJE`}; статус `OCZEKUJE_NA_AUTORYZACJE` доступен **только `admin`** (для `pracownik` — 422 `{code:'CLAIM_VERIFY_ADMIN_ONLY'}`, отличимый от статусного отказа). Audit `claim.verify`. | **admin / pracownik** |
| PATCH `/claims/:nrZgl` | `updateClaimFull` — корректировки + decision (status, korekta godzin, nrZlecenia) + разрешение рекламации. Body — discriminated union `UpdateClaimSchema` в `@magguarantee/shared/schemas/claims.ts` (`targetStatus` ∈ {`ZAAKCEPTOWANO`, `ODRZUCONO`, `REKLAMACJA_ZAAKCEPTOWANO`, `REKLAMACJA_ODRZUCONO`}; синтетические литералы `REKLAMACJA_*` service резолвит в **`statusBeforeReklamacja`** (откат статуса при ОБОИХ исходах), а исход пишет в `reklamacjaResolution` — см. «Update claim (verification)» ниже; **422 `REKLAMACJA_NOT_PENDING`**, если статус ≠ `REKLAMACJA`). **`OCZEKUJE_NA_AUTORYZACJE` больше НЕ является PATCH-таргетом** — в этот статус попадают только автоматически на верификации. State-machine — `apps/api/src/modules/claims/claim-state-machine.ts`, 10 легальных рёбер (рёбра в/из `OCZEKUJE_NA_AUTORYZACJE` — автоматические, driven by verify; PATCH их не принимает), 422 на любой illegal transition. **Gate CLAIM_NOT_VERIFIED:** решение (akceptacja/odmowa) ИЗ `NA_WERYFIKACJI` блокируется 422 `{code:'CLAIM_NOT_VERIFIED'}`, пока wniosek не верифицирован (`verifiedAt` не проставлен через `PATCH /verification`). Переходы ИЗ `OCZEKUJE_NA_AUTORYZACJE` и `REKLAMACJA` — НЕ gated (wniosek уже был верифицирован). **Gate CLAIM_AUTHORIZATION_REQUIRED:** решение ИЗ `NA_WERYFIKACJI` ИЛИ `OCZEKUJE_NA_AUTORYZACJE` над порогом блокируется 422 `{code:'CLAIM_AUTHORIZATION_REQUIRED'}`, пока не загружен скриншот подтверждения Maksima (`POST /claims/:nrZgl/authorization-confirmation`, `category=AUTORYZACJA_MAKSIMA`, снимающий `maksimGateClearedAt`); блокирует и accept, и reject; reklamacja-пути не gated. | **admin / pracownik** |
| POST `/claims/:nrZgl/reklamacja` | `submitReklamacja` | przewoznik (own claim) |
| ↳ **Body** (`SubmitReklamacjaSchema`, `.strict()`) | `{ tresc: string(1..4000), kwotaReklamacji: number > 0 }` — **только** сумма + обоснование. Данные заявления рекламацией **не правятся** (correction-полей нет). | |
| ↳ **Гейты** (порядок, первый сработавший выигрывает) | 404 (нет wniosku) → 403 (чужой wniosek) → **409 `REKLAMACJA_ALREADY_SUBMITTED`** (одна рекламация на wniosek, флаг `reklamacjaSubmitted` не сбрасывается; сюда же попадает попытка при ещё не рассмотренной рекламации) → **422 `REKLAMACJA_CLAIM_NOT_DECIDED`** (статус ∉ {`ZAAKCEPTOWANO`,`ODRZUCONO`}) → **422 `REKLAMACJA_WINDOW_EXPIRED`** (>48ч от `statusChangedAt`; `extensions.deadlineAt: ISO`; при `statusChangedAt = null` правило не применяется) → **422 `REKLAMACJA_NO_DELTA`** (`maxAmount ≤ 0`) → **422 `REKLAMACJA_AMOUNT_EXCEEDS_CAP`** (`kwotaReklamacji > maxAmount`, СТРОГО, точность до цента; `extensions.maxAmount: number`). Гейты 3-6 считает `getReklamacjaEligibility()` из `@magguarantee/shared` (`domain/reklamacja-rules.ts`) — **единственное** место, где живёт формула потолка (web-форма зовёт ту же функцию). | |
| ↳ **Потолок** | `maxAmount = (origPaymentEur ?? paymentEur) − (status==='ZAAKCEPTOWANO' ? (amountApproved ?? 0) : 0)`. Легаси-допуск `+1 €` **убран**. Запись — атомарно в ambient `@Audit`-транзакции (`updateWithin`), ставит `reklamacjaSubmittedAt` = `statusChangedAt` (один инстанс `Date`), `statusBeforeReklamacja = status`, `status = REKLAMACJA`. Письма: `reklamacja-internal-submitted` (все активные `admin`+`pracownik`) + `reklamacja-carrier-submitted` (перевозчику). | |
| POST `/claims/:nrZgl/preview` | (новое) — server-side расчёт live preview, заменяет client-side `carrierPreviewCalc` | любой залогиненный (помогает заполнить форму) |
| GET `/claims/raw?nrZgl=...` | `getRawClaims` (admin diagnostics) | admin |

### Delegations (выезды) — `/api/v1/delegations`

| Method + Path | GAS |
|---|---|
| GET `/delegations` | Единый endpoint, фильтрация по роли. `eksport`/`weryfikator`: active-board `{zgloszony, gotowy, w_trasie}` + `?includeHistory=true`. carrier→свои, planista→свой `plannerId`, dyspozytor→своя team. `?claimable=true` (carrier outing-picker) → **только `zjechal`** без привязанного wniosek (§0‴: `w_trasie` больше НЕ claimable). (REWORK 2026-06-20: `weryfikator` снова видит выезды — §0″.) |
| GET `/delegations/:id` | (lookup) — incl. `weryfikator` |
| POST `/delegations` | `addDelegacja` (carrier → `zgloszony`) |
| POST `/delegations/:id/ready` | **NEW** — `eksport \| admin`: `zgloszony→gotowy` (+ откат `gotowy→zgloszony` флагом `rollback: true`, пока не `w_trasie`). Audit `delegation.markReady`, при откате — `delegation.rollbackReady` (имя подменяется в сервисе через `AuditContext.setAction`); оба пишут `before = { status, spedOrderNumber, readyById, readyAt }`. |
| POST `/delegations/:id/in-transit` | **NEW** — `weryfikator \| admin`: `gotowy→w_trasie`, body `{ actualDepartureAt }` (**ISO datetime**, required; границы `>= start-of-day(departureAt)`, `<= now`; 422 `DEPARTURE_DATE_FUTURE` — datetime-granулярный). weryfikator фиксирует точный момент выезда. Audit `delegation.markInTransit`. |
| POST `/delegations/:id/returned` | **NEW** — `weryfikator \| admin`: `w_trasie→zjechal`, body `{ actualReturnAt }` (**ISO datetime**, required; 422 `RETURN_DATE_FUTURE` (`> now`), `RETURN_BEFORE_DEPARTURE` (`< actualDepartureAt`)). Txn: `vehicle.lastDroveAt = max(...)` + авто-пересчёт связанного wniosek (границы — §0″). Audit `delegation.markReturned`. |
| POST `/delegations/:id/cancel` | carrier (свои `zgloszony`) **+ admin (любой активный)** → `anulowany`. |

> **Side-effect (Google Chat + email):** контракт `POST /delegations` не
> меняется. После создания выезда `add()` асинхронно (1) постит 6-строчную
> нотификацию в Google Chat space — очередь `chat-notify-wyjazd`, это
> **внутренний** heads-up для planisty / dyspozytorów / opiekuna — и (2) шлёт
> **перевозчику** письмо-подтверждение через очередь `email-send`. Оба — off the
> request path, никогда не ломают и не задерживают ответ. Письма опекуну о
> выезде больше нет (2026-08-07). См.
> [16-jobs-and-integrations.md#google-chat-notifications](16-jobs-and-integrations.md#google-chat-notifications).

> ✅ **REWORK 2026-06-20 (#4):** статусы выезда снова операционные — `in-transit`/`returned` восстановлены (у `weryfikator`) + новый `ready` (`eksport` → `gotowy`). `weryfikator` ведёт **И** km-доску машин (ниже), **И** статусы выездов (отдельное окно). `Claim.delegationId` введён — `POST /claims`/`/claims/preview` принимают `delegationId`, период и `mileage` берутся из выезда. Полная спека: [`20-phase-7-eksport-weryfikator.md` §0″](20-phase-7-eksport-weryfikator.md). (Прежнее «удалено 2026-06-10 #2 / мёртвый груз» — отменено.)
>
> ✅ **UPDATE 2026-07-08 (§0‴):** переходы несут **полный datetime** — `in-transit` `{ actualDepartureAt }`, `returned` `{ actualReturnAt }` (weryfikator фиксирует точные времена). `Claim.timeFrom`/`timeTo` **деривируются** из них (перевозчик не вводит; `pracownik` может править). Гейт подачи wniosek — **только `zjechal`** (soft-warning `DELEGATION_NOT_YET_RETURNED` и `delegationWarning` удалены). См. [`20-phase-7` §0‴](20-phase-7-eksport-weryfikator.md).

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

**Vehicle lifecycle status (delegation-driven).** Статус LIVE-машины считается **на чтении** (нет колонки-статуса) через `computeVehicleLifecycleStatus` (`@magguarantee/shared`, `domain/vehicle-status.ts`). Порядок short-circuit:

1. `wylaczona` — `Vehicle.active=false` (ручная деактивация; ортогональна idle-часам, из них исключена).
2. `aktywna` — `active=true` И есть нетерминальный wyjazd (`status ∈ {zgloszony, gotowy, w_trasie}`). `vehicle_daily_km` больше **не** участвует.
3. иначе `daysSinceReturn = max(0, calendarDaysBetween(anchor, today))`, где `anchor = max(actualReturnAt по zjechał, non-deleted) ?? Vehicle.createdAt`; дни **календарные** (Europe/Warsaw). Бакеты: `stojaca` 0–14, `nieaktywna` 15–28, `do_usuniecia` ≥29.

Полный `VehicleDto` **и** slim `VehicleListItem` несут `lifecycleStatus: 'wylaczona'|'aktywna'|'stojaca'|'nieaktywna'|'do_usuniecia'` + `daysSinceReturn: number | null` (`null` для `wylaczona`/`aktywna`). Считаются сервисом одним батч-запросом delegation-статусов на страницу (без N+1); `GET /vehicles/:id` — один lookup.

**`GET /fleet/opiekun` — `OpiekunCarrierVehicleStats`** (заменяет легаси 7-дневную `lastDroveAt`-классификацию `jezdzace/stojace`):
`{ aktywne, stojace, nieaktywne, doUsuniecia, wylaczone, potencjalne, total }`, где `potencjalne = max(0, Carrier.numberOfVehicle ?? 0 − total)` (KREPTD-запас), а `total = aktywne + stojace + nieaktywne + doUsuniecia + wylaczone`. `totals.vehicles` — та же форма, просуммированная по всем перевозчикам.

**`GET /fleet/dyspozytor` + `/fleet/planista` — `DyspozytorFleetStats`** (та же классификация; заменяет `autaJezdzace/autaStojace7dni`):
`{ liczbaAut, aktywne, stojace, nieaktywne, doUsuniecia, wylaczone, liczbaKierowcow, liczbaNaczep }`. Инвариант: `aktywne + stojace + nieaktywne + doUsuniecia + wylaczone === liczbaAut`. Список `stojaceList` (`DyspozytorStojacyItem`) переориентирован на «нужно внимание» — машины в `nieaktywna` ИЛИ `do_usuniecia`: `{ plateNumber, carrierLogin, status, daysSinceReturn, plannerName }`.

### Guarantee Watchdog — `/api/v1/guarantee-compliance` + `/guarantee-episodes`

> Гарантийный «сторож»: гарантийная машина обязана заявить wyjazd в течение N рабочих дней после последнего возврата. Live-доска считается stateless из `computeGuaranteeWatchdog` (`@magguarantee/shared`); архив нарушений читает журнал `GuaranteeIdleEpisode`. **Только чтение (нет мутаций, нет `@Audit`).** Scoping — server-side из JWT (не через ownership-гварды).

| Method + Path | Назначение | Роли |
|---|---|---|
| GET `/guarantee-compliance` | Live-доска: строка на каждую гарантийную машину (`vehicleId`-keyed) + summary. admin → все; opiekun → свои (`carrier.opiekunId = user.sub`) | admin / opiekun |
| GET `/guarantee-compliance/me` | Своя гарантийная flota перевозчика (баннер + бейджи), тот же item-shape минус carrier-блок | przewoznik |
| GET `/guarantee-episodes?carrierId=&vehicleId=&state=&cursor=&limit=` | Архив нарушений, newest-first, cursor-пагинация по `id`. admin → все; opiekun → свои (`carrier.opiekunId`) | admin / opiekun |
| GET `/guarantee-episodes/me?vehicleId=&state=&cursor=&limit=` | **Свой** архив нарушений перевозчика (только своя flota). Тот же shape/пагинация, что и admin/opiekun-список; carrier-scope выводится из JWT (`carrier.userId = user.sub`). **`carrierId` НЕ принимается** (нет в схеме `MyGuaranteeEpisodeFiltersSchema`) — client не может расширить scope (IDOR-guard) | przewoznik |

Схемы — `packages/shared/src/schemas/guarantee-watchdog.ts` (`GuaranteeEpisodeFiltersSchema`, `MyGuaranteeEpisodeFiltersSchema`; response `GuaranteeEpisodeListDto`).

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

### Guarantee Watchdog (compliance выездов) — `/api/v1/guarantee-compliance`, `/api/v1/guarantee-episodes`

> 🆕 **Guarantee Watchdog** (план 2026-07-07). Машина под гарантией (`Vehicle.agreement === true`) обязана зарегистрировать выезд (`POST /delegations` → `zgloszony`) в течение **10 польских рабочих дней** от последнего съезда (`actualReturnAt` последнего `zjechal`) или от даты включения гарантии (`Vehicle.agreementSince`, если машина ещё ни разу не съезжала). Live-доска считается statelessly из делегаций (shared `computeGuaranteeWatchdog`); журнал «плохих» циклов + дедуп писем хранится в `GuaranteeIdleEpisode`. Крон 07:10 Europe/Warsaw шлёт напоминания D-3/D-1 перевозчику (одно письмо, список машин) и дайджест опекуну (+секция «наруszenia»). Полностью read-only surface — **нет** ручных мутаций эпизодов в v1. Отдельного письма о нарушении перевозчику нет (решение заказчика). См. [16-jobs-and-integrations.md#guarantee-watchdog](16-jobs-and-integrations.md#guarantee-watchdog).

| Method + Path | Назначение | Роли |
|---|---|---|
| GET `/guarantee-compliance` | Live-доска: по одной строке на каждую гарантийную машину (keyed by `vehicleId`), `{ items, summary }`. `admin` → все; `opiekun` → только свои перевозчики (service-scope `carrier.opiekunId = user.sub`). Read-only, без `@Audit`. | admin / opiekun |
| GET `/guarantee-compliance/me` | Свой парк перевозчика (для баннера/бейджей на дашборде и во флоте). Та же форма строки без блока `carrier`. Keyed by `vehicleId`. | przewoznik |
| GET `/guarantee-episodes?carrierId=&vehicleId=&state=` | Архив эпизодов (нарушений), newest-first, cursor-пагинация по `id`. `admin` → все; `opiekun` → свои перевозчики (repo-scope `carrier.opiekunId`). | admin / opiekun |

**`GuaranteeComplianceItem` DTO** (одна строка доски): `{ vehicleId, plateNumber, sideNumber, carrier?: { id, name } (нет на /me), anchorAt: date|null, anchorSource: 'zjechal'|'agreement'|null, deadlineAt: date|null, daysLeft: int|null, state: 'inactive'|'ok_active'|'counting'|'violated', openEpisode: { id, state, violatedAt, reminder3SentAt, reminder1SentAt } | null }`. Anchor-поля `null` для `inactive`/`ok_active` (счётчик выключен). **Response:** `{ items: GuaranteeComplianceItem[], summary: { violated, dueSoon, watched } }` (`dueSoon` = `counting && daysLeft ≤ 3`; `watched` = все гарантийные машины в scope). Shared-схема — `packages/shared/src/schemas/guarantee-watchdog.ts`.

**`GuaranteeEpisodeDto`** (архив): `{ id, vehicleId, plateNumber, sideNumber, carrierId, carrierName, anchorAt: date, anchorSource, deadlineAt: date, state: 'warning'|'violated'|'resolved', reminder3SentAt, reminder1SentAt, violationSentAt, violatedAt, resolvedAt, resolvedByDelegationId, resolvedDaysLeft: int|null, resolvedReason: 'wyjazd'|'agreement_off'|'vehicle_inactive'|null, createdAt, updatedAt }`. **Response:** `{ items: GuaranteeEpisodeDto[], nextCursor: uuid|null }`.

**Защита endpoints:** глобальный `JwtAuthGuard` + `RolesGuard` (`@Roles`). Скоуп опекуна — service-level (`carrier.opiekunId = user.sub`), **не** через `OpiekunOwnershipGuard` (тот decorator-driven для single-resource). `pracownik` доступа не имеет в v1.

### Limits — `/api/v1/limits`

| Method + Path | GAS |
|---|---|
| GET `/limits?year=2026` | `getLimityKm` |
| PUT `/limits/:yearMonth` | (новое) — upsert одной строки `(year, month)` от admin (`:yearMonth` = `YYYY-MM`) |

> **Тело `PUT /limits/:yearMonth`** — partial: `{ kmPerDay?, ratePerKm?, kmPerSaturday? }` (все `positive`, coerced); `refine` требует **хотя бы одно** из трёх (`UpdateMonthlyLimitSchema`). `kmPerSaturday` — км за одну зачётную нечётную субботу месяца (оценивается по `ratePerKm`, отдельной EUR-ставки нет; см. [01-overview.md](01-overview.md)). **`GET /limits?year=`** возвращает в каждой строке `kmPerSaturday: number | null` рядом с `kmPerDay`/`ratePerKm` (`MonthlyLimitDto`).

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
| POST `/integrations/vies/check` | `viesLookup` | VIES. Body `{ country, vat }` (`ViesCheckBodySchema`, strict) |
| POST `/integrations/whitelist/check` | `whiteListCheckAccount` | Biała Lista — проверка пары NIP + счёт. Body `{ nip, account }` (`WhiteListCheckBodySchema`, strict) |
| POST `/integrations/whitelist/search` | `whiteListSearchByNip` | Biała Lista — auto-fill компании по NIP (`{ found: false }` для не-польских NIP, не ошибка). Body `{ nip }` (`WhiteListSearchBodySchema`, strict) |
| GET `/integrations/inspection?vin=...` | `inspectionCheckLink` | info-car.pl URL builder |
| GET `/integrations/gps/positions` | — (новое) | GPS tracker (TBD — см. [16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api](16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api)) |
| GET `/integrations/gps/positions/:vehicleId` | — | GPS tracker (TBD) |
| GET `/integrations/gps/trips/:vehicleId?from=...&to=...` | — | GPS tracker (Phase 11+) |

> **VIES и Biała Lista — POST, хотя это чтение (2026-09-14).** До этого NIP, номер счёта и VAT-номер шли в query/path и оседали в access-логах API и Caddy и в `audit_log.metadata.route` (аудит логирования, п.2). Роли `admin` + `opiekun`, 10/мин, ответ `200`, без `@Audit` — в allowlist inverse audit-coverage спека как read-only. Ошибка апстрима клиенту уходит без тела внешнего сервиса: общее сообщение + `extensions.code` = `INTEGRATION_UPSTREAM_REJECTED` (4xx, статус апстрима сохраняется, 404 = «не найдено») или `INTEGRATION_UPSTREAM_UNAVAILABLE` (5xx / сеть).

> **GPS endpoints** в Phase 2 поднимаются как скелетон с mock-провайдером — реальные вызовы добавляются после получения credentials от MAGTRANS. Контракт ответа стабилен: `{ position, stale: boolean, lastFetchedAt }` для одиночного, `{ items, stale, lastFetchedAt }` для списка. Mock-провайдер возвращает детерминированные позиции от `plateNumber`, чтобы UI можно было разрабатывать параллельно. Ownership-фильтрация: carrier видит свои авто, opiekun — своих карьеров, planista/dyspozytor — закреплённых, admin — все. Если `Vehicle.gps = false` — 404.

### Audit — `/api/v1/audit` (admin)

| Method + Path | GAS |
|---|---|
| GET `/audit?targetType=...&targetKey=...` | (нет — лист открывается напрямую сейчас) |

### SSO — `/api/v1/sso` (admin only)

Управление тем, какая должность из MAGSpace даёт какую роль здесь (docs/24 §A5).

| Method + Path | Назначение |
|---|---|
| GET `/sso/stanowisko-roles` | `{ items, magspaceOk, lastReconcileAt }`. `items` — **полное объединение**: каждое stanowisko, которое отдаёт MAGSpace (в т.ч. несопоставленные, `role: null`), плюс сохранённые строки, чьих кодов MAGSpace больше не знает (`knownToMagspace: false`). При недоступном MAGSpace отдаёт только сохранённые строки и `magspaceOk: false` — прятать текущий маппинг во время аварии было бы ровно наоборот. |
| PUT `/sso/stanowisko-roles/:code` | `{ role }` → upsert. Идемпотентно: код — это идентичность. `role` из 6 назначаемых (без `admin`/`przewoznik`); код должен быть UPPER_SNAKE. |
| DELETE `/sso/stanowisko-roles/:code` | 204. Убирает маппинг — держатели теряют доступ на следующем входе или прогоне reconcile. 404, если строки не было. |
| GET `/sso/access-denials` | `{ items }` — последние отказы `SSO_NO_ROLE`, читаются из audit-лога (`system.denyDirectoryAccess`), отдельной таблицы заявок нет. **Одна строка на человека**: повторные отказы одного адреса (без учёта регистра) схлопываются в последний; сканируется окно в 200 событий, в ответе ≤ 20 человек. Строка: `{ email, stanowiskoCode, at, status: 'pending' \| 'granted', userId: uuid \| null }` — `granted` + `userId`, если для адреса сейчас есть активная неудалённая учётка (неважно, как она появилась). |
| POST `/sso/access-grants` | «Nadaj dostęp» одним шагом (docs/24 §10). Body `{ email, role }` (`GrantSsoAccessSchema`, `.strict()`, email trim+lowercase; `role` — 6 назначаемых). Адрес сверяется с MAGSpace, затем: **учётки нет** → создаётся (`managedBy=magspace`, `role = roleOverride = role`, без пароля, `authProvider=local` до первого входа через Google, login — из local-part адреса); **есть `magspace`-учётка** → `role = roleOverride = role`, `active = true` (reconcile сам не реактивирует и override к `role` не применяет). Override ставится, даже если stanowisko тем временем сопоставлено — это осознанное решение админа. Ответ **200** `{ user: UserDtoFull, outcome: 'created' \| 'reactivated' \| 'updated' }`. Ошибки (`extensions.code`): **503** `SSO_DIRECTORY_UNAVAILABLE`; **422** `SSO_GRANT_NOT_EMPLOYEE` (в MAGSpace нет адреса); **422** `SSO_GRANT_EMPLOYEE_INACTIVE`; **409** `SSO_GRANT_ACCOUNT_CONFLICT` + `extensions.reason` = `privileged` (admin/przewoznik) \| `local` (`managedBy=local` — править в Użytkownikach) \| `deleted` (адрес держит soft-deleted строка — уникальность email включает удалённых) \| `unique` (проиграна гонка на login / `magspaceEmployeeId`). Audit `grantSsoAccess` (актор — admin, `targetKey` = login, `before` = `{ user: { role, active, managedBy, roleOverride } }`, при создании пусто; `metadata` = `{ outcome, stanowiskoCode, magspaceEmployeeId }`), `@Audit({ manualTransaction: true })` — хендлер ходит в MAGSpace. |

### Diagnostics (admin only) — `/api/v1/diagnostics`

| Method + Path | GAS |
|---|---|
| GET `/diagnostics/mails` | `diagnostykaMaili` |
| POST `/diagnostics/mails/resend/:nrZgl` | `ponowWyslijEmail` |
| GET `/diagnostics/claims` | `DIAGNOSTYKA_WNIOSKÓW` |
| GET `/diagnostics/dashboard` | `getDashboardStats` |
| GET `/diagnostics/db` | (новое) — health-check Prisma + сводка по таблицам + строка MAGSpace (`configured` / `ok` / `latencyMs` / `lastReconcileAt`) |

### Health / Ready — без префикса `/api/v1`

| Method + Path | Назначение |
|---|---|
| GET `/health` | Liveness (always 200 если процесс жив). Тело: `{status, uptime, timestamp}` |
| GET `/ready` | Readiness (Postgres `SELECT 1` + Redis `PING`, параллельно). **200** `{status:'ok', checks:{db,redis}, timestamp}`, **503** с тем же телом и `status:'degraded'`, если хоть одна зависимость не ответила. Оба чека всегда в теле — видно, что именно упало. `@Public()`, без audit |

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
// POST /claims — ⚠️ РАЗВОРОТ 2026-07-30 (docs/20 §0⁗): перевозчик снова САМ
// заявляет период, часы и пробег. Деривация из выезда/km-доски отменена —
// деньги платятся по пробегу SpedTrans, а данные weryfikatora приходят из
// другой системы и никогда не совпадают. Weryfikator не тронут: его цифры
// стали ЭТАЛОНОМ для сверки, а не источником.
type SubmitClaimRequest = {
  delegationId: string;    // chosen outing (MUST be `zjechal` — see status gate)
  dateStart: string;       // 'YYYY-MM-DD' — floor: >= day(delegation.departureAt)
  dateEnd: string;         // 'YYYY-MM-DD' — НЕ ограничена фактическим возвратом
  timeFrom: string;        // 'HH:mm' — обязательно (колонка NOT NULL)
  timeTo: string;          // 'HH:mm' — обязательно
  mileage: number;         // свободный; единственные санитары — >0 и km/дн cap
  comment?: string;
  attachmentIds?: string[]; // pre-uploaded attachment UUIDs (max 20)
};
// Все пять заявленных значений дополнительно пишутся в orig*-снимки
// (origDateStart/origDateEnd/origTimeFrom/origTimeTo/origMileage) — write-once,
// PATCH их не трогает. Именно они дают в ClaimModal колонку «Deklaracja
// przewoźnika» рядом с «Dane weryfikatora».
//
// SERVER-DERIVED from the delegation (NOT in the body):
//   • vehicleId / trailerId / driverId — from Delegation.vehicleId / trailerId
//     / driverId; `vehiclePlateSnapshot` from Delegation.vehicle.plateNumber.
//     (Claim persists only vehicleId + vehiclePlateSnapshot; trailer/driver are
//     carried by the linked Delegation, not duplicated onto Claim.)
//   • Запрошенная сумма = km-calc paymentEur (rounded 2dp), замораживается в
//     origPaymentEur. Отдельного carrier-поля нет (amountRequested дропнут).
//   • hoursAdjusted — verifier-only (PATCH); submit always persists 0.
// DEPARTURE FLOOR: dateStart < day(delegation.departureAt) ⇒ 422
// `CLAIM_DATE_BEFORE_DEPARTURE` (single-code envelope + `extensions.minDateStart`).
// Нельзя выехать раньше, чем сам заявил при zgłoszeniu; позже — можно.
// DEADLINE: правило `max_days_after_unloading` считается от
// `delegation.actualReturnAt` (факт weryfikatora), а НЕ от введённого dateEnd —
// иначе опоздавший вписал бы дату посвежее и прошёл бы мимо срока.
// OWNERSHIP: @CarrierOwns('delegationId','body','delegationId') — the outing
// must belong to the authenticated carrier (delegation.carrierId === carrier).
// STATUS GATE (§0‴): the outing MUST be in status `zjechal` (both actual
// departure & return datetimes fixed by the weryfikator) — submit AND preview
// reject any non-`zjechal` outing. The former `w_trasie` submission with the
// soft-warning `DELEGATION_NOT_YET_RETURNED` is REMOVED. `GET /delegations`
// outing-picker feed for the carrier returns only `zjechal` outings.
// GUARANTEE: a wniosek may only be filed for a vehicle under guarantee
// (`Vehicle.agreement === true`; `false`/`null` ⇒ not guaranteed), else 422
// `VEHICLE_NOT_GUARANTEED` (single-code `extensions.code` envelope) — gate lives
// in the shared delegation-resolution seam, covering both preview and submit.

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
//   • new-claim (delegation path): { delegationId, dateStart, dateEnd, timeFrom,
//     timeTo, mileage, hoursAdjusted? } — ⚠️ РАЗВОРОТ 2026-07-30: превью считает
//     ровно то, что перевозчик ввёл (иначе панель и submit разошлись бы).
//     `delegationId` здесь нужен, чтобы прогнать те же гейты, что и submit
//     (ownership / `zjechal` / уже-заявлен / гарантия) до того, как перевозчик
//     дозаполнит форму. Vehicle/trailer/driver по-прежнему деривируются.
//   • existing/verifier: { vehicleId?, dateStart?, dateEnd?, timeFrom?, timeTo?,
//     hoursAdjusted?, mileage? } — caller-supplied dates drive the math; the
//     existing claim already carries vehicle/trailer/driver context.
// На пути `przewoznik`-инспекции СУЩЕСТВУЮЩЕГО wniosku (без `delegationId`)
// `mileage`/`timeFrom`/`timeTo` по-прежнему IGNORED — показываются
// сохранённые значения заявления (менять их — это reklamacja). A VERIFIER
// (`pracownik`/`admin`) on `POST /claims/:nrZgl/preview` MAY send `mileage` (and
// `timeFrom`/`timeTo`) to override so the ClaimModal's live dopłata / RecalcBadge
// / accept-gate / auto-populated `amountApproved` track an un-saved edit before
// PATCH commits — mirrors the PATCH correction fields `UpdateClaimCorrectionFields.*`.
type PreviewRequest = {
  delegationId?: string;   // new-claim path → gates + vehicle/trailer/driver
  vehicleId?: string;      // existing/verifier path → vehicle for the km sum
  dateStart?: string;      // required on the new-claim path (carrier-declared)
  dateEnd?: string;
  timeFrom?: string;       // HH:MM — carrier-declared (new-claim) / verifier edit
  timeTo?: string;         // HH:MM — carrier-declared (new-claim) / verifier edit
  hoursAdjusted?: number;  // verifier inspection only; default 0
  mileage?: number;        // VERIFIER inspection override only (see note above)
};
type PreviewResponse = {
  mileage: number;            // что было учтено в расчёте: заявленный перевозчиком
                              // пробег (new-claim), правка верификатора или
                              // сохранённый пробег заявления
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  breakdown: KmCalcBreakdown;
  // Present ONLY on the delegation-derived (new-claim) path, so the carrier
  // form can render the read-only period + time-window + vehicle/trailer/driver:
  dateStart?: string;         // derived from the outing
  dateEnd?: string;           // derived from the outing
  timeFrom?: string;          // HH:mm — derived from actualDepartureAt (read-only)
  timeTo?: string;            // HH:mm — derived from actualReturnAt (read-only)
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
//
// Форма одной месячной строки `MonthBreakdown` (источник — `MonthBreakdownSchema`
// в `packages/shared/src/schemas/claims.ts`):
// {
//   yearMonth: string,          // 'YYYY-MM'
//   workingDays: number,        // ТОЛЬКО будни (пн–пт), после EU-ban / дробных / korekta godzin
//   kmPerDay: number,
//   ratePerKm: number,
//   saturdaysCounted: number,   // зачтённые нечётные субботы (целое ≥0)
//   kmPerSaturday: number,      // км за субботу (0 ⇒ субботняя гарантия для месяца выключена)
//   kmFromSaturdays: number,    // = round(saturdaysCounted × kmPerSaturday)
//   saturdayDays: string[],     // ISO-даты зачтённых суббот (по возрастанию)
//   kmInMonth: number,          // ГРАНД-ТОТАЛ = round(workingDays × kmPerDay) + kmFromSaturdays
//   excludedDays: { date, label }[]  // праздники / EU-ban (выходные НЕ включаются)
// }
// Полное число дней месяца = workingDays + saturdaysCounted; Σ kmInMonth === kmGuaranteed.
// Субботние поля идут с `.default(...)` (0 / []), чтобы старые persisted JSONB-строки
// без них парсились чисто. Зачётная суббота, попавшая на EU-ban, уходит в `excludedDays`
// (НЕ в `saturdayDays`) — не оплачивается и не считается днём.
```

### Update claim (verification)

> Phase 3 закрепил форму через **discriminated union** на поле `targetStatus`. Источник истины — `packages/shared/src/schemas/claims.ts` (`UpdateClaimSchema`). PATCH endpoint — Phase 4 (в Phase 3 — controller-stub).

```ts
// PATCH /claims/:nrZgl — body shape (упрощённо)
// Опциональные correction-поля (`dateStart`, `dateEnd`, `timeFrom`, `timeTo`,
// `mileage`, `hoursAdjusted`) присутствуют ТОЛЬКО в ветке `ZAAKCEPTOWANO` —
// позволяют верификатору поправить ввод карьера перед фиксацией решения. На
// wire-уровне `hoursAdjusted` остаётся одним числом (replace-семантика); service
// маппит его на `hoursAdjustedValue` в БД, `origHoursAdjusted` НЕ трогает.
// `OCZEKUJE_NA_AUTORYZACJE` НЕ является PATCH-таргетом: в этот статус wniosek
// попадает только автоматически на верификации (порог Maksima).
type UpdateClaimRequest =
  | { targetStatus: 'ZAAKCEPTOWANO';            /* + поля акцепта: orderNumber, orderDate, amountApproved, hoursAdjusted?, ... */ }
  | { targetStatus: 'ODRZUCONO';                /* + поля отказа: comment, ... */ }
  // РЕКЛАМАЦИЯ УЗНАНА (REWORK 2026-07-31): `reklamacjaOrderNumber` (min 1, max 64)
  // ОБЯЗАТЕЛЕН — «Nr zlecenia», под которым платится dopłata (независим от
  // `orderNumber` самого wniosku; UI лишь префиллит из него). Суммы НЕ передаются:
  // платится ровно carrier-ская `reklamacjaAmount`, зафиксированная при подаче.
  // Correction-полей НЕТ. `comment` опционален → `reklamacjaResponse`.
  | { targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO'; reklamacjaOrderNumber: string; comment?: string }
  // РЕКЛАМАЦИЯ ОТКЛОНЕНА: `comment` ОБЯЗАТЕЛЕН — это обоснование, пишется в
  // `reklamacjaResponse`. Ни сумм, ни correction-полей.
  | { targetStatus: 'REKLAMACJA_ODRZUCONO';     comment: string };
```

`REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` — **synthetic wire-only литералы**, не настоящие `ClaimStatus`. UI использует их чтобы различить «accept fresh claim» от «accept reklamacja» (разные поля, разные подтверждения).

**Динамический translate-back (REWORK 2026-07-31, вариант A).** Синтетические литералы больше **не** сворачиваются в фиксированные `ZAAKCEPTOWANO`/`ODRZUCONO`. При **обоих** исходах `status` **возвращается** в `statusBeforeReklamacja` (defensive fallback, если колонка почему-то NULL: `amountApproved != null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO'`), а сам исход живёт **только** в новой колонке `reklamacjaResolution` (`UZNANA`/`ODRZUCONA`). Никогда не выводить исход рекламации из результирующего статуса. `assertLegalTransition(from, to)` из `claim-state-machine.ts` вызывается после резолва динамического таргета, до любых DB-операций (оба ребра `REKLAMACJA → ZAAKCEPTOWANO|ODRZUCONO` уже легальны — матрица не менялась).

Что решение рекламации **никогда не трогает**: `amountApproved`, `orderNumber`, `orderDate`, `paymentEur`, `comment` и claim-level `decidedById` (последний остаётся автором ИСХОДНОГО решения по wniosku; автор решения по рекламации пишется в `reklamacjaDecidedById`). Это же снимает латентное нарушение DB CHECK `claim_accepted_payment_complete` на пути `ODRZUCONO → REKLAMACJA → уznana` (прежний код переводил статус в `ZAAKCEPTOWANO` без выплатных полей). `reklamacjaDecidedAt` и `statusChangedAt` пишутся из **одного** инстанса `Date` — на это равенство опирается недельный отчёт, отделяя откат статуса от свежего решения.

**Новые коды 422 на PATCH:**

| Код | Когда |
|---|---|
| `REKLAMACJA_NOT_PENDING` | `targetStatus` = `REKLAMACJA_*`, но `existing.status !== 'REKLAMACJA'` (нет рекламации на рассмотрении). Проверяется **до** state-machine: `NA_WERYFIKACJI → ZAAKCEPTOWANO` — легальное ребро, и без этого гейта синтетический accept прошёл бы как свежий accept, минуя пересчёт и гейты. |

**Область действия гейтов решения.** `CLAIM_NOT_VERIFIED`, `CLAIM_AUTHORIZATION_REQUIRED` (порог Maksima) и compensation-due guard («нет недопробега — нельзя акцептовать») применяются **только к свежим решениям** (`ZAAKCEPTOWANO`/`ODRZUCONO`), но **не** к разрешению рекламации: уznana рекламация платит фиксированную `reklamacjaAmount` (ограниченную при подаче), не зависящую от km-calc, — поэтому wniosek, отклонённый именно из-за `kmDifference ≤ 0`, может законно получить уznaną рекламацию. km-calc (`_recalcClaim`) на reklamacja-ветках **не запускается** — суммы заморожены.

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
| `/auth/login`, `/auth/google`, `/auth/forgot-password` | 5 / минуту / IP |
| `/auth/verify-code`, `/auth/reset-password` | 10 / минуту / IP |
| `/auth/resend-code`, `/auth/resend-reset-code` | 2 / минуту / IP + cooldown 60 с на сессию (Redis) |
| `/auth/refresh` | 60 / минуту / IP (одна загрузка страницы может дать несколько параллельных refresh; офис за одним NAT делит бакет) |
| `/integrations/vies/check` | 10 / минуту / IP (внешний API лимиты) |
| `/integrations/whitelist/check`, `/integrations/whitelist/search` | 10 / минуту / IP |
| `/claims/*/preview` | 30 / минуту / user |
| Остальные | 100 / минуту / user |

Реализация: `@nestjs/throttler` (`@Throttle()` декоратор + `ThrottlerGuard`). Ключ — `req.ip`, поэтому в проде лимиты работают на реального клиента только при заданном `UPSTREAM_PROXY_CIDRS` в Caddy (иначе все пользователи = IP корпоративного nginx, см. docs/23). Каждый ответ 429 пишется WARN-строкой (`request rate-limited`: метод, шаблон роута, `userId`, IP). Страж: `auth.controller.throttle.spec.ts` требует `@Throttle` на каждом публичном auth-роуте.

## Idempotency

Для `POST /claims`, `POST /delegations` принимаем заголовок `Idempotency-Key: <uuid>`. Сохраняем (`{key, response}` в Redis на 24ч). Повторный запрос с тем же ключом → тот же response, без второго insert. Защищает от двойных кликов и retry клиента.

## Audit на уровне API

Все mutating endpoints автоматически логируются через `AuditInterceptor`. Сервис вызывает `@Audit('createCarrier', { targetKey: result.id })` или `@AuditTarget(req => req.params.id)` декоратор. Запись в `audit_log` идёт в той же транзакции, что и main change (через Prisma `$transaction`).

**Исключение — `@Public` auth-роуты: на них `@Audit` запрещён.** Интерцептор берёт актора из `req.user`, а у публичного роута его нет — он откатывается на `actor: 'system'`, и `AuditWriter` отклоняет любое действие без префикса `system.` → голый 500 после того, как хендлер уже всё сделал (так было с `/auth/google` до 2026-09-10). Плюс ambient-транзакция интерцептора откатывала `system.*`-строки, записанные перед 403. Страж — `apps/api/src/modules/auth/auth.controller.audit.spec.ts`. `/auth/google` пишет `googleLogin` / `linkGoogleAccount` / `provisionUserFromDirectory` / `syncUserFromDirectory` / `system.deprovisionUserFromDirectory` / `system.denyDirectoryAccess` явно из `AuthService` / `DirectoryService`, отдельными записями на root-клиенте — не атомарно с изменением `User`.

**Роуты, которые ходят в MAGSpace, — только `@Audit({ ..., manualTransaction: true })`** (из MAGSpace-роутов — `POST /sso/access-grants`). Интерактивная транзакция интерцептора не должна висеть на сетевом запросе: держит коннект пула и упирается в 5-секундный таймаут. Строку по-прежнему пишет интерцептор (актор — вошедший admin), `before` / `metadata` кладёт сервис через `AuditContext`; запись идёт на root-клиенте после успешного ответа. Страж — `apps/api/src/modules/directory/sso.controller.audit.spec.ts` (`txOpens === 0`).

**`manualTransaction` — принятый риск (зафиксирован 2026-09-14).** Всего 10 роутов пишут audit-строку **не атомарно** с мутацией: хендлер сам управляет транзакцией (или держит сетевой вызов, который нельзя пускать внутрь транзакции), интерцептор пишет строку после успешного ответа.

| Роут | Почему не в общей транзакции |
|---|---|
| POST `/vehicles`, PATCH `/vehicles/:id` | multipart + загрузка в S3/MinIO |
| POST `/drivers`, PATCH `/drivers/:id` | то же |
| POST `/trailers`, PATCH `/trailers/:id` | то же |
| POST `/carriers/:id/attachments` | загрузка в S3 |
| POST `/claims/:nrZgl/authorization-confirmation` | загрузка скриншота Maksima в S3 |
| POST `/claims` | подача wniosku: собственная транзакция + вложения |
| POST `/sso/access-grants` | запрос в MAGSpace |

Что это значит: если процесс упадёт между коммитом мутации и записью аудита, мутация останется без audit-строки; если упадёт сама запись аудита — клиент получит 500 при уже применённой мутации. Outbox-паттерн для этих роутов — возможное улучшение, пока не делается. Список проверяется inverse audit-coverage спеком (`common/audit`): каждый мутирующий роут обязан нести `@Audit` или стоять в явном allowlist с причиной.

**Inverse audit-coverage (с 2026-09-14).** `apps/api/src/common/audit/audit-coverage.inverse.spec.ts` находит все контроллеры тем же сканером, что и Nest при старте (без поднятия провайдеров), и падает, если POST/PUT/PATCH/DELETE-роут не несёт `@Audit` и не стоит в allowlist. Устаревшая запись allowlist (роут исчез, стал не мутирующим или получил `@Audit`) тоже валит спек; `@Public` + `@Audit` запрещены глобально. Allowlist сейчас: 8 публичных auth-роутов (аудит из сервиса или изменений в БД нет), `POST /auth/logout` (аудит из сервиса после отзыва сессии), `POST /claims/preview`, `POST /claims/:nrZgl/preview` (read-only расчёт), три POST-lookup'а VIES / Biała Lista и `POST /integrations/gps/refresh` (только Redis-кэш). Новый мутирующий роут без решения по аудиту CI не пройдёт.

**Динамическое имя действия.** Если один роут выражает два бизнес-намерения (пример — `/delegations/:id/ready` с `rollback: true`), сервис вызывает `AuditContext.setAction('…')`; интерцептор берёт его вместо имени из декоратора.

**Авто-пересчёт wniosku** (`claim.autoRecalc` / `claim.autoRecalcSkipped`) атрибутируется оператору, двинувшему выезд; без живого актора (крон, очередь) пишется `system.claim.autoRecalc` / `system.claim.autoRecalcSkipped`.

## Связь с GAS (legacy)

`Code.gs` + `index.html` — это **функциональный референс**, не работающий продакт. Никакого parallel-deployment, никакого cutover в смысле «переключить с одного на другое». После Фазы 10 (Launch — см. [17-migration-roadmap.md](17-migration-roadmap.md)) новое приложение работает само по себе. Legacy-файлы остаются в репо как историческая документация (или удаляются — решение в [18-launch-and-deployment.md](18-launch-and-deployment.md#что-делать-с-legacy-codegs--indexhtml)).
