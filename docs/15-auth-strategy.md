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
  alternateRoles?: Role[]; // если у carrier есть запись в OPIEKUN/PRACOWNIK
  iat: number;
  exp: number;
  jti: string;          // unique token ID (для revocation tracking)
};
```

### Access vs Refresh

| | Access | Refresh |
|---|---|---|
| TTL | 15 мин | 30 дней |
| Хранение | HttpOnly cookie или header | HttpOnly cookie (Lax) — НЕ в localStorage |
| Содержимое | full payload | минимум: `{sub, jti}` |
| Подпись | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` (разные!) |
| Revocation | в основном через истечение TTL | через таблицу `refresh_tokens` (revokedAt) |

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

### Декоратор `@Roles`

```ts
// common/decorators/roles.decorator.ts
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// usage
@Controller('claims')
export class ClaimsController {
  @Get()
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  list(@CurrentUser() user: User, @Query() q: ListQuery) { ... }
  // Service-level scope: admin/pracownik видят все, opiekun — только своих перевозчиков, przewoznik — только свои.

  @Patch(':nrZgl')
  @Roles('admin', 'pracownik')   // ← одно из НЕМНОГИХ мест где pracownik уместен — claims-верификация это его основная задача
  update(@Param('nrZgl') nrZgl: string, @Body() dto: UpdateClaimDto) { ... }
}

// CONTRAST: для CRUD по carrier/vehicle/driver/trailer pracownik НЕ допущен:
@Controller('carriers')
export class CarriersController {
  @Patch(':id')
  @Roles('admin', 'opiekun')   // ← pracownik сюда НЕ ходит (legacy: requireAdmin / _requireOpiekun)
  update(...) { ... }
}
```

### Guards

```ts
// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (!user) return false;
    const userRoles = [user.role, ...(user.alternateRoles ?? [])];
    return required.some(r => userRoles.includes(r));
  }
}
```

### OwnershipGuard для opiekun-эндпоинтов

```ts
// common/guards/ownership.guard.ts — проверяет что carrier принадлежит opiekun-у
@Injectable()
export class OpiekunOwnershipGuard implements CanActivate {
  constructor(private carriers: CarriersRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const { user } = req;
    // admin пропускается — у него доступ ко всем перевозчикам.
    // pracownik сюда НЕ должен попадать — он не имеет доступа к carrier-эндпоинтам вообще
    // (контроллер carriers поднимает 403 через @Roles('admin', 'opiekun')).
    if (user.role === 'admin') return true;
    if (user.role !== 'opiekun') return true; // другая роль — другой guard
    const carrierId = req.params.carrierId ?? req.body.carrierId ?? req.params.id;
    if (!carrierId) throw new BadRequestException('No carrier in request');
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) throw new NotFoundException('Carrier not found');
    if (carrier.opiekunId !== user.sub) {
      throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
    }
    return true;
  }
}
```

Применение:

```ts
@Patch('carriers/:id')
@Roles('admin', 'opiekun')   // ← НЕ 'pracownik' — у него нет доступа к carrier-CRUD
@UseGuards(JwtAuthGuard, RolesGuard, OpiekunOwnershipGuard)
update(@Param('id') id: string, ...) { ... }
```

### CarrierOwnershipGuard

Для перевозчика — что claim/vehicle/driver/trailer принадлежит ему:

```ts
@Injectable()
export class CarrierOwnershipGuard implements CanActivate {
  // ...
  // Проверяет что resource.carrierId === user.carrierId для role=przewoznik
}
```

## Multi-role (carrier ↔ opiekun-переключатель)

Текущий GAS: кнопка `#btnSwitchToEmployee` (`index.html:573`) — если carrier также имеет запись в `ADMIN`/`PRACOWNIK`/`OPIEKUN`, может переключиться.

**Реализация:**

В JWT есть `alternateRoles: Role[]`. На фронте — переключатель:

```tsx
// components/layout/RoleSwitcher.tsx
function RoleSwitcher() {
  const { user, switchRole } = useAuth();
  if (!user.alternateRoles?.length) return null;
  return (
    <Select onValueChange={switchRole} defaultValue={user.activeRole}>
      <SelectTrigger>{user.activeRole}</SelectTrigger>
      <SelectContent>
        {[user.role, ...user.alternateRoles].map(r => (
          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Сам user в БД не дублируется — это один `User` с `role=przewoznik`, но в `users` таблице с тем же `email` есть второй row с `role=opiekun`. При login находим оба, склеиваем в один UserDto с `role` (primary) и `alternateRoles` (остальные). Переключение — это смена `Authorization` контекста через **новый JWT**: `POST /auth/switch-role` с {role}. Сервер выдаёт новый access-токен с другим `role` claim, refresh не меняется.

Альтернативно: один user с массивом ролей, но это ломает 1:1 mapping с auth-листами и усложняет миграцию данных. Текущий подход проще.

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

| Endpoint | Аутентификация | Авторизация |
|---|---|---|
| `POST /auth/login` | — | rate-limit 5/min/IP |
| `POST /auth/verify-code` | sessionToken | rate-limit |
| `POST /auth/refresh` | refresh-cookie | rate-limit 60/min/IP |
| `GET /auth/me` | access | — |
| `POST /auth/logout` | access | — |
| `GET /carriers` | access | role: admin / opiekun(own) — НЕ pracownik |
| `POST /claims` | access | role: przewoznik + ownership на vehicle |
| `PATCH /claims/:n` | access | role: admin / pracownik |
| `POST /delegations/:id/in-transit` | access | role: weryfikator |
| `GET /diagnostics/*` | access | role: admin |

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
- После (возможного) refresh — role-gating по свежему `access` через
  `lib/roles.ts` (`isGatedPath` / `isAllowedForRole` / `landingFor`).

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
      access = newAccess; // role-gating uses the fresh claim
    } catch {
      return loginRedirect(req);
    }
  }

  // ...build response: rewrite request `cookie` header (so this request's
  // Server Components see the new token) + append refreshedSetCookies to the
  // browser response; carry them onto role-mismatch redirects too; then run
  // role-gating with `access`.
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)'],
};
```

> Требование API (выполнено отдельно): cookie `mt_refresh` должен иметь
> `Path=/` (а не `/api/v1/auth`), иначе браузер не пришлёт его на web-роуты и
> middleware не сможет его прочитать.

### Hook `useAuth`

```ts
// lib/hooks/useAuth.ts
export function useAuth() {
  const { data: user, ...rest } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
    staleTime: 5 * 60_000,
  });
  return { user, ...rest };
}
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
