# 25. План: трек B — слой permissions

> **Статус: B1 сделан 2026-10-23 (`2419bfc`); B2 сделан 2026-10-23 (`67f5a8b`…`94fbcff` + B2d), B3 следующий (план от 2026-09-14). Решения по открытым вопросам — §7; первый случай для B6 — в §3 B6.** Детализирует §3 из
> [24-sso-magspace-and-permissions-plan.md](24-sso-magspace-and-permissions-plan.md)
> по фактическому состоянию кода на `a50077c`. Где этот документ расходится с
> §3 docs/24, прав этот документ: §3 писался до инвентаризации.
>
> **Роли-лидеры (2026-09-25):** `lider_*` — не новые значения `Role`, а флаг
> `User.lider`; как он встраивается в B1 (`LIDER_PERMISSIONS`,
> `permissionsFor(role, lider)`), B2 и B6 — [28-lider-roles-plan.md](28-lider-roles-plan.md) §5.

## 0. Что меняется и что нет

**Цель.** У каждого права на действие появляются имя и **один источник**
(`packages/shared/src/permissions.ts`). Роль остаётся типом пользователя и
ключом data-scope. После трека B права роли меняются в одном файле, а не в
`@Roles` на 139 эндпоинтах, в ~15 сервисных проверках и в ~26 сравнениях
`role ===` в web.

**Инвариант.** Поведение системы не меняется ни для одной роли ни на одном
эндпоинте. Это не пожелание, а проверяемое свойство: см. тест эквивалентности
в B1.

**Не цель:**
- Scope — «какие строки видит пользователь» (`_scopeFilters`,
  `_assertCarrierAccessibleForWrite`, `OpiekunOwnershipGuard`,
  `CarrierOwnershipGuard`). Он завязан на структуру данных роли
  (`Carrier.opiekunId`, `User.teamId`, `Carrier.userId`) и остаётся на роли.
- Динамический RBAC с правами в таблицах БД.
- Смена того, **кто что может**. Любое такое изменение идёт отдельным PR с
  обновлением снапшота и docs/03.

**Зачем это нужно.** При 8 фиксированных ролях выгода от одного слоя
названий умеренная. Настоящая отдача появляется в B6: точечные права
конкретному человеку без смены роли. Сюда же ложатся ручные stanowiska из SSO
(`HANDEL_*`, `CONTROLLING`, см. docs/24 §10). B1–B5 делают B6 изменением в
одном месте, а не переписыванием всех проверок.

---

## 1. Фактическое состояние (инвентаризация 2026-09-14)

> Историческая инвентаризация на момент плана. С B1 (2026-10-23) актуальное
> состояние «эндпоинт → роли» — фикстура
> `apps/api/src/common/authz/__fixtures__/endpoint-roles.snapshot.json`
> (плюс `endpoint-ownership.snapshot.json` для `@OpiekunOwns` / `@CarrierOwns`);
> цифры ниже не обновляются.

### 1.1 API: `@Roles` на контроллерах

- **Эндпоинтов:** 139. Из них 10 `@Public` и 4 «любой залогиненный»
  (`GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`,
  `GET /trailer-types`). Остальные 125 закрыты `@Roles`: 108 декораторов
  в 24 контроллерах, часть висит на классе. В docs/24 §3 указано «122», это
  устаревшая цифра.
- **Guard:** `RolesGuard` (`modules/auth/guards/roles.guard.ts`) подключён
  глобально через `APP_GUARD` (`app.module.ts:148`). Ещё в 22 контроллерах
  стоит избыточный `@UseGuards(RolesGuard)`.
- **Уникальных наборов ролей всего 19.** Это и есть естественный каталог
  прав:

| Набор ролей | Эндпоинтов | Что это |
|---|---|---|
| `admin,opiekun` | 43 | carriers целиком, запись в vehicles/drivers/trailers, панель «Moja opieka», алерты, compliance, lookups сотрудников, VIES/Biała lista (info-car удалён 2026-10-22, минус 1 эндпоинт) |
| `admin` | 37 | users, teams, sso, limits, audit, diagnostics, запись trailer-types, `…/hard` (carriers, drivers, trailers, trailer-types), soft-delete carrier, `gps/refresh` |
| `przewoznik` | 8 | подача и превью wniosku, reklamacja, создание выезда, eligibility, `fleet/my`, `guarantee-*/me` |
| `admin,opiekun,przewoznik` | 8 | чтение drivers и trailers, их вложения |
| `admin,opiekun,planista,dyspozytor,przewoznik` | 7 | чтение vehicles и вложений, GPS |
| `weryfikator,admin` | 5 | km-board, `PUT`/`DELETE daily-km`, `in-transit`, `returned` |
| `admin,pracownik` | 5 | верификация и решение по wniosku, скриншот Maksima, dashboard |
| все, кроме `pracownik` | 4 | `GET /delegations(/:id)`, `GET /vehicles/km-report`, `GET /vehicles/:id/daily-km` |
| `admin,pracownik,opiekun,przewoznik` | 2 | `GET /claims(/:nrZgl)` — с 2026-10-22 `admin,pracownik,przewoznik`: opiekun не видит wnioski ни в каком виде |
| по 1 эндпоинту | 6 | `przewoznik,pracownik,admin` (превью существующего wniosku), `przewoznik,admin` (cancel выезда), `eksport,admin` (ready), `planista,admin`, `dyspozytor,admin`, `admin,pracownik,opiekun` (`lookups/carriers`) |

