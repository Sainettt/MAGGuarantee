# 24. План: Google SSO + MAGSpace как справочник сотрудников + слой permissions

> **Статус: трек A РЕАЛИЗОВАН (2026-09-09). Трек B — не начат.**
>
> Сторона MAGSpace закрыта их коммитом `33094eb` (2026-09-08): контракт §A0
> реализован целиком, см. `MAGSpace/docs/07-directory-api.md`. Этапы A1–A6
> выполнены; расхождения с текстом ниже перечислены в §9 — читать её раньше,
> чем сам план, потому что в шести местах реализация отличается от того, что
> здесь написано, и отличается намеренно.
>
> Что теперь описывает поведение системы: [15-auth-strategy.md](15-auth-strategy.md)
> §«Google SSO + MAGSpace» (flow, коды отказов), [03-roles.md](03-roles.md)
> §«Откуда берётся роль», [16-jobs-and-integrations.md](16-jobs-and-integrations.md)
> §«MAGSpace directory reconcile», [13-api-design.md](13-api-design.md),
> [12-database-schema.md](12-database-schema.md),
> [23-prod-deployment-runbook.md](23-prod-deployment-runbook.md) §1.2/§2.4/§4/§8.
>
> Этот документ остаётся **записью решений и их обоснований** — он не
> переписывался под факт реализации.

## 0. Зачем

Сегодня сотрудников MAGTRANS в MAGGuarantee заводит админ вручную (`POST /users`),
роль назначается там же и жёстко. Появилось приложение **MAGSpace** (тот же VPS,
тот же compose-стек), где руководство само заводит/увольняет сотрудников и
назначает им **stanowiska** (должности). Оно становится **источником правды о
сотрудниках** для MAGGuarantee. Это открывает вход через Google без ручного
администрирования:

```
Сотрудник ──► Google (кто ты: jan.kowalski@magtrans.eu)
                 │
                 ▼
          MAGGuarantee API ──► есть локальный User (admin)?  ──да──► вход с локальной ролью
                 │ нет
                 ▼
          MAGSpace: сотрудник ли, активен ли, какое stanowisko
                 │
                 ▼
          stanowisko ──► роль MAGGuarantee (таблица маппинга, ведёт admin)
                 │
                 ▼
          User создан/обновлён ──► JWT-пара как после 2FA ──► панель по роли
```

Два независимых трека:

| Трек | Что | Зачем | Оценка |
|---|---|---|---|
| **A. SSO + MAGSpace** | Вход через Google, роль из stanowiska, авто-заведение и авто-отключение | Руководство управляет доступом без разработчика | ≈ 6–7 раб. дней в MAGGuarantee + ≈ 1.5–2 дня в MAGSpace |
| **B. Слой permissions** | Именованные права между ролью и проверкой, один источник вместо ~250 точек | Права роли меняются в одном файле; база для per-user overrides | ≈ 4 раб. дня |

Порядок: **A, затем B.** Трек B решено делать (§7 в.9), отдельными PR после A.

---

## 1. Ключевые решения (трек A)

