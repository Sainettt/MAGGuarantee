# 15. Стратегия авторизации

> Текущий GAS-флоу: login + password → 6-значный код в email → user-объект в JS-памяти. После перезагрузки страницы — заново. Никаких сессий. Пароли в plaintext.
>
> Цель: те же два шага (login → 2FA-код), но с JWT-сессиями, bcrypt-хешами и Google SSO для внутренних сотрудников (роль — из справочника MAGSpace, см. §«Google SSO + MAGSpace»).

## Общий flow (логин)

```
┌──────────┐   1. POST /auth/login          ┌──────────┐
│  Browser │ ─────────────────────────────► │   API    │
│ (Next.js)│ {login, password}              │ (NestJS) │
└──────────┘                                └──────────┘
                                                  │
                                  validateCreds + bcrypt.compare
                                                  │
                                  generateCode() → Redis (TTL 600s)
                                                  │
                                       Mail.send(code) (Gmail API)
                                                  │
            ◄─ 200 {sessionToken, maskedEmail} ───┘
            
┌──────────┐   2. POST /auth/verify-code   ┌──────────┐
│  Browser │ ─────────────────────────────► │   API    │
└──────────┘ {sessionToken, code}          └──────────┘
                                                  │
                                  Redis.get(sessionToken) → match code
                                  attempts++ on miss; lock after 5
                                                  │
                                  signJwt({sub, role, ...})
                                  saveRefreshToken(hash) in DB
                                                  │
            ◄─ 200 {accessToken, refreshToken,    │
                    user: UserDto}                │
            ◄─ Set-Cookie: mt_access (HttpOnly)   │
            ◄─ Set-Cookie: mt_refresh (HttpOnly,  │
                                       Lax)       │
                                                  │
                                                  ▼
                                  All API calls: Authorization: Bearer
                                                  или Cookie: mt_access
```

## Решение по cookie vs header

**Используем оба:**
- **Web (Next.js):** HttpOnly cookies. Защищены от XSS (нельзя прочитать из JS), CSRF mitigated через `SameSite=Lax` + double-submit token на mutating endpoints. Lax, а не Strict: почтовые уведомления (maksim-confirmation-request, carrier-decision, daily-reminder и т.д.) диплинкуют в приложение — клик из почтового клиента это cross-site top-level навигация, и Strict не отправил бы ни одной куки → живую сессию выкидывало бы на /login. CSRF-защита сохраняется: Lax-куки не едут на cross-site POST/XHR, а все мутирующие endpoint-ы — POST/PATCH/DELETE.
- **Внешние интеграции / mobile (если когда-нибудь):** `Authorization: Bearer`.

API одинаково принимает оба варианта (custom passport extractor).

## JWT детально

### Payload (claims)

```ts
type JwtPayload = {
  sub: string;          // userId (UUID)
  login: string;
  role: Role;
  carrierId?: string;   // для przewoznik — для быстрого ownership check
  iat: number;
  exp: number;
  jti: string;          // unique token ID (для revocation tracking)
};
```

> **Что в payload не входит.** `teamId` (Phase 11), флаг лидера `lider`
> (docs/28) и права `permissions` (docs/25 B4) в токен не кладутся:
> `JwtAccessStrategy.validate` перечитывает пользователя из БД на каждом запросе
> и строит `AuthUser` (включая `permissions`) оттуда, так что понижение бьёт на
> следующем запросе, а не после истечения access. Edge-гейтинг в `middleware.ts`
> знает только `role`: панель, landing и права пути — каталог по роли, без флага
> лидера (§Middleware).

### Access vs Refresh

| | Access | Refresh |
|---|---|---|
| TTL | 15 мин | 30 дней |
| Хранение | HttpOnly cookie или header | HttpOnly cookie (Lax) — НЕ в localStorage |
| Содержимое | full payload | минимум: `{sub, jti}` |
| Подпись | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` (разные!) |
| Revocation | в основном через истечение TTL | через таблицу `refresh_tokens` (revokedAt) |

> **Исходящий handoff-токен BugBot (2026-10-02) — третий, отдельный JWT.** `GET /integrations/bugbot/handoff` подписывает для текущего пользователя токен **ES256** (асимметричный, `BUGBOT_HANDOFF_PRIVATE_KEY` + `kid`), `aud=bugbot`, TTL 60 с, одноразовый `jti`. Это не сессия MAGGuarantee: мы его только выпускаем, проверяет его BugBot нашим публичным ключом; access/refresh-секреты и `JwtService` из `AuthModule` в нём не участвуют. Claims, ключи, ротация, лимит 10/мин на пользователя — [16-jobs-and-integrations.md#bugbot-handoff](16-jobs-and-integrations.md#bugbot-handoff).

### Rotation

При каждом `/auth/refresh`:
1. Принимаем старый refresh.
2. Проверяем что не `revokedAt` и не `expiresAt < now()`.
3. **Помечаем старый `revokedAt = now()`** (атомарный claim внутри транзакции — только один конкурентный refresh может «забрать» токен).
4. Выдаём новую пару (access + refresh); старая строка получает `replacedById` → цепочка ротаций.
5. Если приходит refresh, который **уже** revoked — различаем два случая:
   - **Benign concurrent-rotation race** (*reuse interval*, реализовано 2026-07-03): токен отозван ≤ `REFRESH_ROTATION_GRACE_MS` (30 с) назад И имеет `replacedById`, чья цепочка преемников жива. Это проигравший из параллельных `/auth/refresh` (edge middleware на каждый document/RSC/prefetch запрос, клиентский 401-interceptor, соседние вкладки), деливших один одноразовый токен. Ответ: **200 + свежий access-only токен** — БЕЗ второй ротации и БЕЗ refresh-куки (ротированная пара победителя уже в браузере). Без этого проигравший 401 превращался middleware'ом в редирект живой сессии на /login.
   - **Genuine theft**: отозван вне grace-окна, или без `replacedById` (logout / reset / admin revoke-all), или цепочка преемников мертва → отзываем все refresh-токены user-а (кроме случая мёртвой цепочки — там просто 401 без revoke-all).

Принятый trade-off reuse-interval'а: токен, украденный и повторённый в течение 30 с после легитимной ротации, даст атакующему один короткоживущий access-токен, не тронув детекцию кражи. Стандартная практика (Auth0 refresh token reuse interval).

Реализация: `AuthService.refresh` + `healRotationRace` + `successorChainAlive` в `apps/api/src/modules/auth/auth.service.ts`; тесты — `auth.service.refresh.spec.ts`.

## 2FA: 6-значный email-код

> **Доставка кода (Phase 9, частично):** письмо с 2FA-кодом теперь отправляется
> **асинхронно** через BullMQ-очередь `email-send` (`MailService.enqueue2faCode`,
> in-process worker `EmailSendProcessor`). Воркер крутится внутри API-процесса,
> так что в dev код по-прежнему доходит до Mailhog в пределах того же окна. Сам
> код в Redis (`2fa:code:{sessionToken}`) пишется синхронно ДО enqueue — то есть
> `verify-code` валиден сразу, не дожидаясь доставки письма. См.
> [16-jobs-and-integrations.md#email-очередь](16-jobs-and-integrations.md#email-очередь).

Те же правила, что в GAS:

| Параметр | Значение | Где |
|---|---|---|
| Длина | 6 цифр (`000000-999999`, leading zeros ok) | `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')` |
| TTL | 600 сек (10 мин) | Redis SETEX |
| Max attempts | 5 | Redis counter, key `2fa:attempts:{sessionToken}` |
| Lockout | 5 мин | После 5-й — Redis SETEX 300, ключ `2fa:lockout:{sessionToken}` (`DEFAULT_LOCKOUT_SECONDS`) |
| Resend | Cooldown 60 сек на сессию (`RESEND_COOLDOWN_SECONDS`, Redis) + 2 / мин / IP (throttler) | Resend сбрасывает счётчик попыток, но **не продлевает** жизнь сессии: TTL сессии фиксирован и ограничивает перебор |

