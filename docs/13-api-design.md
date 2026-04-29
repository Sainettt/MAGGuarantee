# 13. REST API design

> Маппинг всех публичных GAS-функций на REST endpoints. Цель — функциональная идентичность, не побитовая копия.

## Соглашения

### Базовый префикс

Все endpoints живут под `/api/v1/`. Версия в URL, чтобы можно было ввести v2 в будущем без brick'инга клиентов.

### Аутентификация

- Все endpoints (кроме `/auth/login`, `/auth/verify-code`, `/auth/refresh`, `/health`) защищены `JwtAuthGuard`.
- JWT передаётся в `Authorization: Bearer <access_token>` или в HttpOnly cookie `mt_access` (для web).
- `RolesGuard` дополнительно проверяет роль через `@Roles('admin', 'pracownik')`.
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
| POST `/auth/verify-code` | `verifyLoginCode` (`Code.gs:1064`) | Принимает `{sessionToken, code}`. Возвращает `{accessToken, refreshToken, user}`. Set-cookie если режим cookie. |
| POST `/auth/resend-code` | `resendLoginCode` (`Code.gs:1131`) | Принимает `{sessionToken}`. Rate-limited. |
| POST `/auth/refresh` | — (новое, не было в GAS) | Refresh access из refresh. Rotation. |
| POST `/auth/logout` | — | Инвалидирует refresh-токен (записывает в `revokedAt`). |
| GET `/auth/me` | `validateCaller` | Возвращает текущего user-а на основе access-токена. |
| GET `/auth/google` | — (опц.) | Redirect на Google OAuth |
| GET `/auth/google/callback` | — (опц.) | Колбэк OAuth, выдаёт JWT |

### Users (admin only) — `/api/v1/users`

| Method + Path | Назначение |
|---|---|
| GET `/users` | Список всех пользователей (фильтр `role=`) |
| GET `/users/:id` | Деталь |
| POST `/users` | Создать (admin) |
| PATCH `/users/:id` | Обновить |
| POST `/users/:id/deactivate` | `Aktywny=Nie` + email |
| POST `/users/:id/reactivate` | + email |
| POST `/users/:id/reset-password` | Генерит новый, шлёт email |
| DELETE `/users/:id` | Soft delete |

### Carriers — `/api/v1/carriers`

| Method + Path | GAS | Роль |
|---|---|---|
| GET `/carriers` | `getCarriersList` | admin/pracownik (все), opiekun (свои) |
| GET `/carriers/:id` | `getCarrier` (lookup) | admin/pracownik/opiekun(own) |
| POST `/carriers` | `addCarrier` / `addCarrierByOpiekun` | admin/pracownik/opiekun |
| PATCH `/carriers/:id` | `updateCarrier` / `updateCarrierByOpiekun` | admin/pracownik/opiekun(own) |
| POST `/carriers/:id/deactivate` | `toggleCarrierActive` (off) | admin/pracownik/opiekun(own) |
| POST `/carriers/:id/reactivate` | `toggleCarrierActive` (on) | admin/pracownik/opiekun(own) |
| POST `/carriers/:id/reset-password` | `resetCarrierPassword` / `resetCarrierPasswordByOpiekun` | + |
| DELETE `/carriers/:id` | `deleteCarrierHard` / `deleteCarrierByOpiekunHard` | + (soft) |

> Один endpoint, один сервис. Различия admin/opiekun — на уровне `RolesGuard` + `OwnershipGuard`. Дублей `*ByOpiekun` нет.

### Vehicles — `/api/v1/vehicles`

| Method + Path | GAS |
|---|---|
| GET `/vehicles?carrierId=...` | `getVehiclesForCarrier` / `getMyVehicles` (carrier) / `getAllVehiclesForAdmin` |
| GET `/vehicles/:id` | `getVehicleDetails` |
| POST `/vehicles` | `addVehicle` / `addVehicleByOpiekun` |
| PATCH `/vehicles/:id` | `updateVehicleDetails` / `updateVehicleDetailsByOpiekun` |
| POST `/vehicles/:id/deactivate` | `toggleVehicleActive` (off) |
| POST `/vehicles/:id/reactivate` | (on) |
| DELETE `/vehicles/:id` | `removeVehicle` / `removeVehicleByOpiekun` |
| GET `/vehicles/active?login=...` | `getActiveVehiclesForLogin` (для carrier-login dropdown) |
| GET `/vehicles/cert-types` | `getVehicleCertTypes` (enum lookup) |