| # | Решение | Обоснование |
|---|---|---|
| 1 | **Google = identity, MAGSpace = directory.** Google отвечает «кто это», MAGSpace — «работает ли у нас и на какой должности». | Не строим свой IdP. Google Workspace уже даёт 2FA и управление аккаунтами. |
| 2 | **Матчинг по полю `email` в MAGSpace.** Никакого парсинга `imię.nazwisko@`. | Диакритика (Łukasz → lukasz), двойные фамилии, тёзки, смена фамилии. Все сотрудники в `@magtrans.eu` (§7 в.3). |
| 3 | **MAGSpace отдаёт stanowisko, а не роль.** Маппинг `stanowisko → роль MAGGuarantee` живёт **в MAGGuarantee**, в таблице, которую ведёт admin через UI. | MAGSpace хранит должности (§7 в.2); каждое приложение интерпретирует их само. Admin MAGGuarantee — единственный, кто знает, что «Spedytor» = `planista`. |
| 4 | **Роль `admin` только локальная.** Из stanowiska admin не выводится никогда. Локальные пользователи (`managedBy=local`) входят через Google без обращения к MAGSpace: проверяется, что такой User есть, активен, и берётся его локальная роль. | §7 в.4. Руководство не может случайно раздать полный доступ. |
| 5 | **Front-side Google Identity Services → `id_token` → `POST /auth/google`.** Не redirect-flow. | Бек только верифицирует подпись; нет state/PKCE/callback. Redirect-flow — запасной вариант (Safari ITP). |
| 6 | **Google-вход без email-кода 2FA.** | Google уже подтвердил владение аккаунтом и применил свою 2FA. |
| 7 | **Парольный вход остаётся у всех как запасной.** Google-пользователь создаётся с `passwordHash = null`; пароль он может завести через «Zapomniałem hasła» (существующий flow), после чего входит паролем + 2FA. | §7 в.5. `validateCredentials` уже корректно отказывает при `passwordHash = null`, доработок не нужно. |
| 8 | **JIT-provisioning:** пользователь создаётся при первом успешном входе; при каждом входе имя/active/роль синхронизируются из MAGSpace. | Админ ничего не заводит руками. |
| 9 | **Deprovisioning — pull-only:** reconcile-cron каждые 15 минут опрашивает MAGSpace. Webhook **не делаем** в v1. | MAGSpace пока ничего не умеет отправлять (§7 в.8). Задержка отключения ≤ 15 мин приемлема для HR-сценария; при логине сверка всегда живая. |
| 10 | **Связь аккаунта по `googleSub`, а не только по email.** Первая привязка — по email, дальше — по `sub`. | `sub` стабилен, email в Workspace можно переименовать. |
| 11 | **`User.managedBy = 'magspace' \| 'local'`.** Для `magspace` роль и active в локальном UI read-only. Admin может переключать флаг (передать/забрать пользователя из-под MAGSpace). | Иначе локальная правка будет молча перезаписана при следующем входе. |
| 12 | **Перевозчики (`przewoznik`) не трогаем.** Логин + пароль + 2FA как сейчас. Google-вход для `role=przewoznik` отвечает 403 явно. | Не сотрудники. Проверка `hd` их отсекает, явный отказ — на случай тестовых `@magtrans.eu` у перевозчика. |
| 13 | **Reconcile по умолчанию в режиме `enforce`** с предохранителем (не отключать > 30 % или > 5 managed-пользователей за прогон, слать алерт). Режим `report` — переключатель для отладки. | Прода ещё нет (§7 в.6), легаси-пользователей сверять не надо. |
| 14 | **MAGSpace недоступен при логине:** новых не заводим (503 `SSO_DIRECTORY_UNAVAILABLE`), существующих активных managed-пользователей пускаем с последней синхронизированной ролью + warning в лог. Локальных это не касается. | Окно риска ограничено 15-минутным reconcile. |
| 15 | **Stanowisko без маппинга = нет доступа** (403 `SSO_NO_ROLE`). Первое такое событие на каждое stanowisko — письмо админам «появилась должность X без роли». | Fail-closed; admin узнаёт, что нужно дополнить таблицу. |

---

## 2. Трек A — этапы

### A0. Контракт и работа на стороне MAGSpace (≈ 1.5–2 дня, репо MAGSpace)

В MAGSpace сейчас нет API для внешних систем — контракт проектируется с нуля.
Делается первым, остальное в MAGGuarantee идёт параллельно против мока.

#### A0.1 Требования к данным

| Что | Требование |
|---|---|
| `Employee.email` | Обязательное, уникальное, хранится в нижнем регистре. В форме приёма **предзаполняется** по паттерну `imię.nazwisko@magtrans.eu` из полей имя/фамилия (с транслитерацией диакритики: ł→l, ż→z, ó→o …), человек может **поправить перед сохранением** (тёзки, двойные фамилии). После этого поле — просто данные, парсинга нет. |
| `Stanowisko` | **Фиксированный перечень** в коде MAGSpace (enum): `HANDLOWIEC`, `PLANISTA`, `LIDER_HANDEL`, … Наружу отдаётся `code` = значение enum (UPPER_SNAKE, пробелы → `_`) и `name` для отображения («Lider handel»). Код стабилен навсегда; новая должность = новое значение enum + деплой MAGSpace. Одноимённость с ролью MAGGuarantee (`PLANISTA` ↔ `planista`) **ничего не значит** — маппинг всегда явный. |
| `Employee.stanowisko` | Ровно **одно** на сотрудника, совмещений нет (§8 в.1). Исключения, если появятся, решаются per-user правами на функции (трек B5), а не вторым stanowisko. |
| `Employee.active` | Вычисляется из трудоустройства: `employedTo IS NULL OR employedTo > today`. Увольнение = `active=false`, **не удаление строки**. |

#### A0.2 Аутентификация между сервисами

- `Authorization: Bearer <MAGSPACE_INTERNAL_TOKEN>` — случайный токен ≥ 32 байт,
  один на потребителя (MAGGuarantee), хранится в env обеих систем. Сравнение
  constant-time. Нет/неверный → `401 { code: 'UNAUTHORIZED' }`.
- Эндпоинты `/internal/*` **не публикуются через Caddy/nginx** — MAGGuarantee
  ходит по внутренней docker-сети: `http://<magspace-api-container>:<port>`.
  Если контейнеры в разных compose-проектах — общая external network.
- Таймаут на стороне клиента 3 с, ретраев на пути логина нет.

#### A0.3 Эндпоинты (`/internal/v1/…`)

