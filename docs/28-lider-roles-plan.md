# 28. План: роли-лидеры (`lider_*`) поверх восьми ролей

> **Статус: L1–L4 РЕАЛИЗОВАНЫ (2026-09-25).** Отступления реализации от текста
> ниже — §9 (читать её раньше плана: в ~20 местах сделано иначе, и намеренно).
> Что теперь описывает поведение системы: [03-roles.md](03-roles.md) §«Лидеры»,
> [13-api-design.md](13-api-design.md) (Users, SSO, Lookups, «Формат ответов»),
> [12-database-schema.md](12-database-schema.md), [16](16-jobs-and-integrations.md)
> §reconcile, [19](19-known-quirks.md) #14. Этот документ остаётся записью
> решений и обоснований.
>
> Сверен с [25-permissions-layer-plan.md](25-permissions-layer-plan.md) (трек B,
> не начат) и [24-sso-magspace-and-permissions-plan.md](24-sso-magspace-and-permissions-plan.md)
> §10 по коду на `dfcc4ee`. Кейс-инициатор — передача машины другому планисте
> с апрувом лидера. Сам механизм передачи здесь **не проектируется** — только
> роли, так, чтобы ни он, ни трек B потом ничего не переделывали.

## 0. Запрос и решение

Запрос: пять «ролей» — `lider_planista`, `lider_dyspozytor`, `lider_daf`
(лидер opiekunów), `lider_pracownik`, `lider_eksport`. Первый и пока
единственный сценарий: планиста просит отдать машину другому планисте, лидер
апрувит; лидер может переназначить сам в любой момент.

**Решение: лидер — не новое значение `enum Role`, а флаг `User.lider`
над пятью существующими ролями.** `lider_planista` = `role: planista` +
`lider: true`. Тип пользователя, scope, панель и все `@Roles` — от базовой
роли; лидерство добавляет права (и в будущем расширяет scope **внутри** ветки
базовой роли).

Почему не пять новых значений enum:

| Критерий | A. Пять новых значений `Role` | B. Флаг `User.lider` (выбрано) |
|---|---|---|
| Модель docs/25 («роль = тип пользователя + ключ scope, право = отдельный слой») | Противоречит: лидер — тот же тип с теми же данными (`plannerId`, `teamId`, `opiekunId`) | Совпадает: лидер = права над типом |
| `@Roles` (124), scope-ветки (88 сравнений в 17 сервисах), `Record<Role,…>` в web (`ROLE_LANDING`, `ROLE_ALLOWED_PREFIXES`, `ROLE_VARIANT`), `KNOWN_ROLES` в middleware, `SELECTABLE_ROLES`/`FILTERABLE_ROLES`, `UserRow.role`, i18n `roles.*`, ~27 `role ===` в web | Каждое место, где есть `planista`/`dyspozytor`/`opiekun`/`pracownik`/`eksport`, надо расширить; пропуск = дыра или 403 | 0 изменений |
| Что случается при пропуске (реальные fall-through в коде) | `OpiekunOwnershipGuard` пропускает любую не-`opiekun` роль → `lider_opiekun` **обходит ownership**; `DelegationsService._scopeListFilters` и `VehicleDailyKmService._resolveReportScope` → 403; `VehiclesService._assertRole(plannerId, 'planista')` → лидера нельзя поставить планистой машины; `TeamsService` (`role !== 'dyspozytor'`) → лидера нельзя добавить в команду; `lookups/planisci` → лидера нет в пикерах | Нет: лидер остаётся `planista` и везде проходит как `planista` |
| Снапшот B1 и каталог прав (docs/25 §2–3) | Меняет 40+ наборов ролей **до** снапшота; каталог ×13 колонок; риск R1/R4 из docs/25 §6 | Снапшот не меняется; `LIDER_PERMISSIONS` — надстройка над `ROLE_PERMISSIONS` |
| SSO-маппинг | `PLANISTA_LIDER → lider_planista` одним select-ом | Колонка `lider` в маппинге |
| Оценка | ≈ 5–6 дней + постоянный налог: каждый новый `Record<Role>` — 13 строк | ≈ 3–3.5 дня |