### Drivers — `/api/v1/drivers`

| Method + Path | GAS |
|---|---|
| GET `/drivers?carrierId=...` | `getDriversList` / `getMyDrivers` |
| GET `/drivers/:id` | `getDriverDetails` |
| POST `/drivers` | `addDriver` / `addDriverByOpiekun` / `addMyDriver` |
| PATCH `/drivers/:id` | `updateDriver` / `updateMyDriver` / `updateDriverByOpiekun` |
| POST `/drivers/:id/deactivate` | `toggleDriverActive` |
| POST `/drivers/:id/reactivate` | |
| DELETE `/drivers/:id` | `removeDriver` / `removeMyDriver` / `removeDriverByOpiekun` |

### Trailers — `/api/v1/trailers`

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

| Method + Path | GAS |
|---|---|
| GET `/trailer-types` | `getNaczepyTypyList` |
| POST `/trailer-types` | `addNaczepaTyp` |
| PATCH `/trailer-types/:id` | (новое) |
| POST `/trailer-types/:id/deactivate` | `toggleNaczepaTypActive` |

### Claims (wnioski) — `/api/v1/claims`

| Method + Path | GAS |
|---|---|
| GET `/claims` | `getAllClaims` (admin) / `getClaimsForCarrier` (carrier — фильтр своих) — единый endpoint, фильтрация по роли в сервисе |
| GET `/claims/:nrZgl` | `buildClaimObj` |
| POST `/claims` | `submitNewClaim` (carrier) |
| PATCH `/claims/:nrZgl` | `updateClaimFull` (admin/pracownik) — корректировки + decision |
| POST `/claims/:nrZgl/reklamacja` | `submitReklamacja` (carrier) |
| POST `/claims/:nrZgl/preview` | (новое) — server-side расчёт live preview, заменяет client-side `carrierPreviewCalc` |
| POST `/claims/:nrZgl/auth-screenshot` | `uploadAuthScreenshot` (multipart, S3) |
| POST `/claims/:nrZgl/request-authorization` | `sendAuthorizationRequest` |
| GET `/claims/raw?nrZgl=...` | `getRawClaims` (admin diagnostics) |

### Delegations (выезды) — `/api/v1/delegations`

| Method + Path | GAS |
|---|---|
| GET `/delegations` | `getDelegacjeForCarrier` / `getDelegacjeForEksport` / `getDelegacjeForWeryfikator` / `getDelegacjeForDyspozytor` — единый endpoint, фильтрация по роли |
| GET `/delegations/:id` | (lookup) |
| POST `/delegations` | `addDelegacja` (carrier) |
| POST `/delegations/:id/in-transit` | `markDelegacjaInTransit` (weryfikator) |
| POST `/delegations/:id/returned` | `markDelegacjaReturned` (weryfikator) |
| POST `/delegations/:id/cancel` | `cancelDelegacja` (carrier — только свои `zgloszony`, weryfikator — любые) |

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

### Limits — `/api/v1/limits`

| Method + Path | GAS |
|---|---|
| GET `/limits?year=2026` | `getLimityKm` |
| PUT `/limits` | (новое) — bulk update от admin (вместо ручного редактирования) |

### Lookups (для dropdown-ов) — `/api/v1/lookups`

| Method + Path | GAS |
|---|---|
| GET `/lookups/dyspozytor` | `getDyspozytorList` |
| GET `/lookups/planisci` | `getPlannerList` |
| GET `/lookups/opiekuni` | `getOpiekunList` |
| GET `/lookups/trailer-types` | `getNaczepyTypyList` (alias) |
| GET `/lookups/cert-types` | `getVehicleCertTypes` |

### External integrations — `/api/v1/integrations`