```
GET /internal/v1/employees/lookup?email=jan.kowalski@magtrans.eu
    email нормализуется (trim, lower-case)
    200 EmployeeDto
    404 { code: 'EMPLOYEE_NOT_FOUND' }
    400 { code: 'INVALID_EMAIL' }

GET /internal/v1/employees
    Все сотрудники, активные И неактивные (reconcile различает «уволен» и «удалён»).
    Без пагинации — штат ≈ 100 (§8 в.3); один ответ ~30–50 KB. Cursor не нужен.
    200 { items: EmployeeDto[], generatedAt: ISO-8601 }

GET /internal/v1/stanowiska
    Перечень должностей для выпадающего списка в admin-UI маппинга.
    Отдаётся из enum MAGSpace (не из БД), поэтому всегда полный.
    200 { items: [{ code: string, name: string }] }

GET /internal/v1/health
    200 { ok: true }   ← для диагностики MAGGuarantee (/diagnostics)
```

```ts
type EmployeeDto = {
  id: string;                 // стабильный ID сотрудника в MAGSpace
  email: string;              // lower-case
  firstName: string;
  lastName: string;
  active: boolean;
  stanowisko: { code: string; name: string } | null;   // ровно одно; null = ещё не назначено
  employedFrom: string;       // YYYY-MM-DD
  employedTo: string | null;  // YYYY-MM-DD
  updatedAt: string;          // ISO-8601
};
```

Ошибки — единый формат `{ code: string; message: string }`. Изменения контракта,
ломающие потребителя, — новый префикс `/internal/v2/`.

#### A0.4 Webhook (не в v1)

Когда MAGSpace научится отправлять события, добавляется
`POST {MAGGUARANTEE}/api/v1/internal/magspace/events` с HMAC-подписью тела
(`X-MAGSpace-Signature: sha256=…`), типы `employee.updated` /
`employee.deactivated`. Тогда reconcile-интервал растягивается до часа. Приёмник
на стороне MAGGuarantee — отдельный этап A7, вне текущей оценки.

### A1. Верификация Google `id_token` (≈ 0.5–1 день, api)

| Файл | Что |
|---|---|
| `apps/api/src/config/env.schema.ts` | `GOOGLE_OAUTH_CLIENT_ID`, `SSO_ALLOWED_HD` (default `magtrans.eu`) |
| `apps/api/src/modules/auth/google/google-id-token.service.ts` | `verifyIdToken` через `google-auth-library`: подпись, `aud === CLIENT_ID`, `iss`, `exp`, `email_verified === true`, `hd === SSO_ALLOWED_HD`. Возвращает `{ sub, email, name }`. |
| `apps/api/src/modules/auth/google/google-auth.controller.ts` | `POST /auth/google { idToken }` (`@Public`, throttle как у `/auth/login`). Успех → `setAuthCookies` + `{ user }`, тот же ответ, что у `/auth/verify-code`. |
| `packages/shared/src/schemas/auth.ts` | `GoogleLoginSchema`, коды ошибок `SSO_*` (см. A3). |
| `apps/api/src/modules/auth/auth.service.ts` | `loginWithGoogle(idToken, ctx)` — см. алгоритм в A2. Переиспользует `issuePair`, `updateLastLogin`, `resetFailedAttempts`. |

Тесты: unit на сервис (моканный `OAuth2Client`): чужой `aud`, нет `hd`,
`email_verified=false`, протухший токен.

### A2. Directory-клиент, маппинг, provisioning (≈ 1.5–2 дня, api + db)

**Prisma** (`packages/database/prisma/schema.prisma`, одна миграция):

```prisma
enum AuthProvider  { local  google }
enum UserManagedBy { local  magspace }

model User {
  // ...
  authProvider        AuthProvider  @default(local)
  managedBy           UserManagedBy @default(local)
  googleSub           String?       @unique
  magspaceEmployeeId  String?       @unique
  directorySyncedAt   DateTime?
}

// stanowisko (MAGSpace) → роль MAGGuarantee. Ведёт admin.
model StanowiskoRoleMapping {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  stanowiskoCode String   @unique
  stanowiskoName String                 // снапшот названия для UI
  role           Role                   // Zod: exclude admin, przewoznik
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

`passwordHash` уже nullable — для Google-пользователей остаётся `null`.

**Новый модуль `apps/api/src/modules/directory/`:**

| Файл | Что |
|---|---|
| `magspace.client.ts` | HTTP-клиент поверх `integrations/http-fetch.ts`: `lookupByEmail`, `listAll`, `listStanowiska`, `health`. Таймаут 3 с. |
| `stanowisko-role-mapping.repository.ts` + `.controller.ts` | Admin CRUD: `GET /sso/stanowisko-roles` (с подмешанным справочником из MAGSpace, чтобы показать несопоставленные), `PUT /sso/stanowisko-roles/:code { role }`, `DELETE /sso/stanowisko-roles/:code`. `@Roles('admin')` (после трека B — `users.manage`). Audit на каждое изменение. |
| `directory.service.ts` | `resolveEmployee(email)`, `roleFor(stanowisko)`, `provisionOrSync(...)`, `deprovision(userId, reason)` (= `active=false` + `revokeAllForUser` + audit). |
| `directory.module.ts` | экспорт в `AuthModule`. |

**Алгоритм `loginWithGoogle`:**

```
{ sub, email } = verifyIdToken(idToken)                    // A1