```ts
// two-factor.service.ts
async issueCode(userId: string, sessionToken: string) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await this.redis.setex(
    `2fa:code:${sessionToken}`,
    600,
    JSON.stringify({ userId, code })
  );
  return code;
}

async verify(sessionToken: string, code: string) {
  if (await this.redis.get(`2fa:lockout:${sessionToken}`)) {
    throw new HttpException('Locked', 423);
  }
  const data = await this.redis.get(`2fa:code:${sessionToken}`);
  if (!data) throw new UnauthorizedException('Code expired');
  const { userId, code: stored } = JSON.parse(data);
  if (stored !== code) {
    const attempts = await this.redis.incr(`2fa:attempts:${sessionToken}`);
    if (attempts >= 5) {
      await this.redis.setex(`2fa:lockout:${sessionToken}`, 300, '1');
      throw new HttpException('Too many attempts', 423);
    }
    throw new UnauthorizedException('Invalid code');
  }
  await this.redis.del(`2fa:code:${sessionToken}`, `2fa:attempts:${sessionToken}`);
  return userId;
}
```

## Хранение паролей

### Hashing

- **bcrypt** (12 rounds). Можно и Argon2id — нюанс: Argon2 лучше, но bcrypt стабилен и проще.
- При импорте из Sheets все plaintext → bcrypt сразу. Старая колонка `Hasło` после миграции пустеет навсегда.

### Politika паролей

При создании / reset:
- Минимум 10 символов.
- Хотя бы одна цифра + одна буква.
- Проверка против Have I Been Pwned API (опц., через `k-anonymity`).
- Не равен последним 3 паролям (хранить в `password_history`, опц.).

### Альтернатива: email-only

**Рекомендация:** убрать пароли совсем. Только email + 6-значный код.

**Почему:**
- 2FA-код уже доказывает владение email.
- Пароль — лишний фактор, который пользователи 50% теряют.
- Снижает поверхность атаки (нет утечки паролей).

**Что делать:**
- На launch все логины настроены на email-only (login без пароля → отправка кода → код).
- Поле `passwordHash` остаётся в схеме, но nullable.
- Внутри settings — endpoint «Привязать пароль» если кому-то очень нужно (опц.).

Это решение принимается перед launch. По умолчанию — оставляем пароли + 2FA, но с возможностью отключить пароли через `app_config.password_required = false`.

## Google SSO + MAGSpace (реализовано)

> Полный план и обоснования решений — [24-sso-magspace-and-permissions-plan.md](24-sso-magspace-and-permissions-plan.md).
> Контракт справочника со стороны MAGSpace — `MAGSpace/docs/07-directory-api.md`.

Сотрудники MAGTRANS входят кнопкой «Zaloguj przez Google». Разделение
ответственности: **Google отвечает «кто это», MAGSpace — «работает ли у нас и на
какой должности», MAGGuarantee — «какая это роль»**.

```
Сотрудник ──► Google Identity Services (в браузере) ──► id_token
                 │
                 ▼
          POST /auth/google  { idToken }
                 │
          verifyIdToken: подпись, aud, iss, exp, email_verified, hd
                 │
                 ▼
          есть локальный User с managedBy='local'?  ──да──► вход с локальной ролью
                 │ нет                                       (MAGSpace НЕ опрашивается)
                 ▼
          MAGSpace /internal/v1/employees/lookup?email=…
                 │
          stanowisko ──► StanowiskoRoleMapping ──► роль
                 │
                 ▼
          User создан/обновлён ──► issuePair() ──► те же cookies, что после 2FA
```

Ответ `POST /auth/google` **побайтово совпадает** с `POST /auth/verify-code`
(`{ user }` + cookies `mt_access`/`mt_refresh`) — фронт переиспользует весь
пост-логин путь. Кода 2FA нет: Google уже подтвердил владение аккаунтом и
применил свой второй фактор.

### Что проверяется в `id_token`