Имена из запроса остаются языком обсуждения и UI-лейблами; в данных это пара
`(role, lider)`. Вариант «флаг только ручной, без колонки в маппинге» (минус
≈ 0.5 дня) отброшен: `PLANISTA_LIDER` в MAGSpace переставало бы что-либо
значить, а понижение в должности не снимало бы лидерство.

---

## 1. Что означает флаг

| Аспект | Откуда |
|---|---|
| Тип пользователя, scope, ownership | Базовая роль. **До фичи передачи лидер видит ровно то же, что базовая роль** — инвариант docs/25 §0 («поведение не меняется ни для одной роли») сохраняется, этот план можно мержить в любой момент |
| Права | `LIDER_PERMISSIONS[role]` в каталоге docs/25 §2 — появляется в B1, на старте пустой. Первые кандидаты (после отдельного плана передачи машин): `vehicles.transfer.request` (planista), `vehicles.transfer.approve`, `vehicles.reassign_planner` (лидер) |
| Панель, landing, nav, edge-гейтинг | Базовой роли. Новых route-groups нет |
| UI-лейбл | `roles.lider.<role>`: PL «Lider planistów», «Lider dyspozytorów», «Lider DAF», «Lider opiekunów wniosków», «Lider eksportu»; EN «Planners lead», «Dispatchers lead», «DAF lead», «Claims-caretakers lead», «Export lead». Базовый `roles.<role>` не меняется |
| Для каких ролей допустим | `LIDER_ROLES = ['planista', 'dyspozytor', 'opiekun', 'pracownik', 'eksport']`. `admin` — не нужен (всё может), `przewoznik` — не сотрудник, `weryfikator` — не запрошен (добавить = одна строка в `LIDER_ROLES` + правка CHECK) |
| Инвариант | `lider = true ⇒ role ∈ LIDER_ROLES`. Закрепляется в трёх местах, как `AssignableRole` сегодня: Zod (сообщение), сервис (частичный PATCH), CHECK в БД (гарантия) |
| JWT | В payload **не кладём** — edge-гейтинг от лидера не зависит. В `AuthUser` и `/auth/me` — из БД, тем же путём, что `teamId` |

---

## 2. Откуда берётся флаг — те же правила владения, что у `role`

| Учётка | Кто пишет `lider` |
|---|---|
| `managedBy = magspace`, `roleOverride IS NULL` | Маппинг: `StanowiskoRoleMapping.lider`. Синхронизируется при входе (`provisionOrSync`) и reconcile; в админке read-only, как `role` |
| `managedBy = magspace`, `roleOverride` задан («Nadaj dostęp» или UserSheet) | Admin. Reconcile не трогает, как `role`. Так выдаются лидер DAF (в MAGSpace нет `DAF_LIDER`), лидер opiekunów wniosków и лидер eksportu — те же роли, что и сегодня выдаются руками (docs/24 §10) |
| `managedBy = local` | Admin |

Переходы: `magspace → local` — `lider` остаётся (теперь принадлежит админке,
как `role`); `local → magspace` — на следующем sync применится маппинг, если
override не задан.

Seed маппинга (docs/24 §10 дополняется): `PLANISTA_LIDER → planista + lider`,
`DYSPOZYTOR_KIEROWNIK → dyspozytor + lider` (вопрос №1 в §8). Остальные строки —
`lider = false`.

---

## 3. Инвентаризация изменений

### 3.1 database (`db-agent`)

| Что | Где |
|---|---|
| `User.lider Boolean @default(false)` с комментарием «надстройка над ролью из `LIDER_ROLES`, см. docs/28»; `StanowiskoRoleMapping.lider Boolean @default(false)` | `schema.prisma` |
| Миграция `user_lider_flag`: `ADD COLUMN "lider" BOOLEAN NOT NULL DEFAULT false` на `users` и `stanowisko_role_mappings`; CHECK `user_lider_requires_lider_role` — `CHECK (NOT "lider" OR "role" IN ('planista','dyspozytor','opiekun','pracownik','eksport'))`; CHECK `stanowisko_role_mapping_lider_requires_lider_role` — то же на `role`. Аддитивная, forward-only. Индекс не нужен: лидеров единицы | `prisma/migrations/` |
| Seed: две строки маппинга выше; по одному лидеру на роль — `planistalider1`, `dyspozytorlider1` (в команде 1), `opiekunlider1`, `pracowniklider1`, `eksportlider1` | `seed.ts`, `seed-data.ts` |
| docs/12: строки `lider` в таблицах User и StanowiskoRoleMapping, строка в таблице миграций | `docs/12-database-schema.md` |