local = users.findByGoogleSub(sub) ?? users.findByEmail(email)

if local?.role === 'przewoznik'            → 403 SSO_NOT_FOR_CARRIER
if local && local.managedBy === 'local':                   // admin и прочие локальные
    if !local.active || local.deletedAt    → 401
    if !local.googleSub → привязать sub (audit user.google_linked)
    → issuePair(local)                                      // MAGSpace не вызывается

emp = magspace.lookupByEmail(email)
  unavailable → local && local.active ? issuePair(local) + warn   // решение №14
                                      : 503 SSO_DIRECTORY_UNAVAILABLE
  404         → local ? deprovision(local, 'not_found') : —  ; 403 SSO_NOT_EMPLOYEE
  !emp.active → local ? deprovision(local, 'inactive')  : —  ; 403 SSO_INACTIVE

role = mapping[emp.stanowisko?.code]
  none → notifyAdminsOnce(stanowisko) ; local ? deprovision(local,'unmapped') : — ; 403 SSO_NO_ROLE

user = users.upsertFromDirectory({
  match: local,                      // по sub, затем по email
  login: localPart(email) (+ '-2','-3' при коллизии, как Driver.loginSlug),
  email, name: `${firstName} ${lastName}`, role,
  googleSub: sub, magspaceEmployeeId: emp.id,
  authProvider: 'google', managedBy: 'magspace', directorySyncedAt: now,
})                                    // роль изменилась → audit user.synced_from_directory
→ issuePair(user)
```

**`users.service.ts`:** `upsertFromDirectory`; `PATCH /users/:id` для
`managedBy=magspace` запрещает менять `role`/`active` → 422
`USER_MANAGED_BY_MAGSPACE`, но разрешает менять сам `managedBy` (admin
«забирает» пользователя в локальное управление или наоборот). `POST /users`
не меняется, созданные там пользователи — `managedBy=local`.

**Audit** (по конвенции `packages/shared/src/schemas/audit.ts`):
`auth.google_login`, `user.google_linked`, `user.provisioned_from_directory`,
`user.synced_from_directory`, `user.deprovisioned_by_directory`,
`sso.stanowisko_role_set`, `sso.stanowisko_role_removed`.

Тесты: `directory.service.spec.ts` — локальный admin без MAGSpace; новый
сотрудник; смена stanowiska → смена роли; неактивный; без маппинга; 404;
MAGSpace 5xx для нового и для существующего; перевозчик с `@magtrans.eu`.
`users.service.spec.ts` — 422 на managed-пользователе, смена `managedBy`.

### A3. Web: кнопка Google на `/login` (≈ 0.5 дня, web)

| Файл | Что |
|---|---|
| `apps/web/app/(public)/login/GoogleSignInButton.tsx` | Загрузка GIS-скрипта (`accounts.google.com/gsi/client`), `google.accounts.id.initialize({ client_id, callback })`, `renderButton`. Callback → `POST /auth/google` → редирект `resolveNext(next, user.role)`. |
| `apps/web/app/(public)/login/LoginForm.tsx` | Кнопка над формой + разделитель «lub zaloguj się hasłem». Парольная форма остаётся (решение №7). |
| клиент auth в `apps/web/lib/` | `postGoogleLogin(idToken)`. |
| `apps/web/messages/pl.json`, `en.json` | Тексты кнопки и ошибок. |
| `.env` web | `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (публичное значение). |

Коды ошибок и тексты:

| HTTP | Код | PL |
|---|---|---|
| 403 | `SSO_DOMAIN_NOT_ALLOWED` | Zaloguj się kontem @magtrans.eu |
| 403 | `SSO_NOT_EMPLOYEE` | Nie znaleziono Cię w MAGSpace. Skontaktuj się z przełożonym. |
| 403 | `SSO_INACTIVE` | Twoje konto pracownika jest nieaktywne. |
| 403 | `SSO_NO_ROLE` | Twoje stanowisko nie ma jeszcze dostępu do MAGGuarantee. Administrator został powiadomiony. |
| 403 | `SSO_NOT_FOR_CARRIER` | Przewoźnicy logują się loginem i hasłem. |
| 503 | `SSO_DIRECTORY_UNAVAILABLE` | MAGSpace chwilowo niedostępny. Spróbuj za chwilę lub zaloguj się hasłem. |

CSP в `next.config` не задан — скрипт GIS загрузится без правок.

### A4. Reconcile-cron (≈ 1 день, api)

Паттерн — `@Cron` из `@nestjs/schedule`, как в `weekly-report.service.ts` и
`verification-sla.service.ts` (`ScheduleModule.forRoot()` уже подключён).