`apps/api/src/modules/auth/google/google-id-token.service.ts`. Все отказы
схлопываются в один 403 `SSO_DOMAIN_NOT_ALLOWED` — снаружи это одно условие
«ваш Google-аккаунт нам не подходит», а различать «протух» и «чужой aud» полезно
только тому, кто щупает эндпоинт. Настоящая причина уходит в лог.

| Проверка | Почему обязательна |
|---|---|
| `aud === GOOGLE_OAUTH_CLIENT_ID` | без неё пройдёт токен, выписанный для ЛЮБОГО другого Google-клиента — подпись всё равно Google-овская |
| `iss` = Google | защита от смены поведения библиотеки |
| `exp` | стандартная проверка (делает библиотека) |
| `email_verified === true` | админ Workspace может завести аккаунт с неподтверждённым адресом |
| `hd === SSO_ALLOWED_HD` | **ключевая.** `email`, оканчивающийся на `@magtrans.eu`, — не эквивалент: `hd` утверждает Workspace, а адрес — нет. Отсутствие `hd` = потребительский аккаунт → отказ |

### Роли и `managedBy`

| Поле `User` | Смысл |
|---|---|
| `authProvider` | `local` / `google` — как аккаунт входит |
| `managedBy` | `local` — ролью и активностью управляем здесь; `magspace` — их синхронизирует справочник |
| `googleSub` | стабильный ключ привязки; email в Workspace можно переименовать, `sub` — нет |
| `magspaceEmployeeId` | `Employee.id` из MAGSpace, **cuid**, не UUID |
| `directorySyncedAt` | когда справочник последний раз обновлял строку |
| `roleOverride` | роль, выданная админом вручную; reconcile её не трогает |

**Роль `admin` — только локальная**, из stanowiska не выводится никогда
(и это дополнительно закреплено CHECK-констрейнтами
`user_role_override_not_privileged` / `stanowisko_role_mapping_role_not_privileged`).
Локальные пользователи входят через Google, не обращаясь к MAGSpace вообще —
это break-glass путь на случай, когда справочник лежит.

**Перевозчики (`przewoznik`) Google-входом не пользуются** — 403
`SSO_NOT_FOR_CARRIER`. Проверка `hd` их и так отсекает; явный отказ нужен на
случай тестового `@magtrans.eu` у перевозчика.

**Парольный вход остаётся у всех.** Google-пользователь создаётся с
`passwordHash = null`; пароль он может завести через «Zapomniałem hasła».
`PasswordService.compareConstantTime` уже корректно отказывает при пустом хеше,
без утечки по времени.

### Коды отказов

Все — в `extensions.code` конверта RFC 7807 (та же конвенция, что у
`CARRIER_NOT_READY_CODE`), константы в `packages/shared/src/schemas/auth.ts`.
Фронт разбирает `err.data.extensions.code`, человекочитаемый `detail` — не контракт.

| HTTP | Код | Когда |
|---|---|---|
| 403 | `SSO_DOMAIN_NOT_ALLOWED` | токен не прошёл проверки выше |
| 403 | `SSO_NOT_EMPLOYEE` | MAGSpace не знает такого адреса |
| 403 | `SSO_INACTIVE` | сотрудник уволен |
| 403 | `SSO_NO_ROLE` | stanowisko без маппинга и без `roleOverride` |
| 403 | `SSO_NOT_FOR_CARRIER` | роль `przewoznik` |
| 503 | `SSO_DIRECTORY_UNAVAILABLE` | MAGSpace не ответил, а локальной записи нет |
| 503 | `SSO_NOT_CONFIGURED` | в этом окружении не задан client id / токен |

**MAGSpace недоступен ≠ «не сотрудник».** Существующего активного
managed-пользователя пускаем по последней синхронизированной роли (с warn в лог);
отказываем только тому, о ком у нас нет записи. Насколько устаревшей может быть
эта роль — ограничивает reconcile.

### Конфигурация

- `GOOGLE_OAUTH_CLIENT_ID` — OAuth-клиент типа *Web application*, consent screen
  **Internal**. То же значение, что `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` в сборке
  веба: это то, с чем сверяется `aud`. Публичное значение, **client secret не
  нужен** — браузерный GIS-flow не обменивает authorization code.
- `SSO_ALLOWED_HD` (default `magtrans.eu`).
- `MAGSPACE_API_URL`, `MAGSPACE_INTERNAL_TOKEN` — см.
  [16-jobs-and-integrations.md](16-jobs-and-integrations.md).
- Пусто = фича выключена целиком: кнопки на `/login` нет, cron не планируется,
  пароль + 2FA работают как раньше.

## Roles & Guards

> Роль — тип пользователя и ключ data-scope («какие строки видит»). Право
> (permission) — имя одного действия («что можно сделать»). Роуты и
> capability-ветки в сервисах решаются **правами**, scope остаётся на **роли**.
> План и история перехода — [25-permissions-layer-plan.md](25-permissions-layer-plan.md)
> (трек B, B1–B5 сделаны 2026-10-23).

### Каталог прав

`packages/shared/src/permissions.ts` — единственный источник «кто что может»:

| Экспорт | Что |
|---|---|
| `PERMISSIONS`, `type Permission` | все права, `домен.действие` (snake_case внутри сегмента); порядок = порядок матрицы docs/03 и вывода `permissionsFor` |
| `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>` | права роли без флага лидера. `admin` ≠ «все права»: у него нет `claims.submit`, `delegations.create`, `panel.carrier` |
| `LIDER_PERMISSIONS: Partial<Record<LiderRole, readonly Permission[]>>` | что добавляет флаг `User.lider` (docs/28); сегодня только `planista: ['vehicles.planner_transfer.decide']`. Лидер только добавляет: тест `permissionsFor(r, true) ⊇ permissionsFor(r, false)` |
| `permissionsFor(role, lider = false)` | `ROLE_PERMISSIONS[role] ∪ (lider ? LIDER_PERMISSIONS[role] : [])`, без дублей, в порядке каталога; строка, которая не роль, → `[]` (fail closed) |
| `hasPermission`, `hasAnyPermission` | проверки над парой `(role, lider)` — для edge и тестов; запросный пользователь проверяется через `AuthUser.permissions` |
| `rolesSatisfying(required, { lider })` | роли, которые пропускает any-of требование, — для сверки с фикстурой ролей |