Полная таблица «метод + путь → роли» строится скриптом и в B1 становится
фикстурой.

### 1.2 API: проверки ролей внутри сервисов

Около 90 сравнений в 19 сервисах. Их три сорта, и трек B трогает только
первые два:

| Сорт | Пример | Что делаем |
|---|---|---|
| **Capability** — право, которого нет на контроллере | `claims.service.ts:1316`: повторная верификация в `OCZEKUJE_NA_AUTORYZACJE` только для admin (422 `CLAIM_VERIFY_ADMIN_ONLY`); `vehicles.service.ts:1078` `_scrubForViewer`: номер и PIN топливной карты видят admin/opiekun/przewoznik, ставки ещё и planista; такой же scrub ставок в модалке выезда | → именованное право (`claims.verify_pending_authorization`, `vehicles.fuel_card.read`, `vehicles.rates.read`) |
| **Дубль guard'а** — сервис повторяет `@Roles` | `opiekun.service.ts:28`, `guarantee-watchdog.service.ts:553,602`, `fleet.service.ts:167,422`, `lookups.service.ts:83,124` | → `can(user, p)` либо удалить, если это чистый дубль |
| **Scope** | `_scopeFilters` в 15 сервисах, `if (user.role === 'admin') return filters`, `plannerId: user.role === 'admin' ? undefined : user.sub` | **не трогаем** |

В PR B3 каждое место получает метку «capability / дубль / scope».

### 1.3 Web

| Где | Как устроено сейчас |
|---|---|
| `lib/roles.ts` | `ROLE_LANDING` и `ROLE_ALLOWED_PREFIXES` (панель = роль); `ADMIN_ONLY_EMPLOYEE_PREFIXES`: 8 путей внутри `/employee` |
| `middleware.ts:102,328` | Декодирует роль из JWT без проверки подписи и применяет `isAllowedForRole`. Это защита в глубину; решает API |
| `lib/nav.config.ts` | 19 пунктов с `roles: Role[]` и `filterNavForRole` |
| `lib/auth/server.ts:112` | `requireRoleAccess(allowed)`, 9 вызовов (layouts групп и несколько страниц) |
| `(employee)/employee/(admin)/layout.tsx:42` | `user.role !== 'admin'` |
| `components/claims/claim-permissions.ts` | `deriveClaimPermissions(status, role, mode)`: зеркало `_assertMayVerifyInStatus` |
| прочее | ~26 строгих сравнений `role ===` в 18 файлах; больше всего в employee `trailers`/`drivers` pages (по 6), `UserSheet`, `sso/page` |

### 1.4 Расхождения docs/03 с кодом

✅ **Решено 2026-09-14: код — истина, docs/03 выровнен в тот же день.** Таблица
ниже оставлена как запись того, что именно исправлено.