| Файл | Что |
|---|---|
| `modules/directory/directory-reconcile.service.ts` | Каждые `DIRECTORY_RECONCILE_INTERVAL_MIN` (default 15): `listAll()` → индекс по `id` и `email`. Для каждого `managedBy=magspace`: не найден / `active=false` / stanowisko без маппинга → `deprovision`; роль по маппингу отличается → sync + audit; имя изменилось → sync. Для `managedBy=local` со staff-ролью: если найден в MAGSpace с `active=false` → **только строка в отчёте** админам (напр. уволенный admin), без действия. |
| предохранитель | Если к отключению > max(5, 30 % managed) — прогон отменяется, письмо админам `directory.reconcile_aborted`. |
| режим | `DIRECTORY_RECONCILE_MODE=enforce\|report` (default `enforce`, решение №13). В `report` — только письмо «что бы я сделал». |
| сбой MAGSpace | Прогон пропускается с warn; если сбои > 2 ч подряд — письмо админам. |
| `env.schema.ts` | `MAGSPACE_API_URL`, `MAGSPACE_INTERNAL_TOKEN`, `DIRECTORY_RECONCILE_MODE`, `DIRECTORY_RECONCILE_INTERVAL_MIN`. |
| `/diagnostics` | Строка «MAGSpace: ok / down, последний reconcile: …». |

Отключение мгновенно бьёт по доступу: `JwtAccessStrategy.validate` перечитывает
пользователя из БД на каждом запросе, а `revokeAllForUser` убивает refresh-токены.

### A5. Admin UI (≈ 1 день, web)

| Где | Что |
|---|---|
| `UsersListView.tsx` / `UserSheet.tsx` | Бейдж «MAGSpace» у managed-пользователей, `role`/`active` disabled с подсказкой «Zarządzane w MAGSpace», переключатель `managedBy`, колонка «Ostatnia synchronizacja». Кнопка «Resetuj hasło» остаётся (решение №7). |
| новая страница `/employee/sso` (в `(admin)` группе, nav `users.manage`) | Таблица «Stanowisko → Rola»: все stanowiska из MAGSpace, у каждого select роли (6 значений, без admin/przewoznik) или «brak dostępu». Несопоставленные подсвечены. Статус MAGSpace и последний reconcile сверху. |
| `lib/roles.ts` | `/employee/sso` в `ADMIN_ONLY_EMPLOYEE_PREFIXES` (до трека B). |

### A6. Инфраструктура и документация (≈ 0.5 дня)

- GCP (тот же проект фирмы, что Gmail API, владелец — вы): OAuth Client ID типа
  *Web application*, consent screen **Internal**, authorized JS origins
  `https://mymag.magtrans.eu` и `http://localhost:3000`.
- Docker: общая сеть между compose-стеками MAGGuarantee и MAGSpace (если они
  в разных проектах) — `docker network create magtrans-internal` + `external: true`
  в обоих compose-файлах.
- Docs: [15](15-auth-strategy.md) — раздел «Google OAuth» переписать под
  id_token-flow и MAGSpace; [03](03-roles.md) — «роль сотрудника выводится из
  stanowiska через таблицу маппинга; admin — только локально»;
  [13](13-api-design.md) — `POST /auth/google`, `/sso/stanowisko-roles`;
  [16](16-jobs-and-integrations.md) — reconcile-cron; [12](12-database-schema.md) —
  новые поля и таблица; [23](23-prod-deployment-runbook.md) — OAuth client,
  env, docker-сеть, первичное заполнение маппинга.
- Seed: локальный admin (уже есть) — `managedBy=local`; маппинг пустой.

### Порядок внутри трека A

```
A0 (MAGSpace) ──┐
A1 ─────────────┼──► A2 ──► A3 ══► работающий вход (≈ 3.5 дня)
                └──► A4 ──► A5 ──► A6 ══► полный цикл найм/увольнение
```

A1 и A3 не зависят от MAGSpace вообще; A2 разрабатывается против мока клиента.

---

## 3. Трек B — слой permissions

Цель: роль остаётся типом пользователя и ключом data-scope, но **право на
действие** получает имя и один источник. Поведение системы не меняется —
после B все существующие тесты должны проходить как есть.

### Что такое scope и почему он остаётся на роли

Permission отвечает «может ли пользователь верифицировать wnioski вообще».
Scope отвечает «какие именно строки он видит»: opiekun — wnioski своих
перевозчиков, dyspozytor — машины своей команды, przewoznik — только своё.
Это ветки `if (user.role === ...)` внутри `_scopeFilters`-методов 15 сервисов,
подставляющие `WHERE carrierId IN (...)`. Они завязаны на структуру данных
роли (`Carrier.opiekunId`, `User.teamId`, `Carrier.userId`), а не на права.
**Трек B их не трогает.**

### B1. `packages/shared/src/permissions.ts` (≈ 0.5 дня)