Модуль без runtime-зависимостей (только type-импорты, zod нет — тест это
проверяет): его импортируют api, web и edge-middleware. Таблица для людей —
сгенерированный блок docs/03 [«Каталог прав (генерируется)»](03-roles.md#каталог-прав-генерируется)
(`npm run -s authz:matrix -w @magguarantee/shared`; `packages/shared/tests/permissions.test.ts`
сверяет блок с каталогом).

### `AuthUser.permissions` — один расчёт на запрос

`JwtAccessStrategy.validate` перечитывает пользователя из БД на каждом запросе
(активность, `passwordChangedAt`, `teamId`, `lider`) и там же **один раз** строит
`AuthUser.permissions: ReadonlySet<Permission>` через `effectivePermissions(user)`
(`apps/api/src/common/authz/effective-permissions.ts`). Сегодня это ровно
`permissionsFor(role, lider)`; B6 добавит сюда персональные extra/denied-права — и
только сюда: guard, сервисы и `/auth/me` при этом не меняются.

- Тот же модуль (`toPermissionList`) даёт `UserDto.permissions: Permission[]` —
  в `GET /auth/me` и в `{ user }` каждого auth-ответа (`verify-code`, `google`,
  `refresh`, `change-password`), без дублей, в порядке каталога. Web считает этот
  список авторитетным.
- **В JWT прав нет** (тест закрепляет): понижение роли, снятие флага лидера, а в
  B6 — отзыв права действуют со следующего запроса, а не после истечения access.
- Guard и сервисы читают только `req.user.permissions` и **никогда** не
  пересчитывают права из `role`. Пользователь без набора (refresh-payload,
  самодельный объект) прав не имеет. В тестах пользователей строит
  `common/testing/make-auth-user.ts` (`makeAuthUser`, `withRole`, `withoutPermission`).

### Цепочка guard'ов

Глобальные `APP_GUARD` в `app.module.ts` (порядок регистрации = порядок
выполнения), за ними — guard'ы из `@UseGuards` контроллера:

```
ThrottlerGuard → JwtAuthGuard → PermissionsGuard → @UseGuards(...) контроллера (ownership)
```

- `JwtAuthGuard` — 401 без валидного access (кроме `@Public`); кладёт `AuthUser` в `req.user`.
- `PermissionsGuard` — решение об авторизации роута (ниже).
- `OpiekunOwnershipGuard`, `CarrierOwnershipGuard` — scope одного ресурса по
  `@OpiekunOwns` / `@CarrierOwns`; стоят в `@UseGuards` контроллера, обычно на классе.

### `PermissionsGuard` — deny by default

`apps/api/src/modules/auth/guards/permissions.guard.ts`. Метаданные читаются через
`getAllAndOverride([handler, class])` — метод перекрывает класс. По порядку:

1. `@Public()` → пропуск. Проверяется первым: на `POST /auth/refresh` в `req.user`
   лежит refresh-payload без `permissions`.
2. `@AuthenticatedOnly(reason)` → пропуск, если `req.user` есть (любая сессия,
   права не смотрятся); иначе 403.
3. `@RequirePermission(...)` → пропуск, если в `req.user.permissions` есть **хотя
   бы одно** из прав (any-of). Набора нет → 403 + warn: fail closed, из роли не
   пересчитывается.
4. Ничего не объявлено → **403** + warn с именем хендлера. Роут без решения об
   авторизации — баг, а не «любая сессия»; до main его не пускает inverse-правило
   (§«Фикстуры»).

Противоречивые пары (`@Public` или `@AuthenticatedOnly` рядом с
`@RequirePermission`, `@Public` + `@AuthenticatedOnly`) рантайм разрешает этим
порядком, но в CI они красные. Тела 403 (`auth.constants.ts`):
`FORBIDDEN_NO_USER_MESSAGE` = «Brak uprawnień» (нет пользователя или нет решения),
`FORBIDDEN_NOT_GRANTED_MESSAGE` = «Brak uprawnień dla tej roli» (прав не хватает) —
те же строки, что отдавал ролевой guard до трека B.

```ts
@Controller('claims')
@UseGuards(CarrierOwnershipGuard)                      // scope одного ресурса
export class ClaimsController {
  @Get()
  @RequirePermission('claims.read')                    // admin, pracownik, przewoznik
  list(@CurrentUser() user: AuthUser, @Query() q: ClaimFilters) { ... }
  // Какие строки — сервис по роли: admin/pracownik все, przewoznik свои (`// scope:`).

  @Post(':nrZgl/preview')
  @RequirePermission('claims.submit', 'claims.verify')  // any-of
  @CarrierOwns('nrZgl', 'param', 'claimNrZgl')
  previewExisting(...) { ... }
}
```

### `@AuthenticatedOnly(reason)`

`modules/auth/decorators/authenticated-only.decorator.ts` — явное решение «любой
залогиненный» для роутов, которые нужны каждой роли. `reason` (не короче
`AUTHENTICATED_ONLY_MIN_REASON_LENGTH` = 20 символов) пишется для ревьюера и
inverse-правила, рантайм его не читает. Сегодня ровно 5 роутов:

| Роут | Почему без права |
|---|---|
| `GET /auth/me` | свой профиль сессии |
| `POST /auth/logout` | закрыть свою сессию |
| `POST /auth/change-password` | self-service и выход из принудительной смены пароля (`mustChangePassword`) — для любой роли |
| `GET /trailer-types` | справочник для форм всех панелей; запись — `trailer_types.manage` |
| `GET /integrations/bugbot/handoff` | баг-репорт доступен всем; `kind=idea` — capability `bugbot.submit_idea` в сервисе |

Предпочитай право из каталога: новый `@AuthenticatedOnly` — осознанное решение,
которое видно в диффе фикстуры как `"AUTHENTICATED"`.

### Capability в сервисах, scope на роли

- **Capability** — право, которое решает ветку внутри сервиса, а не роут:
  `can(user, p)` / `canAny(user, ps)` из `apps/api/src/common/authz/can.ts`. Читают тот
  же `AuthUser.permissions` и так же fail closed (нет набора или пустой список →
  `false`). Права, которые не гейтят ни одного роута, перечислены с местом проверки в
  `SERVICE_CAPABILITIES` (`common/authz/endpoint-permissions.ts`):
  `claims.verify_pending_authorization`, `vehicles.rates.read`,
  `vehicles.fuel_card.read`, `bugbot.submit_idea`.
- **Scope** — «какие строки» (`_scopeFilters`, `opiekun ? свои : все`,
  ownership-guards) — остаётся на **роли**: он завязан на структуру данных роли
  (`Carrier.opiekunId`, `Carrier.userId`, `Vehicle.plannerId`, `User.teamId`, …).
  Каждое такое место помечено `// scope:` с ключом. Правом scope не заменяют
  (docs/25 §0 «Не цель»): выданное другой роли право не должно расширить строки до
  «все» — риск R4 (docs/25 §6), отсюда `GRANTABLE_EXTRA` в B6.

