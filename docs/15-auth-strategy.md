# 15. Стратегия авторизации

> Текущий GAS-флоу: login + password → 6-значный код в email → user-объект в JS-памяти. После перезагрузки страницы — заново. Никаких сессий. Пароли в plaintext.
>
> Цель: те же два шага (login → 2FA-код), но с JWT-сессиями, bcrypt-хешами и опциональным Google OAuth для внутренних сотрудников.

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
                                       Strict)    │
                                                  │
                                                  ▼
                                  All API calls: Authorization: Bearer
                                                  или Cookie: mt_access
```

## Решение по cookie vs header

**Используем оба:**
- **Web (Next.js):** HttpOnly cookies. Защищены от XSS (нельзя прочитать из JS), CSRF mitigated через `SameSite=Strict` + double-submit token на mutating endpoints.
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
| Хранение | HttpOnly cookie или header | HttpOnly cookie (Strict) — НЕ в localStorage |
| Содержимое | full payload | минимум: `{sub, jti}` |
| Подпись | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` (разные!) |
| Revocation | в основном через истечение TTL | через таблицу `refresh_tokens` (revokedAt) |

### Rotation

При каждом `/auth/refresh`:
1. Принимаем старый refresh.
2. Проверяем что не `revokedAt` и не `expiresAt < now()`.
3. **Помечаем старый `revokedAt = now()`**.
4. Выдаём новую пару (access + refresh).
5. Если приходит refresh, который **уже** revoked → логично воспринимать как theft → отзываем все refresh-токены user-а.

```ts
// auth.service.ts
async refresh(refreshTokenJwt: string) {
  const { sub, jti } = await this.jwt.verifyAsync(refreshTokenJwt, { secret: REFRESH_SECRET });
  const stored = await this.refreshTokens.findByHash(sha256(refreshTokenJwt));
  if (!stored) throw new UnauthorizedException('No such token');
  if (stored.revokedAt) {
    // theft suspected — отзываем всё
    await this.refreshTokens.revokeAllForUser(sub);
    throw new UnauthorizedException('Token reuse detected — all sessions revoked');
  }
  await this.refreshTokens.revoke(stored.id);
  return this.issuePair(sub);
}
```

## 2FA: 6-значный email-код

Те же правила, что в GAS:

| Параметр | Значение | Где |
|---|---|---|
| Длина | 6 цифр (`000000-999999`, leading zeros ok) | `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')` |
| TTL | 600 сек (10 мин) | Redis SETEX |
| Max attempts | 5 | Redis counter, key `2fa:attempts:{sessionToken}` |
| Lockout | 5 мин (или forever?) | После 5-й — Redis SETEX 300, ключ `2fa:lockout:{sessionToken}` |
| Resend | После 30 сек, 3 раза в 5 минут | Redis counter |

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

## Google OAuth (опц.)

Для внутренних сотрудников MagTrans (admin, pracownik, opiekun, planista, dyspozytor, eksport, weryfikator) — все имеют корпоративный Google email. Можно разрешить SSO:

```
GET /auth/google
  → redirect к Google OAuth (passport-google-oauth20)
  → callback /auth/google/callback
  → найти user в БД по email
  → если есть и role не 'przewoznik' → выдать JWT (без 2FA, т.к. Google уже проверил)
  → если нет → 403
```

Это **дополнительный** flow, не замена основного. Перевозчики (przewoznik) идут через `/auth/login` + 2FA.

Конфигурация:
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — из Google Cloud Console.
- `hd=magtrans.eu` параметр — ограничивает domain.
- Scope: только `email profile` (не нужен calendar / drive).

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
- При компрометации (например GET /auth/sessions показывает странный IP) → endpoint `/auth/revoke-all` для отзыва всех refresh-ов user-а.

## Защита endpoints

| Endpoint | Аутентификация | Авторизация |
|---|---|---|
| `POST /auth/login` | — | rate-limit 5/min/IP |
| `POST /auth/verify-code` | sessionToken | rate-limit |
| `POST /auth/refresh` | refresh-cookie | — |
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
| **CSRF** | SameSite=Strict cookies, double-submit для cookie auth |
| **XSS** | React auto-escape + Helmet CSP, HttpOnly cookies |
| **Session fixation** | Refresh rotation, revocation tracking |
| **JWT stealing** | Short access TTL (15 мин), refresh in HttpOnly Strict cookie |
| **Session theft (cookie)** | Strict + Secure cookies, IP/UA fingerprint в refresh_tokens (опц.) |
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
- **OAuth для перевозчиков**: они не на корпоративных Google-ах, нет смысла.
- **MFA через TOTP/SMS**: текущий 2FA email достаточен. SMS дорогой, TOTP требует app — не для всех перевозчиков подходит.
- **Single sign-out** (revoke во всех приложениях): мы одно приложение, не актуально.

## Чек-лист безопасности перед prod

- [ ] `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` — разные, ≥ 32 байта рандома.
- [ ] Все cookies: `Secure`, `HttpOnly`, `SameSite=Strict`.
- [ ] Helmet включён с CSP, HSTS.
- [ ] CORS только для нашего домена (`NEXT_PUBLIC_APP_URL`).
- [ ] Rate-limit включён на login/verify/resend.
- [ ] bcrypt rounds = 12.
- [ ] При импорте из Sheets — все пароли пересохранены через bcrypt.
- [ ] Тесты на race-condition в `/auth/refresh` (двойной запрос).
- [ ] Логи не содержат plaintext пароли, JWT, 2FA-коды (Pino редактор PII — `Authorization`, `cookie`, `*.password`, `*.token`, `*.code`).
- [ ] Endpoint `/auth/sessions` для self-service — список активных refresh-токенов с IP/UA.