```ts
export const PERMISSIONS = [
  'claims.read', 'claims.verify', 'claims.decide', 'claims.attachments',
  'carriers.read', 'carriers.write', 'carriers.hard_delete',
  'fleet.read', 'fleet.write', 'fleet.hard_delete',      // vehicles/drivers/trailers
  'delegations.read', 'delegations.set_status', 'delegations.cancel_any',
  'km.read', 'watchdog.read',
  'trailer_types.manage', 'teams.manage', 'limits.manage',
  'users.manage', 'sso.manage', 'audit.read', 'diagnostics.read',
  'lookups.external',                                     // VIES / Biała lista / info-car
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = { /* из docs/03 */ };

export function hasPermission(role: Role, p: Permission): boolean;
export function hasAnyPermission(role: Role, ps: readonly Permission[]): boolean;
```

Итоговый список выводится из текущих 122 `@Roles(...)` (таблица в B2) —
названия выше предварительные. Тест-снапшот `permissions.spec.ts` фиксирует
матрицу и сравнивается с [03-roles.md](03-roles.md) при ревью.

### B2. API: `@RequirePermission` + `PermissionsGuard` (≈ 1.5–2 дня)

| Файл | Что |
|---|---|
| `modules/auth/decorators/require-permission.decorator.ts` | `SetMetadata(PERMISSION_METADATA_KEY, perms)`; семантика **any-of**, как у `@Roles`. |
| `modules/auth/guards/permissions.guard.ts` | Копия `RolesGuard`, но `hasAnyPermission(user.role, required)`. Регистрируется рядом с `RolesGuard` в `app.module.ts`; переходный период — оба живут. |
| Контроллеры | Механическая замена `@Roles('admin','opiekun')` → `@RequirePermission('carriers.write')`. |

Объём по модулям (число `@Roles`, включая spec-файлы):

| Модуль | @Roles | Заметка |
|---|---|---|
| vehicles | 15 (+1 spec) | spec проверяет метаданные `@Roles` — переписать на permission |
| drivers | 11 (+1 spec) | то же |
| trailers | 11 | |
| carriers + carrier-attachments | 14 | |
| delegations | 9 (+4 spec) | spec проверяет метаданные |
| claims + claim-attachments | 10 | |
| lookups | 6 | |
| diagnostics | 5 | |
| fleet, trailer-types, gps, guarantee-watchdog | по 4 | |
| opiekun | 2 | |
| users, white-list, vies, inspection, audit-query, limits, alerts, teams, sso (новый) | по 1 | |

Внутри `OpiekunOwnershipGuard` / `CarrierOwnershipGuard` ветвление по роли
остаётся — это scope.

### B3. Web (≈ 1 день)

| Файл | Что |
|---|---|
| `lib/nav.config.ts` | `roles: [...]` → `permission: 'carriers.read'`; `filterNavForRole` через `hasPermission`. |
| `lib/roles.ts` | `ROLE_ALLOWED_PREFIXES` / `ADMIN_ONLY_EMPLOYEE_PREFIXES` → `PATH_PERMISSIONS: Record<prefix, Permission>`; `isAllowedForRole` внутри вызывает `hasPermission`. Сигнатура для `middleware.ts` не меняется. |
| `components/claims/claim-permissions.ts` | `isAdmin` → permission-проверка. |
| ~20 файлов с `role ===` | Разобрать по одному: **capability** (показать кнопку) → permission; **scope** (например `isOpiekun` для загрузки «Moja opieka») → оставить роль. Список из grep: `EmployeeSidebar`, pages `carriers/drivers/vehicles/trailers`, `ClaimsListView`, `CarrierFormDialog`, `(admin)/layout`, `ClaimModal`, `UsersListView`, `UserSheet`, `trailer-types/page`, `DelegationDetailModal`, `useAlerts`, `useOpiekunFleet`. |

### B4. Зачистка (≈ 0.5 дня)

Удалить `@Roles`/`RolesGuard`, обновить [15](15-auth-strategy.md) §Roles & Guards
и [03](03-roles.md) (добавить колонку «permission» в матрицу).

### B5 (позже, под первый реальный случай). Per-user overrides

Это и есть запланированный механизм для исключений «сотруднику на должности X
нужна ещё одна функция» (§8 в.1) — вместо второго stanowiska в MAGSpace.

Поля `User.extraPermissions Permission[]` / `deniedPermissions Permission[]`;
`effectivePermissions = ROLE_PERMISSIONS[role] ∪ extra − denied`. Правит admin
в `UserSheet` (для managed-пользователей это единственные редактируемые поля
прав, reconcile их не трогает). Делать **под первый конкретный запрос** — и
помнить, что capability без scope бессмысленна: дать `planista` право
`claims.verify` нельзя, у него нет ветки в `_scopeFilters` для wnioski.

---

## 4. Итоговая оценка

| Этап | Дни | Где |
|---|---|---|
| A0 контракт + данные + эндпоинты | 1.5–2 | MAGSpace |
| A1 id_token verify + endpoint | 0.5–1 | api |
| A2 directory + маппинг + provisioning + миграция | 1.5–2 | api, db |
| A3 кнопка Google | 0.5 | web |
| A4 reconcile-cron | 1 | api |
| A5 Users UI + страница маппинга | 1 | web |
| A6 GCP + docker-сеть + docs + runbook | 0.5 | infra, docs |
| **Трек A** | **≈ 6–7 (+1.5–2 MAGSpace)** | |
| B1 shared permissions | 0.5 | shared |
| B2 API decorator + ~123 замены + 3 spec | 1.5–2 | api |
| B3 web | 1 | web |
| B4 зачистка + docs | 0.5 | docs |
| **Трек B** | **≈ 4** | |