```ts
// capability — право
if (kind === 'idea' && !can(user, 'bugbot.submit_idea')) throw new ForbiddenException(...);

// scope — роль
// scope: opiekun видит только своих перевозчиков (Carrier.opiekunId)
const where = user.role === 'opiekun' ? { opiekunId: user.sub } : {};
```

### Лидер (`User.lider`)

Лидер — не роль, а флаг над базовой ролью (docs/28); его права —
`permissionsFor(role, true)`. Единственное лидерское право сегодня —
`vehicles.planner_transfer.decide` у `planista`, поэтому planista решает передачи
машин **только через флаг**: planista без `lider` на
`POST /planner-transfers/:id/{approve,reject}` получает 403 от `PermissionsGuard`
(«Brak uprawnień dla tej roli», до сервиса). Ресурсную часть — лидер именно этого
`fromPlanner`, не автор и не получатель — по-прежнему проверяет сервис
(`planner-transfer.rules.ts`): правом её не выразить. Edge флага не знает (§Middleware).

### Фикстуры и `npm run authz:snapshot`

Три закоммиченные фикстуры в `apps/api/src/common/authz/__fixtures__/`.
`roles-snapshot.spec.ts` строит их из живых метаданных всех контроллеров `AppModule`
(`common/authz/roles-snapshot.ts`; без БД и провайдеров) и при расхождении падает с
построчным диффом.

| Фикстура | Что записано | Что доказывает |
|---|---|---|
| `endpoint-permissions.snapshot.json` | роут → `"PUBLIC"` / `"AUTHENTICATED"` / any-of список прав | **источник по роутам**: что требует каждый роут. Новый роут или сменившееся требование — одна строка диффа |
| `endpoint-roles.snapshot.json` | роут → `"PUBLIC"` / `"AUTHENTICATED"` / роли, которые проходят | снята в B1 до замены декораторов, с тех пор неизменна. `endpoint-permissions.spec.ts`: каталог, применённый к фикстуре прав (`rolesSatisfying(…, { lider: true })`), воспроизводит её точно — никто не получил и не потерял доступ |
| `endpoint-ownership.snapshot.json` | роут → `@OpiekunOwns` / `@CarrierOwns` с аргументами | ни один ownership-guard не потерян и не сменил источник id |

`endpoint-permissions.spec.ts` держит и inverse-правило над живыми метаданными:
каждый не-`@Public` роут несёт `@RequirePermission` **или** `@AuthenticatedOnly` с
причиной, никогда оба; `@AuthenticatedOnly`-роуты — ровно записи `"AUTHENTICATED"`
фикстуры; каждое право каталога гейтит роут (по фикстуре) **или** стоит в
`SERVICE_CAPABILITIES` — не оба и не ни одно.

Перезапись: `npm run authz:snapshot -w api` — запускает `roles-snapshot.spec` с
`AUTHZ_SNAPSHOT_UPDATE=1` и пишет все три фикстуры. Роут **без решения** не
записывается никогда: генератор считает его противоречием, а не `"AUTHENTICATED"`.

### Как добавить роут

1. На хендлер (или класс) — `@RequirePermission('домен.действие', …)` с правом из
   каталога; если роут нужен каждой роли — `@AuthenticatedOnly('почему …')`. Scope
   одного ресурса — `@OpiekunOwns` / `@CarrierOwns` и guard в `@UseGuards` контроллера.
2. `npm run authz:snapshot -w api`.
3. Просмотреть дифф: в `endpoint-permissions` — ровно новая строка с ожидаемым
   требованием; в `endpoint-roles` — та же строка с ожидаемыми ролями; в
   `endpoint-ownership` — если роут скоупится ownership-guard'ом. Закоммитить
   фикстуры вместе с кодом.
4. Если понадобилось новое право или сменились права роли — правка
   `packages/shared/src/permissions.ts`, регенерация блока docs/03
   (`npm run -s authz:matrix -w @magguarantee/shared`), строка в docs/25 §2. Смена
   «кто что может» — отдельный PR с обновлением docs/03 (docs/25 §0).

Роут без решения — красный CI (inverse-правило и противоречие в снапшоте); если он
всё же доедет до рантайма — 403 всем и warn в логе.

> **Что изменилось (трек B, 2026-10-23).** До трека B роуты гейтил `@Roles(...)` +
> глобальный `RolesGuard`, а роут без `@Roles` пропускал любую сессию. B2 перевёл
> 135 роутов на `@RequirePermission`, B3 — capability в сервисах на `can()`, B4 —
> web на `UserDto.permissions`; B5 (`3579226`) удалил `@Roles`, `RolesGuard` и
> `ROLES_METADATA_KEY`, ввёл deny by default и `@AuthenticatedOnly`, а рукописную
> таблицу `ENDPOINT_PERMISSIONS` заменил сгенерированной фикстурой. Кто что может —
> не изменилось (фикстуры ролей и ownership байт-в-байт), кроме принятого в B2c:
> planista без флага лидера на approve/reject получает 403 от guard'а вместо
> `PLANNER_TRANSFER_NOT_DECIDER` от сервиса.