### 3.2 shared

| Файл | Что |
|---|---|
| `schemas/common.ts` | `LIDER_ROLES` (as const), `LiderRoleSchema = RoleSchema.extract(LIDER_ROLES)`, `isLiderRole(role)`. `RoleSchema` и `auth.ts#Role` **не меняются** (комментарий: лидер — не роль, см. docs/28) |
| `schemas/users.ts` | `lider: z.boolean().optional()` в `CreateUserSchema` (`superRefine` на пару) и `UpdateUserSchema` (пара — в сервисе, PATCH частичный); `UserFiltersSchema.lider` (`z.coerce.boolean().optional()`); `UserDtoSchema.lider: z.boolean()` |
| `schemas/sso.ts` | `StanowiskoRoleDtoSchema.lider`, `SetStanowiskoRoleSchema.lider` (default `false`, `superRefine`), `GrantSsoAccessSchema.lider` (default `false`, `superRefine`) |
| `schemas/lookups.ts` | `lider` в `LookupUserSchema` и `LookupUserAdminSchema` — пикеры смогут подписать «(lider)» |
| коды ошибок | 422 `USER_LIDER_REQUIRES_LIDER_ROLE` рядом с `USER_MANAGED_BY_MAGSPACE` |
| — | `permissions.ts` **не создаём** — это B1 (§5) |

### 3.3 api (`api-agent`)

| Место | Изменение |
|---|---|
| `users.repository.ts` | `UserRow.lider`; `create`/`update`/`list` (фильтр `lider`) |
| `auth/decorators/current-user.decorator.ts` | `AuthUser.lider?: boolean` — опционально в типе (35 spec-файлов с фикстурами `role: '…'` не трогаем), стратегия ставит всегда |
| `strategies/jwt-access.strategy.ts` | `lider: user.lider` из БД, как `teamId` |
| `users.service.ts` | create: пара из Zod. update: пара проверяется на **слитой** строке и для `role`, **и** для `roleOverride` (иначе следующий sync запишет `weryfikator + lider` и упрётся в CHECK → упадёт reconcile). На `magspace`-учётке `lider` меняется только если у неё есть (или в этом же теле ставится) `roleOverride`, либо тело переводит в `local`; иначе 422 `USER_MANAGED_BY_MAGSPACE`, `fields: ['lider']`. `toDto` |
| `directory.service.ts` | `roleFor` → `accessFor(stanowisko): { role, lider } \| null`; `provisionOrSync` пишет `lider` из маппинга, когда `roleOverride IS NULL`; `grantAccess(email, role, lider)` — `_createGranted` / `_regrantExisting` пишут `lider` |
| `directory-reconcile.service.ts` | `roleChanges` сравнивает пару `(role, lider)`; отчёт админам получает колонку `lider`; предохранитель без изменений |
| `stanowisko-role-mapping.repository.ts`, `sso.controller.ts` | `upsert(code, name, role, lider)`; `GET` отдаёт `lider`, `PUT` принимает |
| `lookups.service.ts` | `lider` в DTO пикеров; фильтрация не меняется |
| audit | Существующие `createUser` / `updateUser` / `grantSsoAccess` / `setStanowiskoRole` / `syncUserFromDirectory` / `system.syncUserFromDirectory` получают `lider` в `before`/`after`/`metadata`. Новых action-ов нет |
| **Не меняются** | `RolesGuard`, все `@Roles`, `_scopeFilters` в 15 сервисах, `OpiekunOwnershipGuard`, `VehiclesService._assertRole`, `TeamsService` — лидер проходит как базовая роль |

Тесты: `users.service.spec` (пара, managed-правило, handover), `directory.service.spec`
(маппинг с `lider`; override не перетирается), `directory-reconcile.service.spec`
(смена `lider` → sync + audit), `sso.service.spec` (grant с `lider`),
`jwt-access.strategy` (`lider` в `AuthUser`); в shared — `RoleSchema.options` не
содержит строк с `lider` (защита от R1 в §7).