---

## 5. Риски

| Риск | Митигация |
|---|---|
| Reconcile массово отключает пользователей из-за ошибки контракта (например, MAGSpace вернул пустой список) | Предохранитель > max(5, 30 %) → прогон отменяется + алерт. Пустой `items` при непустом managed-списке — всегда abort. |
| MAGSpace недоступен в момент логина | Решение №14: существующих managed пускать по кэшу, новых — нет; локальных не касается. Парольный вход как запасной путь. |
| Stanowisko переименовали/пересоздали в MAGSpace с новым кодом | Маппинг по коду перестаёт совпадать → сотрудники теряют доступ (fail-closed) + письмо админам о несопоставленном stanowisko. Требование стабильности кода в A0.1. |
| Сотрудник переведён на stanowisko с другой ролью — теряет scope-данные (напр. был opiekun, стал planista, а `Carrier.opiekunId` указывает на него) | Reconcile меняет роль, но не трогает связи; письмо админам «роль изменилась, проверьте подопечных». Как сегодня при ручной смене роли. |
| GIS-скрипт и Safari ITP / блокировщики | Парольный вход остаётся; redirect-flow — запасной этап, если появятся жалобы. |
| `hd` отсутствует у не-Workspace аккаунтов | Отклонять; проверка обязательна, иначе любой gmail с совпадающим email пройдёт. |
| Переименование email в Workspace | Привязка по `googleSub`; email в User обновляется при входе. |
| Break-glass: Google или MAGSpace лежат, нужен админ | Локальный admin с паролем + 2FA, `managedBy=local`, в seed и runbook. |

---

## 6. Что НЕ делаем

- Свой IdP / Keycloak / OIDC-провайдер из MAGSpace.
- Webhook из MAGSpace в v1 (A7, когда MAGSpace научится отправлять события).
- Google-вход для перевозчиков.
- Хранение ролей MAGGuarantee внутри MAGSpace — там только stanowiska.
- Динамический RBAC с правами в таблицах БД (B5 — максимум статические
  overrides на пользователе).
- Изменение scope-логики сервисов.

---

## 7. Ответы на первый круг вопросов (2026-09-04)

| # | Вопрос | Ответ | Что изменилось в плане |
|---|---|---|---|
| 1 | MAGSpace: стек и хостинг | Тот же VPS и стек; API для внешних систем нет | A0 расписан как полный контракт с нуля, оценка выросла до 1.5–2 дней |
| 2 | Роли в MAGSpace | Не роли, а **stanowiska**; приложения интерпретируют сами | Решение №3: маппинг stanowisko → роль в MAGGuarantee, таблица + admin-UI (A2, A5) |
| 3 | Email в MAGSpace, сотрудники вне домена | Вне домена нет | Требование к полю `email` вынесено в A0.1 с описанием предзаполнения |
| 4 | Роль admin | Только локально в MAGGuarantee; через Google входить должны уметь | Решение №4: локальные пользователи входят по Google без MAGSpace |
| 5 | Парольный вход | Оставить запасным | Решение №7; Users UI не прячет reset пароля |
| 6 | Прод | Не запущен | Решение №13: reconcile сразу `enforce` с предохранителем |
| 7 | GCP-проект | Тот же, владелец — вы | A6 без блокеров |
| 8 | Webhooks из MAGSpace | Пока ничего не отправляет | Решение №9: pull-only, reconcile каждые 15 мин, webhook → A7 позже |
| 9 | Трек B | Делать | После A, отдельными PR |

## 8. Ответы на второй круг (2026-09-04)

| # | Вопрос | Ответ | Что зафиксировано |
|---|---|---|---|
| 1 | Несколько stanowisk у одного сотрудника? | Нет, ровно одно; исключений не предвидится, а если появятся — выдавать доступ на функции | `EmployeeDto.stanowisko` — одиночный объект; исключения → B5 |
| 2 | Stanowiska — справочник или текст? | Фиксированный перечень: `HANDLOWIEC`, `PLANISTA`, `LIDER HANDEL`, … | `code` = значение enum в UPPER_SNAKE, `/stanowiska` отдаётся из enum |
| 3 | Число сотрудников | Около 100 | `GET /employees` без пагинации |

Открытых вопросов не осталось.

---

## 9. Что изменилось при реализации (2026-09-09)

Шесть расхождений с текстом выше. Пять — уступки конвенциям кодовой базы,
одно — следствие бизнес-правки маппинга.