### OwnershipGuard для opiekun-эндпоинтов

`apps/api/src/common/guards/opiekun-ownership.guard.ts`, работает по метаданным:
без `@OpiekunOwns(name, source, as)` на роуте — no-op.

- admin → пропуск (доступ ко всем перевозчикам); любая роль, кроме opiekun, →
  пропуск (её scope решают другие guard'ы и сервис);
- opiekun → id берётся из `param` / `body` / `query` по метаданным и разрешается
  до `carrierId` (vehicle / driver / trailer / claim / delegation → их `carrierId`);
  `carrier.opiekunId !== user.sub` → 403 «Nie masz uprawnień do tego przewoźnika»;
  нет id → 400, нет ресурса → 404.

pracownik сюда не доходит: на carrier- и fleet-роутах его останавливает
`PermissionsGuard` — в его наборе нет `carriers.*`, `vehicles.read`, `fleet.write` и т.п.

```ts
@Controller('carriers')
@UseGuards(OpiekunOwnershipGuard)            // ownership — на классе
export class CarriersController {
  @Patch(':id')
  @RequirePermission('carriers.write')        // admin, opiekun — НЕ pracownik
  @OpiekunOwns('id', 'param', 'carrierId')    // opiekun — только свой перевозчик
  update(@Param('id') id: string, ...) { ... }
}
```

### CarrierOwnershipGuard

`apps/api/src/common/guards/carrier-ownership.guard.ts`, тоже по метаданным
(`@CarrierOwns(name, source, as)`). Действует только на `przewoznik`: ресурс
(claim / vehicle / driver / trailer / delegation) должен принадлежать его `Carrier`
(`Carrier.userId = user.sub`; `carrierId` в JWT нет, профиль читается на запросе).
Остальные роли — пропуск.

```ts
@Controller('vehicles')
@UseGuards(OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class VehiclesController {
  @Get(':id')
  @RequirePermission('vehicles.read')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  getById(...) { ... }
}
```

## Multi-role

Не реализовано и **не планируется** — см. [docs/03 §Multi-role](03-roles.md#multi-role):
одна учётка = одна роль, JWT несёт одну роль, `alternateRoles` и переключателя
панелей нет. «Этому человеку ещё одна функция» решается точечными правами
(docs/25 §3 B6), а не второй ролью.

## Logout

- `POST /auth/logout`: revoke refresh-токен (`revokedAt = now()`), очистка cookies.
- ⏳ Не реализовано: `GET /auth/sessions` (список сессий с IP/UA) и `/auth/revoke-all`. Сейчас отзыв всей семьи токенов делается только автоматически — при детекте повторного использования refresh-токена.

## Audit и события безопасности (2026-09-14)

Закрыт п.4 аудита логирования: раньше из всего auth-цикла в `audit_log` попадал только `change-password`, а неудачный вход не оставлял следов нигде.

**Правило:** на `@Public`-роутах `@Audit` запрещён (см. [13-api-design.md](13-api-design.md) §«Audit на уровне API»). Все строки ниже пишет `AuthService` на root-клиенте, актор — затронутый пользователь, IP — `req.ip`, user agent — в `metadata`.

**Успех и security-события → `audit_log`:**

| Action | Когда | Если запись аудита упала |
|---|---|---|
| `passwordLogin` | `verify-code` успешен, до выпуска токенов (пара к `googleLogin`) | запрос падает, сессия не выдаётся |
| `resetPassword` (`metadata.via = 'forgotPassword'`) | self-service сброс пароля, до смены | сброс падает, пользователь запрашивает новый код |
| `logout` | только если была живая сессия | ERROR в лог, сессия всё равно закрыта |
| `detectRefreshTokenReuse` | повторное использование отозванного refresh; отозвана вся семья (`tokenId`, `revokedAgeMs`, `rotated`, `sessionsRevoked`) | ERROR в лог, 401 остаётся |
| `lockAccount` | 10-й неверный пароль (`LOGIN_MAX_FAILED_ATTEMPTS`), блок 15 мин | ERROR в лог |
| `lockTwoFactorSession` / `lockPasswordResetSession` | 5-я неверная попытка кода; один раз на блокировку | ERROR в лог, 423 остаётся |
| `system.rejectOrphanedVerificationCode` | код совпал, а сессии нет (подозрение на кражу; пользователь не определяется) | ERROR в лог |

**Неудачные попытки → только WARN-лог**, чтобы брутфорс не раздувал `audit_log`. Формат строки `{ msg, event, reason, ipAddress, userAgent (≤256), …ids }`, логин и email сырыми не пишутся (для неизвестного логина — `loginFingerprint`, префикс sha256):

| `event` | `reason` |
|---|---|
| `loginRefused` | `unknown_login`, `wrong_password`, `account_inactive`, `account_locked`, `account_without_email`, `account_inactive_at_verify` |
| `twoFactorCodeRejected` / `passwordResetCodeRejected` | `wrong_code`, `too_many_attempts`, `session_locked`, `code_expired`, `code_matched_without_session` |
| `twoFactorResendRefused` / `passwordResetResendRefused` | `cooldown_active` |
| `passwordResetRefused` | `account_inactive` |
| `googleLoginRefused` | `id_token_rejected`, `carrier_account`, `account_inactive`, `directory_unavailable`, `not_in_directory`, `employee_inactive`, `no_role_for_stanowisko` |

Ответы и тайминги (анти-энумерация) не изменились. «Benign race heal» у refresh поднят с `debug` до `info`. Ошибки `google-auth-library` логируются урезанными (`libraryErrorSummary`) — их полный текст содержит декодированный id_token с email.

**Вне auth-модуля:** фильтр ошибок пишет WARN на каждый 401 / 403 / 429 (метод, шаблон роута, `userId`, IP) — это единственный след IDOR-разведки и перебора ролей.

**Важно для прода:** IP во всех этих записях и ключ троттлинга корректны, только когда в Caddy задан `UPSTREAM_PROXY_CIDRS` (docs/23). Без него у всех пользователей IP корпоративного nginx — и один общий бакет лимитов.

## Защита endpoints

| Endpoint | Аутентификация | Авторизация (`PermissionsGuard`) |
|---|---|---|
| `POST /auth/login` | — | `@Public`; rate-limit 5/min/IP |
| `POST /auth/verify-code` | sessionToken | `@Public`; rate-limit |
| `POST /auth/refresh` | refresh-cookie | `@Public` (+ `JwtRefreshGuard`); rate-limit 60/min/IP |
| `GET /auth/me` | access | `@AuthenticatedOnly` — любая роль; ответ несёт `permissions` (эффективные права этого запроса, порядок каталога) |
| `POST /auth/logout` | access | `@AuthenticatedOnly` |
| `GET /carriers` | access | `carriers.read` (admin / opiekun — строки: свои) — НЕ pracownik |
| `POST /claims` | access | `claims.submit` (przewoznik) + `@CarrierOwns` на выезд (`delegationId` из body) |
| `PATCH /claims/:n` | access | `claims.verify` (admin / pracownik) |
| `POST /delegations/:id/in-transit` | access | `delegations.transit` (admin / weryfikator) |
| `GET /diagnostics/*` | access | `diagnostics.manage` (admin); `GET /diagnostics/dashboard` — `dashboard.read` (admin / pracownik) |
| `GET /integrations/bugbot/handoff` | access | `@AuthenticatedOnly` — любая роль; `kind=idea` — capability `bugbot.submit_idea` (admin); rate-limit 10/min/user |

Полный список «роут → требование» — фикстура
`apps/api/src/common/authz/__fixtures__/endpoint-permissions.snapshot.json` (§Roles & Guards).

## Защита от типичных атак

| Атака | Защита |
|---|---|
| **Brute force на login** | rate-limit 5/min/IP + lockout user после 10 неудач |
| **Credential stuffing** | rate-limit + (опц.) проверка против HIBP |
| **2FA brute force** | 5 attempts → lockout 5 мин |
| **CSRF** | SameSite=Lax cookies (не едут на cross-site POST/XHR; все мутации POST/PATCH/DELETE), double-submit для cookie auth |
| **XSS** | React auto-escape + Helmet CSP, HttpOnly cookies |
| **Session fixation** | Refresh rotation, revocation tracking |
| **JWT stealing** | Short access TTL (15 мин), refresh in HttpOnly Lax cookie |
| **Session theft (cookie)** | Lax + Secure + HttpOnly cookies, IP/UA fingerprint в refresh_tokens (опц.) |
| **Email injection в кодах** | Гарантировано константный шаблон, не user input |
| **Account enumeration** | `/auth/login` — одинаковый response 401/202 для несуществующего user-а и неверного пароля (нельзя differentiate) |
| **Reset flooding** | rate-limit reset endpoints |

## Интеграция в Next.js (apps/web)

### Middleware (защита маршрутов + silent refresh)

Middleware — это первая линия защиты для **document-навигаций** (typed URL, full
reload, server-rendered route). Здесь нет XHR-перехватчика, поэтому middleware
сам реализует контракт `401 → refresh → retry`, что и клиентский
`fetchWithRefresh`:

- `mt_access` ставится с `maxAge == 15 мин`, поэтому браузер удаляет его через
  15 минут — даже если `mt_refresh` валиден 30 дней. Проверка «есть ли cookie»
  недостаточна: токен может быть просрочен ещё до удаления.
- Поэтому middleware: декодирует payload `mt_access` (без проверки подписи — это
  делает API) и считает `needRefresh = !access || isAccessExpired(access)`
  (нет `exp` или `exp*1000 <= now` с запасом в несколько секунд).
- Если `needRefresh` и есть `mt_refresh` — серверный `POST /api/v1/auth/refresh`
  с форвардом `Cookie: mt_refresh=<value>`. API ротирует пару и отвечает
  `Set-Cookie` для `mt_access` **и** `mt_refresh`.
- Успех: middleware (a) форвардит сырые `Set-Cookie` строки в браузер
  (`res.headers.append('set-cookie', sc)` — атрибуты не трогаем), (b) переписывает
  `cookie`-заголовок запроса через `NextResponse.next({ request: { headers } })`,
  чтобы downstream Server Components (`getServerUser` → `/auth/me`) в ЭТОМ ЖЕ
  запросе увидели свежий access-токен. Эти `Set-Cookie` переносятся и на любой
  итоговый ответ — включая role-mismatch redirect — чтобы ротированные токены
  не потерялись.
- Отказ refresh (non-ok / network error) или нет `mt_refresh` → redirect на
  `/login` (с `?next=` для не-root, не-login путей). Без ретраев: если refresh
  не прошёл, сервер уже инвалидировал сессию (редкий cross-tab race → login —
  корректный безопасный исход).
- После (возможного) refresh — гейтинг пути по свежему `access` через
  `lib/roles.ts`: `isGatedPath` → `isAllowedForRole(path, role)` → иначе redirect
  на `landingFor(role)`. `isAllowedForRole` = префиксы панели роли
  (`ROLE_ALLOWED_PREFIXES`; панель — это роль) + `PATH_PERMISSIONS` (под-пути
  `/employee/*`, которым нужно право, any-of) + scope-правило
  `SCOPE_RESTRICTED_EMPLOYEE_PREFIXES` (`/employee/delegations` → admin).
- Edge знает из JWT только роль, поэтому право пути проверяется по каталогу роли:
  `hasAnyPermission(role, rule, false)` = `permissionsFor(role)` — **без флага
  лидера и без персональных overrides** (docs/25 R3). Это грубая защита в глубину:
  точную проверку по эффективному списку делает layout / page
  (`requirePermission`, §Hook useAuth), решает API.
- Каталог edge берёт через чистый subpath `@magguarantee/shared/permissions`
  (tsconfig `paths` → `packages/shared/src/permissions.ts`, только type-импорты),
  а не через barrel `@magguarantee/shared`, который тянет все zod-схемы в
  edge-бандл; `lib/auth/edge-imports.test.ts` падает на value-импорте barrel'а
  из графа `middleware.ts`.

```ts
// apps/web/middleware.ts (сокращённо — полная версия в репозитории)
import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'mt_access';
const REFRESH_COOKIE = 'mt_refresh';
const API_BASE =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let refreshedSetCookies: string[] = [];

  if (!access || isAccessExpired(access)) {
    if (!refresh) return loginRedirect(req);
    try {
      const apiRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE}=${refresh}` },
      });
      if (!apiRes.ok) return loginRedirect(req);
      refreshedSetCookies = apiRes.headers.getSetCookie();
      const newAccess = parseSetCookie(refreshedSetCookies, ACCESS_COOKIE);
      if (!newAccess) return loginRedirect(req);
      access = newAccess; // path gating uses the fresh role claim
    } catch {
      return loginRedirect(req);
    }
  }

  // ...build response: rewrite request `cookie` header (so this request's
  // Server Components see the new token) + append refreshedSetCookies to the
  // browser response; carry them onto role-mismatch redirects too; then run
  // path gating (role prefixes + PATH_PERMISSIONS) with `access`.
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)'],
};
```

> Требование API (выполнено отдельно): cookie `mt_refresh` должен иметь
> `Path=/` (а не `/api/v1/auth`), иначе браузер не пришлёт его на web-роуты и
> middleware не сможет его прочитать.

### Hook `useAuth` и права в UI

```ts
// lib/hooks/useAuth.ts (сокращённо)
export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useAuth(): UseAuthResult {
  const { data, isLoading, isError, ... } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: getMe,            // 401 → null (аноним), остальные ошибки — isError
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { user: data ?? null, isAuthenticated: !!data, isAnonymous: data === null, ... };
}
```

`user` — `UserDto` из `GET /auth/me`, с `permissions`; кэш `/me` заполняют и
ответы `verify-code` / `google` / `refresh` / `change-password`. Права в UI
решаются по **эффективному списку** пользователя, роль в права не пере-маппится
(docs/25 §3 B4):

| Где | Что |
|---|---|
| `lib/auth/permissions.ts` | единая точка входа web в каталог (через subpath `@magguarantee/shared/permissions`). `effectivePermissionsOf(user)` = `user.permissions`; только если поля нет (rolling deploy со старым api) — fallback `permissionsFor(role, lider)`, без overrides (пересмотреть в B6). `canAny(granted, rule)`, `PermissionRule` (право или any-of список), `ADMIN_SECTION_PERMISSIONS` для `(admin)/layout` |
| `lib/hooks/useCan.ts` (client) | `usePermissions()` — список пользователя (пустой, пока `/me` грузится, и у анонима); `useCan(rule)` — any-of, `false` без пользователя |
| `lib/auth/server.ts` (Server Components) | `requirePermission(rule, { onDenied: 'landing' \| 'forbidden' })`: аноним → `/login?next=…`, нет права → landing роли или `/employee/forbidden`. `requireRoleAccess(roles)` остаётся в layouts групп — панель это роль |
| `lib/nav.config.ts` | `filterNav(permissions, role)`: пункт меню по `permission`, в пределах ролей employee-shell (scope) |

Capability (кнопка hard-delete, колонка ставок) → `useCan` / `requirePermission`;
scope (какая панель, какой список) → роль.

```tsx
const canHardDelete = useCan('fleet.hard_delete');            // client
await requirePermission('audit.read', { onDenied: 'forbidden' }); // server page
```

### Auto-refresh interceptor

```ts
// lib/api/client.ts
async function fetchWithRefresh(url: string, opts: RequestInit) {
  let res = await fetch(url, { ...opts, credentials: 'include' });
  if (res.status === 401) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refreshed.ok) {
      res = await fetch(url, { ...opts, credentials: 'include' });
    } else {
      window.location.href = '/login';
    }
  }
  return res;
}
```

## Что НЕ делаем

- **Magic link** (login через одноразовую ссылку): можно добавить позже, но не на старте.
- **WebAuthn / Passkeys**: future improvement.
- **OAuth для перевозчиков**: они не на корпоративных Google-ах, нет смысла — `POST /auth/google` для роли `przewoznik` отвечает 403 `SSO_NOT_FOR_CARRIER`.
- **Redirect-flow Google** (`/auth/google/callback`, passport-google-oauth20): реализован front-side id_token-flow, callback-роута нет. Redirect остаётся запасным вариантом, если появятся жалобы на Safari ITP / блокировщики.
- **Свой IdP / Keycloak / OIDC-провайдер из MAGSpace**: MAGSpace — справочник сотрудников, не провайдер идентичности.
- **MFA через TOTP/SMS**: текущий 2FA email достаточен. SMS дорогой, TOTP требует app — не для всех перевозчиков подходит.
- **Single sign-out** (revoke во всех приложениях): мы одно приложение, не актуально.

## Чек-лист безопасности перед prod

- [ ] `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` — разные, ≥ 32 байта рандома.
- [ ] Все cookies: `Secure`, `HttpOnly`, `SameSite=Lax` (Lax, не Strict — иначе диплинки из писем теряют сессию; см. «Решение по cookie vs header»).
- [ ] Helmet включён с CSP, HSTS.
- [ ] CORS только для нашего домена (`NEXT_PUBLIC_APP_URL`).
- [ ] Rate-limit включён на login/verify/resend.
- [ ] bcrypt rounds = 12.
- [ ] При импорте из Sheets — все пароли пересохранены через bcrypt.
- [ ] Тесты на race-condition в `/auth/refresh` (двойной запрос).
- [ ] Логи не содержат plaintext пароли, JWT, 2FA-коды (Pino редактор PII — `Authorization`, `cookie`, `*.password`, `*.token`, `*.code`).
- [ ] Endpoint `/auth/sessions` для self-service — список активных refresh-токенов с IP/UA.