### 3.4 web (`web-agent`)

| Место | Изменение |
|---|---|
| `(admin)/users/UserSheet.tsx` | Чекбокс «Lider» — виден только когда выбранная роль ∈ `LIDER_ROLES`; при смене роли на другую сбрасывается; на `magspace`-учётке disabled с той же подсказкой, что у `role`, пока не задан `roleOverride` |
| `(admin)/users/UsersListView.tsx` | Чип «Lider» рядом с чипом роли; фильтр «Tylko liderzy» (`?lider=true`) |
| `(admin)/sso/page.tsx` | Колонка «Lider» (чекбокс) в таблице stanowisko → rola, активна только для ролей из `LIDER_ROLES`; `PUT` с `lider` |
| `(admin)/sso/GrantAccessDialog.tsx` | Чекбокс «Lider» под select-ом роли |
| `components/layout/UserMenu.tsx` | Лейбл через `roleLabelKey(user)` |
| `lib/roles.ts` | `roleLabelKey(role, lider)` → `roles.<role>` \| `roles.lider.<role>`. `ROLE_LANDING`, `ROLE_ALLOWED_PREFIXES`, `isAllowedForRole` — не меняются |
| `messages/pl.json`, `en.json` | `roles.lider.*`, `users.fields.lider`, `users.fields.liderHint`, `sso.lider` |
| **Не меняются** | `middleware.ts` (`KNOWN_ROLES`), `nav.config.ts`, layouts с `requireRoleAccess`, `claim-permissions.ts`, все `role ===` |

### 3.5 docs (главный агент)

| Документ | Что |
|---|---|
| `03-roles.md` | Раздел «Лидеры» после «Специальные роли»: что это, откуда, лейблы, инвариант «лидер — не значение `Role`»; в «Откуда берётся роль» — абзац про `lider`. Матрица без изменений (прав пока нет) |
| `04-data-model.md`, `12-database-schema.md` | Поле `lider` на User и StanowiskoRoleMapping |
| `13-api-design.md` | Users (`lider` в create/update/filters/DTO, правило для `magspace`), SSO (`lider` в `PUT`/`GET`/`access-grants`) |
| `24-…` §10 | `PLANISTA_LIDER` / `DYSPOZYTOR_KIEROWNIK` → `+ lider` |
| `19-known-quirks.md` #14 | `liderEmail` (email для CC) ≠ `lider` (флаг) — два разных понятия, см. §6 |
| `25-…` | Поправки из §5 |
| `INDEX.md` | Строка 28 |

---

## 4. Этапы, порядок, оценка

| Этап | Агент | Дни |
|---|---|---|
| L1 db: schema, миграция, seed, docs/12 | `db-agent` | 0.5 |
| L2 shared + api + тесты | `api-agent` (shared правится в его PR) | 1–1.5 |
| L3 web + i18n | `web-agent` | 1 |
| L4 docs (03, 04, 13, 19, 24, 25) | главный агент | 0.5 |
| **Итого** | | **≈ 3–3.5** |

Порядок по CLAUDE.md: `orchestrator-agent` → `db-agent` → `api-agent` → `web-agent`.
PR: один (`feat(users): lider flag on staff roles`) или два (db + api, web).
Runtime-поведение ни одной роли не меняется, поэтому мержится независимо от
трека B и до него.

> ✅ **Выполнено 2026-09-25** — все четыре этапа, см. §9. Реальный ход: L1
> (db-agent) → L2 (api-agent, shared в том же наборе правок) → L3 (web-agent)
> → L4 (главный агент); каждый этап маршрутизировал `orchestrator-agent`.

---

## 5. Совместимость с треком B — что дописать в docs/25