| Method + Path | GAS | Внешний API |
|---|---|---|
| GET `/integrations/vies/:country/:vat` | `viesLookup` | VIES |
| GET `/integrations/whitelist?nip=...&account=...` | `whiteListCheckAccount` | Biała Lista |
| GET `/integrations/inspection?vin=...` | `inspectionCheckLink` | info-car.pl URL builder |

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
| GET `/api/v1/openapi.json` | Swagger schema |
| GET `/api/v1/docs` | Swagger UI (только в non-prod) |

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
// POST /claims
type SubmitClaimRequest = {
  vehicleId: string;
  dateStart: string;       // ISO
  dateEnd: string;
  timeFrom: string;        // HH:MM
  timeTo: string;
  mileage: number;
  amountRequested: number;
  comment?: string;
  orderNumber?: string;
  orderDate?: string;
  plannerId: string;
  opiekunId: string;
};
type ClaimDto = {
  id: string;
  nrZgl: string;
  status: ClaimStatus;
  carrier: { id: string; name: string };
  vehicle: { id: string; plateNumber: string };
  dateStart: string;
  dateEnd: string;
  // ...все поля Claim
  breakdown: KmCalcBreakdown;
};

// POST /claims/:nrZgl/preview
type PreviewRequest = Pick<SubmitClaimRequest, 'vehicleId' | 'dateStart' | 'dateEnd' | 'mileage' | 'timeFrom' | 'timeTo'>;
type PreviewResponse = {
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  breakdown: KmCalcBreakdown;
};
```

### Update claim (verification)

```ts
// PATCH /claims/:nrZgl
type UpdateClaimRequest = {
  // редактируемые поля:
  dateStart?: string; dateEnd?: string;
  timeFrom?: string;  timeTo?: string;
  mileage?: number;
  amountApproved?: number;
  comment?: string;
  margin?: number;
  hoursAdjusted?: boolean;
  // решение:
  decision?: 'accept' | 'reject' | 'request-authorization';
  decisionReason?: string;
};
```

## Версионирование

- В URL: `/api/v1/...` (как сейчас планируется).
- Любое **breaking** изменение → новая версия `/api/v2/...`. Старая поддерживается 3 месяца (если нужна — на этапе миграции это вряд ли потребуется).
- Не-breaking (добавление полей в response, новые опциональные поля в request) — без bump версии.

## OpenAPI / типы

- `apps/api` генерит `openapi.json` из декораторов NestJS (`@ApiTags`, `@ApiResponse`, etc).
- `apps/web` потребляет типы напрямую из `@magtrans/shared` (Zod-схемы → infer types) — не генерит из OpenAPI, чтобы избежать сборочного шага. Контракт API ↔ frontend обеспечивается тем, что DTO в Nest и Zod-схемы в shared — это одни и те же объекты (controller валидирует через `ZodValidationPipe`, который читает схему из shared).

## Rate limiting

| Endpoint | Лимит |
|---|---|
| `/auth/login`, `/auth/verify-code` | 5 / минуту / IP |
| `/auth/resend-code` | 3 / 5 минут / sessionToken |
| `/integrations/vies/*` | 10 / минуту / IP (внешний API лимиты) |
| `/integrations/whitelist` | 10 / минуту / IP |
| `/claims/*/preview` | 30 / минуту / user |
| Остальные | 100 / минуту / user |

Реализация: `@nestjs/throttler` (`@Throttle()` декоратор + `ThrottlerGuard`).

## Idempotency

Для `POST /claims`, `POST /delegations` принимаем заголовок `Idempotency-Key: <uuid>`. Сохраняем (`{key, response}` в Redis на 24ч). Повторный запрос с тем же ключом → тот же response, без второго insert. Защищает от двойных кликов и retry клиента.

## Audit на уровне API

Все mutating endpoints автоматически логируются через `AuditInterceptor`. Сервис вызывает `@Audit('createCarrier', { targetKey: result.id })` или `@AuditTarget(req => req.params.id)` декоратор. Запись в `audit_log` идёт в той же транзакции, что и main change (через Prisma `$transaction`).

## Связь с GAS (legacy)

`Code.gs` + `index.html` — это **функциональный референс**, не работающий продакт. Никакого parallel-deployment, никакого cutover в смысле «переключить с одного на другое». После Фазы 10 (Launch — см. [17-migration-roadmap.md](17-migration-roadmap.md)) новое приложение работает само по себе. Legacy-файлы остаются в репо как историческая документация (или удаляются — решение в [18-launch-and-deployment.md](18-launch-and-deployment.md#что-делать-с-legacy-codegs--indexhtml)).