| docs/03 | Код |
|---|---|
| «Видеть выезды»: opiekun —, planista — | `GET /delegations(/:id)` пускает opiekun и planista (со scope) |
| «Видеть km-рапорт»: opiekun —, przewoznik — | `GET /vehicles/km-report` пускает обоих |
| «Запросить авторизацию у Maksima» (строка матрицы и таблица pracownik) | ручной флоу выпилен 2026-07-24, остался авто-гейт |
| pracownik «Видеть eksport-делегации» (таблица «Что может») | pracownik исключён из всех `@Roles` delegations (quirk #13) |
| eksport «Read-only» | `POST /delegations/:id/ready` (eksport, admin) |
| dyspozytor «🗓️ PLANNED Phase 11: Team не реализован» | Team реализован 2026-06-17 |
| GPS в матрице отсутствует | `GET /integrations/gps/*` для 5 ролей |
| §Multi-role (`alternateRoles`, переключатель панелей) | не реализовано; JWT несёт одну роль |

---

## 2. Каталог прав (предложение)

Назначение ролям выведено из таблицы 1.1 и сервисных capability 1.2.
Названия в формате `домен.действие`, snake_case внутри сегмента.

| Permission | admin | pracownik | opiekun | planista | dyspozytor | przewoznik | eksport | weryfikator | Покрывает |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `claims.read` | ✅ | ✅ | | | | ✅ | | | `GET /claims(/:nrZgl)`; opiekun убран 2026-10-22 (решение: opiekun не видит wnioski ни в каком виде) |
| `claims.submit` | | | | | | ✅ | | | `POST /claims`, `/claims/preview`, `/reklamacja` |
| `claims.verify` | ✅ | ✅ | | | | | | | `PATCH /claims/:nrZgl(/verification)`, скриншот Maksima (upload/download), `recalc-limits(/preview)`; `POST /claims/:nrZgl/preview` — any-of(`claims.submit`, `claims.verify`) |
| `claims.verify_pending_authorization` | ✅ | | | | | | | | сервис: `CLAIM_VERIFY_ADMIN_ONLY` |
| `dashboard.read` | ✅ | ✅ | | | | | | | `GET /diagnostics/dashboard` |
| `carriers.read` | ✅ | | ✅ | | | | | | `GET /carriers`, `GET /carriers/:id` |
| `carriers.write` | ✅ | | ✅ | | | | | | create/update/deactivate/reactivate/reset-password |
| `carrier_documents.read` | ✅ | | ✅ | | | | | | `GET /carriers/:id/attachments`, `…/:attachmentId/download`, `GET /carriers/:id/documents/overview` (выделено 2026-10-23 под первый случай B6) |
| `carrier_documents.add` | ✅ | | ✅ | | | | | | `POST /carriers/:id/attachments` |
| `carrier_documents.delete` | ✅ | | ✅ | | | | | | `DELETE /carriers/:id/attachments/:attachmentId`; перевозчику не выдаётся |
| `carriers.delete` | ✅ | | | | | | | | `DELETE /carriers/:id`, `…/hard` |
| `vehicles.read` | ✅ | | ✅ | ✅ | ✅ | ✅ | | | `GET /vehicles(/:id)`, вложения |
| `vehicles.rates.read` | ✅ | | ✅ | ✅ | | ✅ | ✅ | ✅ | сервис: scrub ставок (карточка машины, модалка выезда). eksport и weryfikator добавлены 2026-10-23 по факту кода: модалка выезда прячет ставки только от dyspozytora (docs/14 §6.4.1); карточку машины эти роли не открывают |
| `vehicles.fuel_card.read` | ✅ | | ✅ | | | ✅ | | | сервис: scrub топливной карты |
| `vehicles.planner_transfer.request` | ✅ | | ✅ | ✅ | | | | | `POST /vehicles/:id/planner-transfers`, `POST /planner-transfers/:id/cancel`, `GET /planner-transfers?scope=mine`; сервис: planista — только текущий планиста машины, cancel — только автор ([29](29-vehicle-planner-transfer-plan.md), добавлено 2026-09-28; admin — с 2026-10-23, docs/29 U1 переписан, свою заявку он не решает — R4). `GET /planner-transfers` и `GET /lookups/planisci/transfer-targets` — any-of(`.request`, `.decide`) |
| `vehicles.planner_transfer.decide` | ✅ | | | lider | | | | | `POST /planner-transfers/:id/{approve,reject}`, `GET /planner-transfers?scope=decide`; planista — через `LIDER_PERMISSIONS.planista`; сервис: лидер **этого** `fromPlanner`, не автор и не получатель (`planner-transfer.rules.ts`) |
| `vehicles.planner_history.read` | ✅ | | ✅ | ✅ | | | | | `GET /vehicles/:id/planner-history`; сервис: opiekun — свой перевозчик, planista — текущий планиста или его лидер |
| `drivers.read` | ✅ | | ✅ | | | ✅ | | | `GET /drivers*`, вложения |
| `trailers.read` | ✅ | | ✅ | | | ✅ | | | `GET /trailers*`, вложения |
| `fleet.write` | ✅ | | ✅ | | | | | | запись и soft-delete vehicles/drivers/trailers и их вложений |
| `fleet.hard_delete` | ✅ | | | | | | | | `DELETE /{drivers,trailers}/:id/hard` (у vehicles hard-delete выведен из API) |
| `gps.read` | ✅ | | ✅ | ✅ | ✅ | ✅ | | | `GET /integrations/gps/*` |
| `gps.refresh` | ✅ | | | | | | | | `POST /integrations/gps/refresh` |
| `delegations.read` | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `GET /delegations(/:id)` |
| `delegations.create` | | | | | | ✅ | | | `POST /delegations`, `GET /delegations/eligibility` |
| `delegations.cancel` | ✅ | | | | | ✅ | | | `POST /delegations/:id/cancel` (свой/любой — scope) |
| `delegations.mark_ready` | ✅ | | | | | | ✅ | | `POST /delegations/:id/ready` (+ откат) |
| `delegations.transit` | ✅ | | | | | | | ✅ | `in-transit`, `returned` |
| `km.read` | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `GET /vehicles/km-report`, `GET /vehicles/:id/daily-km` |
| `km.verify` | ✅ | | | | | | | ✅ | `GET /vehicles/km-board`, `PUT`/`DELETE daily-km` |
| `panel.opiekun` | ✅ | | ✅ | | | | | | `/fleet/opiekun`, `/opiekun/carriers`, `/alerts`, `/guarantee-compliance`, `/guarantee-episodes` |
| `panel.planista` | ✅ | | | ✅ | | | | | `/fleet/planista` |
| `panel.dyspozytor` | ✅ | | | | ✅ | | | | `/fleet/dyspozytor` |
| `panel.carrier` | | | | | | ✅ | | | `/fleet/my`, `/guarantee-*/me` |
| `lookups.staff` | ✅ | | ✅ | | | | | | `/lookups/{dyspozytor,opiekuni,planisci,teams}` |
| `lookups.carriers` | ✅ | ✅ | ✅ | | | | | | `/lookups/carriers` |
| `integrations.external` | ✅ | | ✅ | | | | | | VIES, Biała lista (оба); info-car удалён решением 2026-10-22 |
| `users.manage` | ✅ | | | | | | | | `/users*`, `/lookups/users`, `/lookups/planisci/liders` |
| `sso.manage` | ✅ | | | | | | | | `/sso/*` |
| `teams.manage` | ✅ | | | | | | | | `/teams*` |
| `trailer_types.manage` | ✅ | | | | | | | | запись `/trailer-types*`, включая `DELETE /trailer-types/:id/hard` (не `fleet.hard_delete`) |
| `limits.manage` | ✅ | | | | | | | | `/limits*` |
| `audit.read` | ✅ | | | | | | | | `GET /audit` |
| `diagnostics.manage` | ✅ | | | | | | | | `/diagnostics/{db,mails,claims}`, resend |
| `bugbot.submit_idea` | ✅ | | | | | | | | сервис: `kind=idea` в BugBot handoff (`bugbot-handoff.service.ts`); сам `GET /integrations/bugbot/handoff` — `AUTHENTICATED` |

Итого **42 права** (B1, 2026-10-23; в плане было 38). Источник истины —
`packages/shared/src/permissions.ts`, сверка с реальными `@Roles` —
`apps/api/src/common/authz/endpoint-permissions.ts` + фикстуры. Замечания:

- **admin ≠ «все права».** Сегодня admin **не** проходит на эндпоинты,
  доступные только перевозчику (`claims.submit`, `delegations.create`,
  `panel.carrier`). Матрица это сохраняет, а тест эквивалентности не даст
  «упростить» до `admin: PERMISSIONS`. (Исключение для
  `vehicles.planner_transfer.request` снято 2026-10-23: admin подаёт заявки
  на передачу машины, docs/29 U1.)
- **`panel.*` — по сути роли под другим именем.** Это честная плата за
  единообразие guard'а. Схлопывать их в `role` не надо: B6 может выдать,
  например, `panel.opiekun` админу-наблюдателю без смены роли, но только
  вместе со scope (см. B6).
- **`GET /trailer-types`** остаётся «любой залогиненный» (справочник для форм)
  и уходит в allowlist `AUTHENTICATED_ONLY` с причиной.
- **`claims.verify` не делится на verify/decide.** Сегодня у них одинаковые
  роли. Если понадобится развести, это одно изменение в каталоге.
- **Лидеры** ([docs/28](28-lider-roles-plan.md), реализовано 2026-09-25) —
  флаг `User.lider` над пятью ролями (`LIDER_ROLES` в shared), не колонка
  матрицы. В каталог входит как
  `LIDER_PERMISSIONS: Partial<Record<LiderRole, readonly Permission[]>>`
  (на старте только `planista: ['vehicles.planner_transfer.decide']`) и
  `permissionsFor(role, lider = false) =
  ROLE_PERMISSIONS[role] ∪ (lider ? LIDER_PERMISSIONS[role] ?? [] : [])`;
  тест: `permissionsFor(r, true) ⊇ permissionsFor(r, false)` — лидер только
  добавляет. В сгенерированной матрице под-строка «+ lider» появляется только
  у непустых. **Фикстура B1 снимается с `@Roles`, который лидера не знает**:
  эндпоинты решения по передаче стоят на `@Roles('admin','planista')` и в
  фикстуре записаны как `["admin","planista"]`. Правило эквивалентности
  (решение 2026-10-23): роль считается допущенной, если требование
  удовлетворяет `permissionsFor(r, true)`; «именно лидер этого планисты»
  по-прежнему проверяет сервис. Scope лидера (если понадобится) живёт
  **внутри** ветки базовой роли — это по-прежнему «scope на роли».
- **Передача машин** ([docs/29](29-vehicle-planner-transfer-plan.md),
  2026-09-28) — первое лидерское право. Сделана **до** трека B и без
  `LiderGuard`: эндпоинты решения стоят на `@Roles('admin','planista')`, а
  «лидер именно этого планисты» проверяет сервис по ресурсу — ни `@Roles`, ни
  permission это не выразят. В B1 это даёт три строки каталога
  (`vehicles.planner_transfer.request|decide`, `vehicles.planner_history.read`)
  и первое непустое `LIDER_PERMISSIONS.planista = ['vehicles.planner_transfer.decide']`;
  ресурсная проверка в сервисе остаётся. Кандидат из docs/28 §1
  `vehicles.reassign_planner` **отменён**: прямой смены планисты нет ни у
  кого, включая admin и лидера (docs/29 R1).

---

## 3. Этапы

### B1. Каталог и снапшот (≈ 0.5–1 день; docs/03 уже выровнен)

**Порядок важен:** снапшот снимается **до** любой замены в контроллерах.

| Что | Где |
|---|---|
| `PERMISSIONS`, `type Permission`, `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`, `LIDER_PERMISSIONS`, `permissionsFor(role, lider)`, `hasPermission`, `hasAnyPermission`. Чистый TS, только type-only импорты `Role`/`LiderRole` (без zod в рантайме): импортируется и API, и web, и edge-middleware. Отдельный модуль `permissions-matrix.ts` (не в barrel) рендерит markdown-матрицу с описаниями | `packages/shared/src/permissions.ts` (+ экспорт из index), `packages/shared/src/permissions-matrix.ts` |
| Генератор снапшота: обходит контроллеры через `DependenciesScanner` (`common/testing/route-discovery.ts`, перенесён из `common/audit/testing/` в B1; провайдеры не инстанцируются — без БД/Redis) + `Reflector.getAllAndOverride([handler, class])` как в `RolesGuard`; пишет `{ "GET /claims": ["admin","pracownik","przewoznik"], "POST /auth/login": "PUBLIC", "GET /auth/me": "AUTHENTICATED", … }` с отсортированными ключами (`AUTHENTICATED` = нет `@Roles` или пустой, как guard пропускает). Запускается под Jest; перезапись фикстур только при `AUTHZ_SNAPSHOT_UPDATE=1` (`npm run authz:snapshot`) | `apps/api/src/common/authz/roles-snapshot.ts` + `roles-snapshot.spec.ts` |
| Фикстуры (коммитятся): роли по эндпоинтам и, вторая, какие роуты несут `@OpiekunOwns` / `@CarrierOwns` — чтобы B2 не потерял ownership-guard при замене декораторов | `apps/api/src/common/authz/__fixtures__/endpoint-roles.snapshot.json`, `endpoint-ownership.snapshot.json` |
| `tests/permissions.test.ts`: каждое право назначено хотя бы одной роли; нет неизвестных строк; `permissionsFor(r, true) ⊇ permissionsFor(r, false)`; для каждой строки фикстуры каталог воспроизводит ровно тот же набор ролей (с правилом лидера, см. §2); блок между маркерами `<!-- authz:matrix:start/end -->` в docs/03 равен `renderPermissionMatrix()` (`npm run authz:matrix` печатает его) | `packages/shared` |
| docs/03: подраздел «Каталог прав (генерируется)» между маркерами; рукописная матрица действий со scope-пометками остаётся | `docs/03-roles.md` |

Runtime-изменений ноль, PR можно мержить отдельно.

### B2. API: guard и контроллеры (≈ 1.5 дня)

> **Сделано 2026-10-23 — B2 целиком** (`67f5a8b` B2.0, `ac89f10` 2a, `f31459f` 2b,
> `94fbcff` 2c, + B2d). Все 24 контроллера на `@RequirePermission`, живого `@Roles`
> нет. Переведено 135 роутов — ровно строки `ENDPOINT_PERMISSIONS`: 2a — 20 (claims,
> claim-attachments, delegations), 2b — 65 (carriers, carrier-attachments, vehicles,
> drivers, trailers, fleet, gps, opiekun, alerts, guarantee-watchdog), 2c — 50 (users,
> teams, sso, limits, audit, diagnostics, trailer-types, lookups, vies, white-list,
> planner-transfers; `GET /trailer-types` остаётся в `AUTHENTICATED_ONLY`). Убрано 23
> избыточных `@UseGuards(RolesGuard)` (3 + 10 + 10); ownership-guards и их порядок не
> тронуты. В B2.0 на `makeAuthUser` / `withRole` переехали 72 места в spec-файлах.
> Обе фикстуры B1 байт-в-байт после каждого шага. B2d: inverse-правило фаза 2
> (`@Roles` больше не решение об авторизации), живое `@RequirePermission` =
> `ENDPOINT_PERMISSIONS` в обе стороны и проверка, что `@Roles`-метаданных нет ни на
> одном живом классе или хендлере (`rolesMetadataSites` в `roles-snapshot.ts`;
> единственные пользователи `@Roles` до B5 — синтетические контроллеры
> `snapshot-builders.spec`). `RolesGuard` остаётся зарегистрированным no-op'ом до B5.
> Принятое следствие правила лидера (planista без флага на `approve`/`reject`) — в
> строке «Тест эквивалентности» ниже; кроме него runtime-поведение не изменилось.

> **B2.0 сделан 2026-10-23** (инфраструктура, ни один контроллер не переведён; обе
> фикстуры B1 байт-в-байт). `@RequirePermission` (кортеж ≥ 1 права) +
> `PERMISSIONS_METADATA_KEY`; глобальный `PermissionsGuard` после `RolesGuard`
> (порядок проверок — docs/15 §Roles & Guards; 403-сообщения общие с
> `RolesGuard`, `FORBIDDEN_*_MESSAGE` в `auth.constants.ts`);
> `AuthUser.permissions` **обязательное** поле, заполняется в
> `JwtAccessStrategy.validate`; `common/authz/can.ts` (`can`, `canAny`);
> `common/testing/make-auth-user.ts` (`makeAuthUser`, `withRole` для копий
> вида `{ ...user, role }`) — на фабрику переехали 72 места в 45 spec-файлах
> (48 типизированных литералов, 21 копия со сменой роли, 3 пользователя из
> заголовка в supertest-спеках vies / white-list / bugbot, которые теперь
> регистрируют и `PermissionsGuard`). Генератор снапшота читает
> `@RequirePermission` (`rolesSatisfying(…, { lider: true })`); противоречия:
> оба декоратора, `@Public` + `@RequirePermission`, пустое или некаталожное
> требование. `endpoint-permissions.spec`: живое `@RequirePermission` =
> `ENDPOINT_PERMISSIONS[route]` (пока пусто) и inverse-правило фаза 1
> (`@Roles` **или** `@RequirePermission` **или** `AUTHENTICATED_ONLY`; фаза 2
> без `@Roles` — в B2d).

| Что | Где |
|---|---|
| **Сделано (B2.0).** `@RequirePermission(...perms)`: any-of, как `@Roles` | `modules/auth/decorators/require-permission.decorator.ts` |
| **Сделано (B2.0).** `AuthUser.permissions: ReadonlySet<Permission>` — считается **один раз** в `JwtAccessStrategy.validate` (пользователь и так перечитывается из БД на каждом запросе) из пары `(user.role, user.lider)` — `lider` уже в `AuthUser` с 2026-09-25 (docs/28, DB-sourced). Отсюда B6 возьмёт overrides, не трогая guard и сервисы. Фикстура B1 при этом не меняется: `@Roles` лидера не знает | `modules/auth/strategies/*`, `decorators/current-user.decorator.ts` |
| **Сделано (B2.0).** `can(user, p)` — тонкий помощник для сервисов | `common/authz/can.ts` |
| **Сделано (B2.0).** `PermissionsGuard` глобально, после `RolesGuard` (`APP_GUARD`). Порядок проверок: `@Public` → пропуск (на `POST /auth/refresh` в `req.user` лежит refresh-payload без `permissions`); нет метаданных → пропуск (переходный период, как `RolesGuard` сегодня); метаданные есть, а `req.user.permissions` нет → 403, fail closed, из роли не пересчитывать; иначе any-of. Оба декоратора на одном роуте — красный тест (не рантайм). Эндпоинт несёт **либо** `@Roles`, **либо** `@RequirePermission` | `modules/auth/guards/permissions.guard.ts`, `app.module.ts` |
| **Сделано (B2.0).** `makeAuthUser(role, overrides?)` — тестовая фабрика, строит `permissions` через `permissionsFor`; в B2.0 на неё (и на `withRole`) переехали 72 места в 45 spec-файлах — 48 типизированных литералов `AuthUser`, 21 копия со сменой роли, 3 пользователя из заголовка в supertest-спеках (нужна уже здесь, не в B3) | `common/testing/make-auth-user.ts` |
| **Сделано (B2.0).** Генератор снапшота из B1 учится читать `@RequirePermission`: роли = `rolesSatisfying(required, { lider: true })`; роут с обоими декораторами — ошибка. Без этого первый же переведённый контроллер ломает `roles-snapshot.spec`, а `AUTHZ_SNAPSHOT_UPDATE=1` тихо записал бы его как `AUTHENTICATED` | `common/authz/roles-snapshot.ts` |
| **Сделано (B2a–B2c: 20 + 65 + 50 роутов).** Замена `@Roles` → `@RequirePermission` по `endpoint-permissions.ts`, модуль за модулем. Заодно убрать 23 избыточных `@UseGuards(RolesGuard)` (22 файла, в lookups два на методах); в 8 из них рядом стоят ownership-guards — их порядок не трогать | 24 контроллера |
| **Сделано (B2.0–B2d).** **Тест эквивалентности**: для каждого эндпоинта `роли(metadata) = ROLES.filter(r => hasAnyPermission(r, required, /* lider */ true))` (или роли из `@Roles`, пока он не заменён) и сравнение с фикстурой из B1. Правило лидера (2026-10-23): роль допущена, если её лидерский вариант удовлетворяет требованию — иначе `approve`/`reject` передачи дали бы `["admin"]` вместо `["admin","planista"]` из фикстуры. Следствие, принято в B2c (2026-10-23): planista **без** флага лидера на `approve`/`reject` теперь получает 403 от `PermissionsGuard` до сервиса (общее «Brak uprawnień dla tej roli» вместо кода `PLANNER_TRANSFER_NOT_DECIDER`); статус тот же, web это действие ему не показывает, случай закреплён тестом. Любое расширение или сужение — красный тест. Вторая фикстура: ownership-декораторы на месте. Не новый файл, а расширение `roles-snapshot.spec.ts` и `endpoint-permissions.spec.ts` из B1 | `common/authz/*.spec.ts` |
| **Сделано (фаза 1 — B2.0, фаза 2 — B2d).** **Inverse-правило**: каждый не-`@Public` эндпоинт обязан нести `@RequirePermission` или быть в `AUTHENTICATED_ONLY` с причиной. Новый роут без решения об авторизации не проходит CI (родственник audit-coverage spec из аудита логов, п. 18) | тот же spec |
| **Сделано (B2.0–B2c).** Spec-файлы, проверяющие метаданные `@Roles`, переписать на permission: vehicles, drivers, delegations, claims (`claims.controller.roles.spec`), planner-transfers, carrier-attachments, bugbot (утверждает отсутствие метаданных); supertest-спеки vies, white-list, `sso.controller.audit` регистрируют `RolesGuard` как `APP_GUARD` и подсовывают пользователя без `permissions` — им нужен `makeAuthUser` | соответствующие `*.spec.ts` |

Ownership-guards (`@OpiekunOwns`, `@CarrierOwns`) не меняются.

### B3. API: capability-проверки в сервисах (≈ 1 день)

| Место | Замена |
|---|---|
| `claims.service.ts:1316` `_assertMayVerifyInStatus` | `can(user, 'claims.verify_pending_authorization')` |
| `vehicles.service.ts:1078` `_scrubForViewer` | `vehicles.fuel_card.read` / `vehicles.rates.read` |
| scrub ставок в модалке выезда (`delegations.service.ts`) | `vehicles.rates.read` |
| Дубли guard'ов: `opiekun.service.ts:28`, `guarantee-watchdog.service.ts:553,602`, `fleet.service.ts:167,422`, `lookups.service.ts:83,124` | разобрать каждый: `can()` либо удалить с комментарием «покрыто guard'ом» |
| Ловушка: `claims.service.ts:2194` `_assertClaimReadable` и `:3185` `_scopeListFilters` выглядят как capability (`admin \|\| pracownik → return`), но это **scope** («видит все wnioski») | не трогать, пометить `// scope:` |
| Всё, что осталось с `user.role` | должно быть scope — пометить комментарием `// scope:` |

Проверка: полный api-сьют зелёный без правок ожиданий, кроме замены
моков `AuthUser` (добавится `permissions`). Тестовая фабрика
`makeAuthUser(role)` строит набор прав через `permissionsFor(role)`.

### B4. Web (≈ 1–1.5 дня)

| Что | Как |
|---|---|
| `GET /auth/me` отдаёт `permissions: Permission[]` (эффективные, с B6 — с overrides) | API + `lib/api/auth.ts` |
| `useCan(p)` (client) и `requirePermission(p)` (server) | `lib/hooks/useCan.ts`, `lib/auth/server.ts` |
| `nav.config.ts`: `roles` → `permission`; `filterNavForRole` → `filterNav(permissions)` | |
| `lib/roles.ts`: `ADMIN_ONLY_EMPLOYEE_PREFIXES` → `PATH_PERMISSIONS: Record<prefix, Permission>`. `ROLE_LANDING` и `ROLE_ALLOWED_PREFIXES` остаются: панель — это роль | |
| `middleware.ts`: edge видит только роль из JWT, поэтому гейтит по `permissionsFor(role)`, **без overrides**. Это грубая защита в глубину; точная проверка — в layout/page через `requirePermission` | см. риск R3 |
| `(admin)/layout.tsx`: вместо `role !== 'admin'` — «есть хотя бы одно admin-право»; каждая страница группы проверяет своё право | |
| `claim-permissions.ts`: `isAdmin` → `can('claims.verify_pending_authorization')` | |
| ~26 сравнений `role ===` в 18 файлах: capability (показать кнопку hard-delete, колонку ставок) → `useCan`; scope (`isOpiekun` для загрузки «Moja opieka», скрытие фильтра по опекуну) → оставить роль | список в PR |

### B5. Зачистка и документация (≈ 0.5 дня)

- Удалить `@Roles`, `RolesGuard`, `ROLES_METADATA_KEY`; фикстура из B1
  остаётся замороженным контрактом.
- docs/15 §Roles & Guards — переписать под permissions; docs/13 — колонка
  «permission» у эндпоинтов (генерируется тем же скриптом); docs/24 §3 —
  ссылка сюда; комментарий `sso.controller.ts:4-5` («после трека B …») закрыть.
- docs/03 §Multi-role: убрать `alternateRoles` как нереализованное (или
  явно пометить «не планируется»), комментарий в `RolesGuard` уходит вместе
  с ним.

### B6 (позже, под первый реальный запрос). Точечные права пользователю

Это и есть отдача трека (docs/24 §8 в.1). Делается **под конкретный случай**,
но B2/B4 уже подготовили точку расширения.

> **Первый реальный случай (решение 2026-10-23).** Выбранный admin'ом
> перевозчик видит документы своей фирмы так, как их видит opiekun (вкладка
> «Dokumenty»: документы фирмы + обзор документов флота), и может **только
> загружать новые файлы** — не удалять, не заменять, не править даты.
> Выдаётся **точечно**, не всем перевозчикам. В каталоге это три права
> `carrier_documents.read` / `.add` / `.delete` (admin и opiekun — по роли,
> przewoznik — ничего по роли); в `GRANTABLE_EXTRA.przewoznik` попадают
> только `.read` и `.add`. Scope у перевозчика уже есть («свой перевозчик»,
> `@CarrierOwns`), поэтому право без scope не возникает. Web: страница
> `/carrier/dokumenty` на той же вкладке, без кнопки удаления; пункт меню —
> только по праву. Приёмка: перевозчик с правом загружает и не может удалить,
> перевозчик без права не видит вкладки и получает 403.

| Что | Решение |
|---|---|
| Хранение | `User.extraPermissions String[]` и `User.deniedPermissions String[]` (text[]); валидация Zod по `PERMISSIONS` на записи, неизвестные строки на чтении игнорируются с warn. **Нужны оба** (решение 2026-09-14): и добавить право сверх роли, и отозвать право у конкретного человека |
| Вычисление | `JwtAccessStrategy.validate`: `(permissionsFor(role, lider) ∪ extraPermissions) − deniedPermissions` → `AuthUser.permissions` (`lider` — флаг лидера, docs/28). Отзыв побеждает добавление. Guard, сервисы и `/auth/me` не меняются |
| Защита от «отзыв ломает поток» | Отзыв сам по себе безопасен для данных (доступ только сужается), но может оставить бессмысленный экран: например, `claims.verify` без `claims.read`. `DEPENDENT_PERMISSIONS` в shared — при отзыве базового права UI предупреждает и предлагает отозвать зависимые; API не падает, просто отвечает 403 |
| Защита от «capability без scope» | `GRANTABLE_EXTRA: Partial<Record<Role, Permission[]>>` в shared — какие права можно добавить какой роли. Пример запрета: `planista` + `claims.verify` бессмысленно (нет ветки в scope wniosków). Нарушение → 422 на API и CHECK-подобная проверка в сервисе |
| UI | `UserSheet`: блок «Uprawnienia indywidualne» — «Dodatkowe» (чекбоксы из `GRANTABLE_EXTRA[role]`) и «Odebrane» (чекбоксы из `permissionsFor(role)`). Для `managedBy = magspace` оба поля редактируемые: reconcile их не трогает |
| Audit | `user.permissionsChanged` с before/after |
| Edge | middleware не знает overrides → человек с extra-правом на admin-страницу получит bounce на edge. Решение в B6: для путей из `PATH_PERMISSIONS` edge пропускает запрос на layout (точная проверка там), а не отказывает |
| Смена роли | extra-права, не входящие в `GRANTABLE_EXTRA[newRole]`, и denied-права, которых нет в `permissionsFor(newRole)`, сбрасываются с audit-строкой (как `roleOverride` при переходе в `local`, docs/24 §9 п.8) |

Оценка B6: ≈ 2–2.5 дня (db + api + web + docs; отзыв добавляет UI и зависимости прав).

---

## 4. PR и порядок

```
PR-B1  shared/permissions + snapshot-фикстура + docs/03 выровнен      (runtime: 0)
PR-B2  PermissionsGuard + AuthUser.permissions + контроллеры          (коммиты: B2.0 инфраструктура без контроллеров → 2a claims/claim-attachments/delegations → 2b carriers/carrier-attachments/vehicles (включая km-board, km-report, daily-km)/drivers/trailers/fleet/gps/opiekun/alerts/guarantee-watchdog → 2c users/teams/sso/limits/audit/diagnostics/trailer-types/lookups/vies/white-list/planner-transfers → 2d ужесточение inverse-правила + docs)
PR-B3  сервисные capability-проверки
PR-B4  web
PR-B5  зачистка @Roles/RolesGuard + docs
—      B6 по запросу
```

Каждый PR независимо зелёный: typecheck, api и web тесты, тест эквивалентности.
Между B2 и B5 оба guard'а живут, и это безопасно: на эндпоинте только один
из двух декораторов, а inverse-правило ловит эндпоинт вообще без авторизации.

**Зависимость от аудита логов:** ✅ снята — `audit-coverage.spec.ts` и
`audit-coverage.inverse.spec.ts` (п.18) уже в main. Исходная формулировка: B2 расширяет coverage-spec, который
вводится в рамках п.18 аудита. Делать B2 после его мержа, чтобы не конфликтовать
в `common/audit/testing/`.

## 5. Оценка

| Этап | Дни |
|---|---|
| B1 каталог + снапшот + docs/03 | 1 |
| B2 guard + 125 эндпоинтов + тест эквивалентности | 1.5 |
| B3 сервисы | 1 |
| B4 web | 1–1.5 |
| B5 зачистка + docs | 0.5 |
| **Итого B1–B5** | **≈ 5–5.5** (в docs/24 было 4: не учитывались сервисные capability, снапшот и расхождения docs/03) |
| B6 точечные права: добавление + отзыв (под первый запрос) | 2–2.5 |

## 6. Риски

| # | Риск | Митигация |
|---|---|---|
| R1 | Тихое расширение/сужение доступа при механической замене | Тест эквивалентности против фикстуры, снятой до замены |
| R2 | Новый эндпоинт без решения об авторизации (сегодня `RolesGuard` без метаданных = «пропустить») | Inverse-правило: `@RequirePermission` или `AUTHENTICATED_ONLY` с причиной |
| R3 | Edge-middleware не знает overrides (B6) и отбивает легитимный доступ | B4 гейтит на edge только грубо, точная проверка в layout; в B6 edge не отказывает по `PATH_PERMISSIONS` |
| R4 | Capability без scope: право выдано, данных нет (пустые экраны) или, хуже, scope-ветка отсутствует и сервис падает в «видит всё» | `GRANTABLE_EXTRA` в B6; в B3 каждый `user.role` помечается `// scope:` — видно, где у роли нет ветки |
| R5 | docs/03 разъезжается с кодом снова | Матрица в docs/03 и колонка в docs/13 **генерируются** из `ROLE_PERMISSIONS` |
| R6 | Конфликт с параллельной работой в контроллерах | PR-B2 по модулям; мержить после аудита логов (п.18) |

## 7. Решения (2026-09-14)

| # | Вопрос | Решение |
|---|---|---|
| 1 | Расхождения docs/03 ↔ код | **Код — истина**; docs/03 выровнен 2026-09-14 |
| 2 | B6 сейчас или под запрос | **Под первый реальный запрос.** B2/B4 всё равно закладывают `AuthUser.permissions` и `/auth/me.permissions` |
| 3 | Только добавление прав или и отзыв | **Нужен и отзыв** — B6 проектируется с `extraPermissions` и `deniedPermissions` |

Открытых вопросов нет.