| Этап B | Поправка |
|---|---|
| B1 | `LIDER_PERMISSIONS: Partial<Record<LiderRole, readonly Permission[]>>` (на старте `{}`); `permissionsFor(role, lider = false) = ROLE_PERMISSIONS[role] ∪ (lider ? LIDER_PERMISSIONS[role] ?? [] : [])`. Тест: `permissionsFor(r, true) ⊇ permissionsFor(r, false)` — лидер только добавляет. В сгенерированной матрице docs/03 под-строка «+ lider» появляется только у непустых |
| B2 | `AuthUser.permissions` считается из `(user.role, user.lider)` — `lider` уже в `AuthUser` после L2. Фикстура `endpoint-roles.snapshot.json` **не меняется**. Эндпоинт только для лидера записывается в фикстуре как `["admin", "planista+lider"]` |
| B3 / B4 | Без изменений; `useCan(p)` в web учитывает лидера автоматически через `/auth/me.permissions` |
| B6 | `effective = permissionsFor(role, lider) ∪ extra − denied`; `GRANTABLE_EXTRA` по-прежнему по роли — лидер не меняет scope-ветку |
| Scope («не цель» B) | Будущее расширение scope лидера живёт **внутри** ветки базовой роли: `if (user.role === 'planista') return user.lider ? { … } : { plannerId: user.sub }`. Это по-прежнему «scope на роли», как требует docs/25 §0 |

**Первый lider-only эндпоинт** (`POST /vehicles/:id/transfer/approve` и т.п.)
требует guard, который `@Roles` не выразит. Два пути:

1. **Рекомендуется:** сделать B1–B2 (≈ 2.5 дня) до фичи передачи →
   `@RequirePermission('vehicles.transfer.approve')`, без временного кода.
2. Если фича нужна раньше B2: `@RequireLider()` + `LiderGuard` (~30 строк:
   `user.lider === true || user.role === 'admin'`), помечается «удалить в B5»;
   в фикстуре B1 отражается как `+lider`.

---

## 6. Что не делаем сейчас

- **Механизм передачи машин** (заявка / апрув / отказ, статусы, письма, экран
  у планисты и лидера) — отдельный план после ответов §8.