| # | В плане | Сделано | Почему |
|---|---|---|---|
| 1 | коды `SSO_*` «в `schemas/auth.ts`» | Константы там же, но на провод уходят в **`extensions.code`** конверта RFC 7807 | В конверте нет поля `code`. `extensions` — существующая конвенция для машинных кодов (`CARRIER_NOT_READY_CODE` и ещё ~20); фронт читает `err.data.extensions.code` |
| 2 | audit `user.deprovisioned_by_directory`, `directory.reconcile_aborted` | `system.deprovisionUserFromDirectory`, `system.abortDirectoryReconcile`, `system.syncUserFromDirectory`, `system.denyDirectoryAccess`; на пути логина — `googleLogin`, `linkGoogleAccount`, `provisionUserFromDirectory`, `syncUserFromDirectory` | `AuditWriter` **бросает Error**, если `actor:'system'` и action не начинается с `system.`. Имена — verb-noun camelCase по конвенции `audit.types.ts` |
| 3 | `@Cron` + `DIRECTORY_RECONCILE_INTERVAL_MIN` | `SchedulerRegistry.addInterval` в `onModuleInit` | Выражение `@Cron` фиксируется при декорировании и не может прийти из env |
| 4 | login = `localPart(email)` «как `Driver.loginSlug`» | Свой аллокатор в `DirectoryService` + `UsersRepository.existsLogin` | Аллокатор драйверов ходит в `prisma.driver` — переиспользуется паттерн, не код |
| 5 | — | Исправлен тип `UserRow.passwordHash: string` → `string \| null` | Колонка nullable с миграции `20260507195536`, но тип врал; Google-пользователь с `passwordHash = null` молча его нарушал |
| 6 | «stanowisko без маппинга = нет доступа», письмо **один раз на stanowisko** | Письмо **на каждого человека** (дедуп 24 ч по паре employee+stanowisko) + новое поле `User.roleOverride` | См. §10 |

Дополнительно, сверх плана: два CHECK-констрейнта
(`user_role_override_not_privileged`, `stanowisko_role_mapping_role_not_privileged`)
— ни одна из двух дорог к роли не может выдать `admin` или `przewoznik` даже
в обход Zod; и код `SSO_NOT_CONFIGURED` (503) для окружения без GCP-клиента,
чтобы не выдавать «смени Google-аккаунт» там, где виноват сервер.

## 10. Маппинг stanowisko → роль (решено 2026-09-09)

Реальные 17 кодов MAGSpace — не `HANDLOWIEC`/`LIDER_HANDEL` из §A0.1, а
upper-snake бывшего справочника działów. Решение по каждому:

| Stanowisko | Роль | |
|---|---|---|
| `DYSPOZYTOR`, `DYSPOZYTOR_KIEROWNIK` | `dyspozytor` | в сиде |
| `PLANISTA`, `PLANISTA_LIDER`, `PLANISTA_MLODSZY` | `planista` | в сиде |
| `DAF` | `opiekun` | в сиде; единственный источник роли `opiekun` |
| `HANDEL_SPEDYTOR`, `HANDEL_LIDER`, `HANDEL_KIEROWNIK`, `CONTROLLING` | **ручной апрув** | без записи |
| `KAM`, `KAM_KIEROWNIK`, `KIEROWNIK_ODDZIALU`, `IT`, `WINDYKACJA`, `ASYSTENT`, `REKRUTER` | brak dostępu | без записи |

**`pracownik`, `weryfikator` и `eksport` маппингом не выдаются вообще.** Внутри
одной должности эти люди сидят вперемешку: в `CONTROLLING` двое — один
`weryfikator`, другой `pracownik`; среди `HANDEL_*` пара человек с `eksport`.
Роли слишком чувствительные (верификация wniosków, деньги), чтобы выводить их
из названия должности.

Отсюда и правка №6: отсутствие маппинга перестало быть аварией и стало
**штатным путём онбординга** для четырёх должностей. Значит, решение
принимается по человеку, а не по должности:

1. Сотрудник жмёт «Zaloguj przez Google» → 403 `SSO_NO_ROLE`; админам уходит
   письмо **с его именем, адресом и stanowiskiem** (дедуп 24 ч), событие
   ложится в audit и видно на `/employee/sso`.
2. Админ заводит человека обычным `POST /users` с нужной ролью, в `UserSheet`
   ставит `managedBy = magspace` и `roleOverride = <роль>`.
3. Следующий вход через Google совпадает по email, привязывает `googleSub` и
   `magspaceEmployeeId` — дальше человек живёт под справочником: уволили →
   доступ погас.

`roleOverride` обязателен именно потому, что без него reconcile отключал бы
этих людей **каждый прогон** («их stanowisko не сопоставлено»). Альтернатива
«перевести в `managedBy=local`» отброшена: она снимает ровно то
авто-отключение при увольнении, ради которого всё и делалось.

В select на `/employee/sso` при этом оставлены все 6 назначаемых ролей, а не
три: «pracownik/weryfikator/eksport не выдаём маппингом» — сегодняшняя
политика, а не инвариант системы.