- **Группы планистов / `liderId` вместо `liderEmail`** (quirk #14). `liderEmail`
  остаётся e-mail-ом для CC при решениях по wniosku; два понятия «лидер»
  разводим комментарием и подписью поля «e-mail lidera (CC)». Когда появится
  структура «кто чей лидер», `liderEmail` выводится из неё.
- Лидер для `weryfikator`.
- Иерархия выше лидера (`*_KIEROWNIK`): если понадобится, `lider Boolean`
  мигрирует в `enum` одной миграцией `CASE WHEN`.
- Новые route-groups, панели, пункты nav.

---

## 7. Риски

| # | Риск | Митигация |
|---|---|---|
| R1 | Кто-то «для удобства» добавит `lider_planista` в `enum Role` | Инвариант в docs/03 и комментарий у `RoleSchema`; тест в shared: `RoleSchema.options` без строк с `lider` |
| R2 | `roleOverride` + `lider` дают недопустимую пару, которую sync пишет в `role` → CHECK → падение reconcile | Пара валидируется в `PATCH /users` и для `role`, и для `roleOverride`; маппинг валидирует свою пару в Zod + CHECK |
| R3 | Понижение в MAGSpace не снимает лидерство у override-учёток | По дизайну, как `role`: override — ответственность админа; отчёт reconcile показывает `lider` |
| R4 | Путаница `liderEmail` vs `lider` | quirk #14, подпись поля в UserSheet, §6 |
| R5 | Лидер получил флаг, но до фичи «ничего не может» | Ожидаемо и безопасно: UI-лейбл уже отличает, прав нет |

---

## 8. Открытые вопросы

Не блокируют L1–L4. Нужны **до** плана передачи машин.

1. `DYSPOZYTOR_KIEROWNIK` — это лидер диспетчеров (в сиде — да)?
   `HANDEL_LIDER` / `HANDEL_KIEROWNIK` → лидер eksportu только руками, раз роль
   `eksport` маппингом не выдаётся?
2. Scope лидера планистов: все машины всех планистов или только «своей
   группы»? Если группы — нужна структура «кто чей лидер», и тогда `liderEmail`
   → `liderId` (§6).
3. Лидер диспетчеров — член одной команды (`teamId`) или над всеми командами?
4. Лидеры opiekunów wniosków, DAF и eksportu — есть ли уже действия сверх
   базовой роли, или флаг пока «на вырост»?
5. Может ли лидер планистов переназначить машину на себя, и нужен ли апрув,
   когда лидер инициирует сам (по запросу — нет)?

---

## 9. Что изменилось при реализации (2026-09-25)

Все четыре этапа выполнены в один день одним набором правок (db + shared +
api + web + docs); проверки: prisma validate/generate, миграция и сид дважды на
dev-БД с отрицательными тестами CHECK, api 117 наборов / 1809 тестов, shared
538, web 311, typecheck и build всех воркспейсов, ручная проверка в браузере
(список пользователей, UserSheet, `/employee/sso`, вход лидером). Ниже — где
код отличается от §2–§3.4 и почему.

### 9.1 shared + api (L2)

| # | В плане | Сделано | Почему |
|---|---|---|---|
| 1 | `UserFiltersSchema.lider` — `z.coerce.boolean()` | Строгий `BooleanQueryParamSchema` (`'true' \| 'false'` → boolean) | `Boolean('false') === true`: `?lider=false` вернул бы только лидеров. Тот же дефект у существующего `active` и ещё ~8 фильтров — вынесен в отдельную задачу, здесь не трогался |
| 2 | `SetStanowiskoRoleSchema.lider` и `GrantSsoAccessSchema.lider` с `default(false)` | Без Zod-default: для `PUT` отсутствие поля = **сохранить текущий флаг** (у новой строки `false`); для grant сервис подставляет `false`. `superRefine(refineLiderPair)` на обеих схемах | Иначе `PUT { role }` (так шлёт web до L3 и любой старый клиент) молча снимал бы лидерство; и тип тела должен принимать `{ email, role }` — `.default()` делал бы поле обязательным в выходном типе |
| 3 | `superRefine` на `CreateUserSchema` | `CreateUserSchema` остался `ZodObject`; проверка пары — в отдельной `CreateUserRequestSchema`, её использует pipe `POST /users`; форма web композирует `CreateUserSchema.passthrough().superRefine(refineLiderPair)` | Web вызывает `.passthrough()` / `.extend()` на схеме, а у `ZodEffects` их нет |
| 4 | Код 422 «рядом с `USER_MANAGED_BY_MAGSPACE`» в `auth.ts` | Константа в `common.ts`, из `auth.ts` реэкспорт | `./users` и `./sso` нужны для refine, а `./users` не может импортировать `./auth` — цикл (`./auth` импортирует `PasswordSchema` из `./users`) |
| 5 | — | **Новая конвенция `ZodValidationPipe`:** если все ошибки Zod — `custom` с `params.code`, ответ **422** + `extensions.code` + `issues`, а не 400 | Refine в pipe иначе не мог дать требуемый 422 с машинным кодом; описано в docs/13 «Формат ответов». Сейчас так помечено одно правило |
| 6 | Один код 422 | 422 из сервиса несёт ещё `extensions.field: 'role' \| 'roleOverride'`; 422 из pipe — только `code` + `issues` | Диагностика: какая из двух пар отвергнута. Web на `field` не опирается |
| 7 | Правило `PATCH /users` (§3.3) | Проверяются **две** пары на слитой строке: `(role, lider)` и `(roleOverride, lider)`. Следствие (вариант A): `{ roleOverride: 'planista', lider: true }` на `magspace`-учётке с текущей `role: weryfikator` → 422; `role` при установке override **не переписывается** | Иначе UPDATE упал бы на CHECK (500), а sync — на следующем входе. Семантика docs/24 «override применится при следующем входе» сохранена; лидерство таким людям даётся после входа или через «Nadaj dostęp», который пишет `role`, `roleOverride`, `lider` вместе |
| 8 | `lider` на `magspace`-учётке «только при `roleOverride`» | Точнее: `lider`, **отличающийся** от текущего, допустим только если итоговый `roleOverride` не null (стоит или ставится в этом теле) либо тело переводит в `local`; неизменённое значение проходит. Иначе `USER_MANAGED_BY_MAGSPACE` с `fields ∋ 'lider'` | Форма шлёт весь объект; без «отличающийся» правка имени у лидера из маппинга давала бы 422 |
| 9 | — | Аудит `updateUser` и `setStanowiskoRole` получил `before` (раньше был пустой) | Смена лидерства — событие про права доступа, нужно before → after |
| 10 | — | `setStanowiskoRole` сначала читает существующую строку и проверяет итоговую пару **до** запроса в MAGSpace; молчаливый `catch {}` вокруг MAGSpace теперь пишет WARN | «Не задан = сохранить» требует знать текущий флаг |
| 11 | `roleFor(stanowisko)` | `accessFor(stanowisko): { role, lider } \| null`; `provisionOrSync` разбит на `_provisionNew` / `_syncExisting`, `createFromDirectory(…, lider)` обязателен | Ни один путь провижининга не может забыть флаг |
| 12 | Отчёт reconcile | `ReconcileRoleChangeRow` получил `fromLider`/`toLider`, строка вида `planista → planista (lider)` | Смена только флага иначе выглядела бы как «planista → planista» |

### 9.2 web (L3)

| # | В плане | Сделано | Почему |
|---|---|---|---|
| 13 | «При смене роли на другую сбрасывается» | Смена `role` или `roleOverride` (в т.ч. между двумя лидерскими ролями) → `false`; **очистка** `roleOverride` возвращает сохранённый `user.lider` | Пустой override отдаёт флаг маппингу: отправить `false` значило бы менять чужое поле → 422 |
| 14 | «При edit слать `lider`, только если отличается» | `liderPatchValue`: `enabled` → значение галки; `hidden` (роль вне `LIDER_ROLES`) → `false`; `disabled: managed` → не слать никогда; `disabled: pendingSync` → `false`; всё — только при отличии от `user.lider`. Правила в `lib/users/liderCheckboxState.ts`, 86 тестов | Логика чекбокса проверяема vitest-ом только вне компонента (jsdom не рендерится) |
| 15 | SSO: `lider: false` при смене роли у строки-лидера | `lider: false` при **любой** смене роли, и у нелидерских строк тоже | Покрывает устаревший кэш; для нелидерской строки ничего не меняет |
| 16 | — | `useSetStanowiskoRole` пишет ответ `PUT` в кэш списка до refetch | Иначе select и чекбокс прыгали на старое значение до прихода refetch |
| 17 | Чекбокс в «Nadaj dostęp» «активен только для роли из `LIDER_ROLES`» | Всегда виден; при пустой или нелидерской роли — disabled с подсказкой | Понятнее, чем исчезающий элемент |
| 18 | `roleLabelKey` в `lib/roles.ts` | Локальное зеркало `LIDER_LABEL_ROLES` с `satisfies Record<LiderRole, true>` вместо импорта `isLiderRole` | `middleware.ts` (edge) импортирует этот файл; runtime-импорт из shared (`dist` CommonJS + zod) утащил бы весь barrel в edge-бандл. Проверено: middleware.js побайтно не изменился, рассинхрон с `LIDER_ROLES` ломает компиляцию и тест |
| 19 | EN-лейблы «… lead» | Флаг в EN — «Lead»; `users.fields.liderEmail` → «E-mail lidera (CC)» / «Leader e-mail (CC)» | R4 (§7): два понятия «лидер» на одном экране |
| 20 | §3.4 | Плюс `components/audit/UserAutocomplete.tsx` (лейбл через `roleLabelKey`) и хелпер `lib/api/problemCode.ts` для чтения `extensions.code`/`fields` (три старые копии разбора не тронуты) | Одна строка и место, где код читается в четвёртый раз |

### 9.3 Данные и ops

- Сид маппинга пишет `lider` **только при создании** строки (`update` не
  трогает ни `role`, ни `lider`). На уже засеянных БД (staging pre-prod) флаг у
  `PLANISTA_LIDER` / `DYSPOZYTOR_KIEROWNIK` ставит админ в `/employee/sso` —
  ops-шаг для `preprod-parity-agent` после выката; на локальной dev-БД сделан
  при ручной проверке.
- В dev-сиде пять лидеров (`planistalider1`, `dyspozytorlider1` в команде
  `1.1.13`, `opiekunlider1`, `pracowniklider1`, `eksportlider1`).
- Побочные находки, вынесенные в отдельные задачи: `z.coerce.boolean()` в
  существующих фильтрах (`?active=false` возвращает активных); UserSheet при
  редактировании `przewoznik` подставляет `pracownik` и всегда шлёт `role`, а
  API не запрещает смену роли *с* `przewoznik`.
