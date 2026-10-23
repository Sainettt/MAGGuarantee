# 17. Поэтапный план миграции

> Главный документ-план. Делим работу на **9 фаз**. Каждая фаза заканчивается работающей вертикалью для какой-то группы пользователей.

## Контекст

`Code.gs` + `index.html` — **незавершённая разработка** от другого человека, никогда не были в проде. Все данные в Sheets — **фейковые**. Нам не нужно:
- Мигрировать данные.
- Поддерживать parallel-running старой и новой системы.
- Беспокоиться о том, чтобы пользователи продолжали работу во время разработки.

Мы пишем **с нуля** на новом стеке, ориентируясь на `Code.gs` и `index.html` **только как функциональный референс** — какие фичи делать, какой бизнес-flow, какой дизайн.

## Принципы фазирования

1. **Вертикальные слайсы, не горизонтальные.** Не делаем «сначала весь backend, потом весь frontend» — это даёт отложенную обратную связь и риск тупиковой архитектуры. Делаем «один слайс end-to-end за раз».
2. **Foundation first.** Auth, инфраструктура, расчёт km — критичны для всего, делаем в начале.
3. **От простого к сложному.** Сначала самые изолированные роли (carrier — один user видит только свои данные), потом самые сложные (verification модал на 462 строки).
4. **Тесты на критических местах обязательны.** `calcKmGwarantPerMonth` — фиксированные сценарии, рассчитанные по той же формуле, что в `Code.gs:862`. Расчёт должен совпадать.

## Что мы НЕ делаем

- ❌ **Чат на каждое заявление.** Текущий `index.html` имеет `#chatFloatingPopup` (`index.html:233-270`) и backend-функции `sendChatMessage`/`getChatMessages`/etc. — мы это не переносим. Чат не нужен.
- ❌ **Миграция данных из Sheets.** Все данные там фейковые.
- ❌ **Parallel-running.** Старая GAS-версия не работает в проде, поэтому никаких dual-write, feature flags, gradual cutover.
- ❌ **Лист `OPIEKUNOWIE` (legacy).** Он есть в Sheets, но дублирует `OPIEKUN` — в новой схеме это одна модель `User` с `role=opiekun`.
- ❌ **Лист `GWARANCJA` (legacy).** Не используется.

## Почему НЕ pracownik → planista → admin

Юзер предложил такой порядок, но он субоптимален:

- **pracownik и admin делят один Employee panel и оба верифицируют wnioski** — нет смысла делать их в разных фазах. Делаем вместе. (NB: pracownik — узкая роль, в UI «Pracownik», только wnioski + dashboard, без CRUD по carrier/vehicle/driver/trailer; admin — полный scope. См. [03-roles.md#pracownik](03-roles.md#pracownik).)
- **planista — read-only** — это самая простая роль, она никак не помогает выявить риски архитектуры. Делать её перед admin = трата времени без пользы.
- **carrier (przewoznik) — самый изолированный** — это лучший first-real-user слайс. Он видит только свои данные, простые формы, минимум зависимостей.

Лучший порядок: **foundation → carrier → pracownik+admin → opiekun → planista+dyspozytor → eksport+weryfikator**. Подробнее ниже.

## Глобальные инварианты во время разработки

- **Старый GAS остаётся в репозитории как функциональный референс** — там видно что делает каждая роль, какой алгоритм km-calc, какой дизайн. Не запускаем, не правим.
- **Новое приложение разрабатывается с нуля** в `magguarantee-app/`. У него своя БД (Postgres), свой деплоймент.
- **Тестовые данные в новом app** — простой seed для dev (несколько пользователей разных ролей, несколько carrier-ов с авто, генератор wniosków). Никаких реальных данных нет — у MAGTRANS их и не было.

---

## Фаза 0 — Foundation (≈ 1 неделя) ✅ ЗАВЕРШЕНА (2026-04-30)

**Цель:** монорепо запускается локально, есть пустой Nest и Next, к ним подключены DB и Redis. Никакой бизнес-логики, только скаффолд.

### Шаги

1. ✅ Создать папку `magguarantee-app/` в корне репозитория.
2. ✅ `npm init -y` + добавить `"workspaces": ["apps/*", "packages/*"]` в корневой `package.json` + `concurrently` для параллельного `dev` (api+web).
3. ✅ `apps/api`: `nest new` + базовый `main.ts` с Helmet, CORS, Pino.
4. ✅ `apps/web`: `create-next-app@latest` (App Router, Tailwind, TypeScript).
5. ✅ `packages/database`: `prisma init`, dummy schema (без моделей пока).
6. ✅ `packages/shared`: пустой пакет с `index.ts` и заглушкой типов.
7. ✅ `docker-compose.yml`: Postgres 16 + Redis 7 + Mailhog.
8. ✅ CI на GitHub Actions: lint + typecheck + build на PR.
9. ✅ `.env.example` для api и web.
10. ✅ `README.md` в `magguarantee-app/` с инструкциями `docker compose up && npm run dev`.

### Deliverables
- ✅ Монорепо запускается: `docker compose up -d && npm run dev` → `localhost:3000` (web) и `localhost:3001` (api).
- ✅ `localhost:3001/health` отвечает 200.
- ✅ CI проходит на пустом PR.

### Дополнительно сделано (вне исходного чек-листа)
- Кросс-платформенная конфигурация: `.gitattributes` (LF в репо, CRLF только для `.bat`/`.cmd`/`.ps1`) и корневой `.editorconfig`.
- `forceConsistentCasingInFileNames` в `tsconfig.base.json` (защита от регистровых багов при работе на Windows + Linux).
- Prisma 5.22 локально (был конфликт с Prisma 7 из npx-кеша — починено).
- Симлинки воркспейсов работают через npm workspaces (одна корневая `node_modules`).

### Зависимости
- Никаких. Это нулевая фаза.

---

## Фаза 1 — Auth: login + 2FA + JWT (≈ 1 неделя) ✅ ЗАВЕРШЕНА (2026-04-30)

> Чек-лист ниже — исходный план, пункты по ходу не отмечались. Актуальное поведение auth (включая Google SSO 2026-09-09 и audit/security-события 2026-09-14) — [15-auth-strategy.md](15-auth-strategy.md).

**Цель:** любая роль может войти в приложение через login + 6-значный код в email. Получает JWT. Видит «Hello, {name}» с правильной ролью.

### Backend

1. Prisma модели: `User`, `RefreshToken`, `AppConfig` (схема из [12-database-schema.md](12-database-schema.md), но без остальных моделей — они в Фазе 2).
2. `prisma migrate dev --name init`.
3. Seed: 1 admin + 7 представителей других ролей с разными email-ами (для тестов).
4. Модуль `auth`:
   - `auth.controller.ts`: `POST /login`, `POST /verify-code`, `POST /resend-code`, `POST /refresh`, `POST /logout`, `GET /me`.
   - `auth.service.ts`: validateCreds через bcrypt; issueCode → Redis.
   - `two-factor.service.ts`: генерация, верификация, lockout.
   - `password.service.ts`: bcrypt hash/verify.
   - JWT strategies (access + refresh).
5. `JwtAuthGuard` глобально в `app.module.ts` через `APP_GUARD`.
6. `@Public()` декоратор для исключений (login endpoints).
7. Модуль `mail`: пока заглушка с `console.log` или Mailhog (Gmail API в Фазе 9).
8. e2e тест: full login flow, неверный код, lockout после 5 попыток, refresh rotation.

### Frontend

1. Tailwind config из [14-design-system.md](14-design-system.md).
2. `app/(public)/login/page.tsx`: форма login + password.
3. `app/(public)/login/verify/page.tsx`: 6 input-боксов для кода (как `.code-box` в legacy).
4. `lib/api/client.ts`: fetch wrapper с auto-refresh interceptor.
5. `middleware.ts`: redirect на /login если нет cookie.
6. `lib/hooks/useAuth.ts`: `GET /auth/me` через TanStack Query.
7. После verify → redirect по роли:
   - `przewoznik` → `/carrier` (заглушка)
   - `admin/pracownik/opiekun` → `/employee`
   - `planista` → `/planista`
   - и т.д.
8. На каждой роли — пустая страница «Welcome, {name}, role: {role}» + Logout-кнопка.
9. `<ThemeToggle>` в header.

### Deliverables
- Можно залогиниться существующим тест-аккаунтом.
- Роль определяет, на какую страницу редиректит.
- Logout работает, после refresh страницы — снова на /login.
- Mailhog (`localhost:8025`) показывает 2FA-код.

### Acceptance criteria
- 5 неверных кодов → 423 Locked на 5 минут.
- Refresh-токен ротация работает (старый помечается revokedAt).
- Reuse revoked refresh → инвалидация всех токенов user-а.

### Зависимости
- Фаза 0.

---

## Фаза 2 — Core entities: Users, Carriers, Vehicles, Drivers, Trailers (≈ 2 недели) ✅ ЗАВЕРШЕНА (2026-05-04)

> Чек-лист ниже — исходный план. GPS остаётся mock-провайдером (реального API-доступа нет). Актуальные контракты — [13-api-design.md](13-api-design.md).

**Цель:** в БД лежат все справочные сущности. Есть полный CRUD через API с правильными ролями. Frontend пока минимальный — просто списки таблицами для admin (для UAT).

### Backend

1. Prisma модели полностью из [12-database-schema.md](12-database-schema.md).
2. `prisma migrate dev --name entities`.
3. Seed: 13 типов прицепов (`TrailerType` — точный список с `shortCode` + `description` в `Code.gs:465-478`), `app_config` записи.
4. Модуль `users`: `UsersService`, `UsersRepository` (Prisma wrapper), `UsersController` (admin CRUD).
5. Модуль `carriers`: то же самое + специфика — связь с User, opiekun ownership.
6. Модули `vehicles`, `drivers`, `trailers`, `trailer-types`: CRUD + soft-delete.
7. Guards:
   - `RolesGuard` из [15-auth-strategy.md](15-auth-strategy.md).
   - `OpiekunOwnershipGuard` для opiekun-эндпоинтов.
   - `CarrierOwnershipGuard` для carrier-эндпоинтов (read-доступ к своим авто/водителям/прицепам — мутации этих сущностей делает только admin/opiekun).
8. Audit interceptor (минимальный): декоратор `@Audit('createCarrier')` пишет в `audit_log`.
9. Lookups endpoints (`/lookups/dyspozytor`, `/lookups/planisci`, `/lookups/opiekuni`, `/lookups/cert-types`).
10. Внешние интеграции: VIES, Biała Lista (info-car удалён решением 2026-10-22: VIN у машины нет, UI не вызывал; см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#внешние-rest-интеграции)).
11. **GPS tracker — модуль-скелетон** (`apps/api/src/modules/integrations/gps/`): `GpsProvider` interface, `GpsMockProvider` (детерминированные позиции от `plateNumber`), BullMQ `gps-poll` repeatable job (репликирует контракт реального polling-а), Redis cache layer, endpoint-ы `/api/v1/integrations/gps/positions[/:vehicleId]` с ownership-фильтрацией. **Реальный API access ещё не предоставлен** — `GpsVendorProvider` остаётся заглушкой, выбор провайдера через `GPS_PROVIDER=mock|vendor` env. Полная спецификация — [16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api](16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api). Когда MAGTRANS отдаст credentials — финализируем `GpsVendorProvider` без миграций по DB и без правок UI (контракт уже стабилен).
12. Unit tests: ownership guards, password hashing, репозитории.

### Frontend (минимальный, для UAT)

1. `app/(employee)/carriers/page.tsx`: таблица из `<DataTable>`, фильтр.
2. `app/(employee)/carriers/[id]/page.tsx`: деталь + редактирование (sheet/modal).
3. То же для vehicles, drivers, trailers, trailer-types.
4. Forms через React Hook Form + Zod (схемы из `@magguarantee/shared`).

### Deliverables
- Admin может через UI создать carrier-а, vehicle-а, driver-а, trailer-а.
- Все mutating-actions пишутся в `audit_log`.
- Импорт 13 типов прицепов через seed (как в `ensureNaczepyTypySheet`, `Code.gs:465-478`).
- Внешние интеграции работают (VIES для NIP в форме carrier-а, Biała Lista — для IBAN).

### Зависимости
- Фаза 1.

---

## Фаза 3 — Przewoznik (carrier) panel (≈ 2 недели) ✅ ЗАВЕРШЕНА (2026-05-07)

> Чек-лист ниже — исходный план. С тех пор wniosek привязан к выезду (`Claim.delegationId`, doc 20 §0″): период и пробег перевозчик не вводит.

**Цель:** перевозчик может полностью пользоваться приложением — подавать wnioski, видеть свои, просматривать свою флоту (авто/водители/прицепы — read-only), регистрировать выезды.

### Backend

1. Модуль `claims`:
   - `ClaimsService.submit()` — `submitNewClaim` (`Code.gs:6118`), 291 строка → разбита на private методы.
   - `ClaimsService.previewKmCalc()` — server-side preview, заменяет client-side `carrierPreviewCalc`.
   - `ClaimsService.submitReklamacja()` — `submitReklamacja` (`Code.gs:6804`).
   - `KmCalcService.calc()` — портированная `calcKmGwarantPerMonth` (`Code.gs:862`).
   - `EuCalendarService` — `calcEasterGS`, `getEUBanDaysGS`.
   - `NrZglService` — генерация `GWA/NNN/MM/RR` через atomic increment в `claim_sequences`.
2. Контроллер `ClaimsController`:
   - `POST /claims` (carrier).
   - `GET /claims` (фильтрует по carrierId автоматически для роли przewoznik).
   - `GET /claims/:nrZgl`.
   - `POST /claims/:nrZgl/reklamacja`.
   - `POST /claims/:nrZgl/preview`.
3. Модуль `delegations`: addDelegacja, cancelDelegacja для carrier-а.
4. Модуль `claims/fleet`: `GET /fleet/my` — `getMyFleet` (`Code.gs:4247`).
5. **Тесты на km calc:** ≥30 fixtures, написанных вручную для покрытия краевых случаев (полный месяц, перекрытие, Easter, EU-banned дни, дробные дни). См. [17-migration-roadmap.md#тестирование-km-calc](#тестирование-km-calc) ниже.

### Shared

1. `packages/shared/domain/km-calc.ts` — портированная функция, **без** Nest/Next зависимостей (чистый TS). Импортируется и backend-ом, и frontend-ом.
2. Zod-схемы DTO в `packages/shared/schemas/claim.schema.ts`.

### Frontend

1. `app/(carrier)/layout.tsx`: header с RoleSwitcher, табы (My wnioski, Nowy, Flota, Wyjazdy).
2. `app/(carrier)/claims/page.tsx`: список wniosków (TanStack Query), фильтры по статусу/авто/поиск, дизайн `.claim-card`.
3. `app/(carrier)/claims/new/page.tsx`: большая форма с live-preview (debounced `POST /claims/.../preview` после каждого изменения).
4. `app/(carrier)/claims/[nrZgl]/page.tsx`: деталь + кнопка «Reklamacja» если статус позволяет.
5. `app/(carrier)/fleet/vehicles/page.tsx`: список своих авто (read-only — управление через admin/opiekun).
6. `app/(carrier)/fleet/drivers/page.tsx`: список своих водителей (read-only — управление через admin/opiekun).
7. `app/(carrier)/fleet/trailers/page.tsx`: список своих прицепов (read-only — управление через admin/opiekun).
8. `app/(carrier)/delegations/page.tsx`: список выездов с фильтром.
9. `app/(carrier)/delegations/new/page.tsx`: форма addDelegacja.

### Deliverables
- Перевозчик может пройти весь свой flow: войти, увидеть wnioski, подать новый, увидеть его, подать рекламацию, добавить выезд.
- live preview работает корректно — числа совпадают с тем, что насчитает backend на submit.
- Все ≥30 km-calc тестов зелёные.
- Email уведомления отправляются (через Mailhog).

### Зависимости
- Фазы 0–2.

---

## Фаза 4 — Pracownik + Admin panel (≈ 3 недели) ✅ ЗАВЕРШЕНА (2026-05-26)

**Цель:** обе роли получают доступ к Employee panel — с разным scope-ом, **не путать**:

- **`pracownik`** (UI «Pracownik») — узкая роль. Видит **только 2 вкладки**: Dashboard + Wnioski. Единственная задача — верифицировать заявления (изменение статуса, korekta godzin, nrZlecenia, запрос авторизации у Maksima, обработка reklamacji). Никакого CRUD по carrier/vehicle/driver/trailer/trailer-type/limits/users, никакого audit-log, никаких diagnostics. См. [03-roles.md#pracownik](03-roles.md#pracownik).
- **`admin`** — полный scope. Всё, что умеет pracownik **плюс** CRUD по справочным сущностям и пользователям, управление лимитами, audit log, diagnostics. См. [03-roles.md#admin](03-roles.md#admin).

В этой фазе делаем оба сразу, потому что они делят один `/employee` layout — разные пользователи видят разные tabs через guard на роль. Бэкенд-эндпоинты тоже общие по path, разнятся только `@Roles(...)` декораторы.

### Прогресс выполнения

Декомпозиция получена через `orchestrator-agent` (см. план в conversation 2026-05-13). 6 sub-slice-ов:

- [x] **4.0 Foundation** (≈3 дня) — **DONE** (commit `de689f5`)
  - [x] uiux: Phase 4 секция в `docs/14-design-system.md` (9 компонентов + ClaimStatus→token map + role-nav контракт + 12-пунктовый acceptance checklist)
  - [x] db: `AuditLog` модель и `ClaimStatus` enum уже были на месте (db-agent проверил, ничего не менял)
  - [x] api: `AuditWriter` (in-tx audit service) в `apps/api/src/modules/audit/` + 8 unit-тестов; экспортируется через `AuditWriterModule` (`@Global()`)
  - [x] web: новый `/employee/layout.tsx` с role-guarded sidebar (240px desktop, slide-over mobile); `lib/nav.config.ts` (hardcode 11-link config + `filterNavForRole`); 403 page в `/employee/forbidden`; i18n `nav.*` + `forbidden.*` namespace

- [x] **4.1 Claim verification core** (≈4 дня) — **DONE** (commit `de689f5`)
  - [x] api: `ClaimsService.update()` + 5 helper-методов (`_validateClaimUpdate`, `_recalcClaim`, `_buildUpdatePatch`, `_handleReklamacjaTransition`, `_applyDecisionEmails`)
  - [x] api: `PATCH /api/v1/claims/:nrZgl` с `@Roles('admin', 'pracownik')`, Zod-валидация через `UpdateClaimSchema` (discriminated union по `targetStatus`); все mutating-операции внутри `prisma.$transaction` с одновременной записью в audit_log
  - [x] api: preview-endpoint `POST /api/v1/claims/:nrZgl/preview` расширен с `przewoznik` до `przewoznik|pracownik|admin` (для live recalc у верификатора). `CarrierOwnsGuard` пропускает non-carrier роли.
  - [x] web: `/employee/claims` page (server-component shell + ClaimsListView client); `<ClaimsTable>` с колонками nrZgl/carrier/vehicle/period/km/doplata/status/updated; cursor pagination + filter bar (status, date range, full-text `q`)
  - [x] web: `<ClaimVerificationModal>` = `<Sheet size="xl">` 720px с 3 табами (Edit / Historia / Autoryzacja); RHF + `zodResolver(UpdateClaimSchema)` с conditional rendering полей по выбранному `targetStatus`; `<RecalcBadge>` с 300ms debounce, бьёт в `/preview`; tabs primitive `components/ui/Tabs.tsx` (hand-rolled, shadcn-compatible API)
  - [x] web: TanStack hooks `useClaimPreviewExisting` + `useUpdateClaim`; форматтеры `formatEur` / `formatKmCompact` / `formatDateShort` / `formatRelativeTime`
  - [x] tests: 8 unit на `ClaimsService.update()` (happy-path/missing-required/illegal-transition/comment-only-skip-recalc/recalc-on-mileage/auth-transition/reklamacja-collapse/not-found), 8 на `AuditWriter`

- [x] **4.2 Authorization flow** (≈2 дня) — **DONE** (2026-05-25)
  - [x] api: `POST /api/v1/claims/:nrZgl/request-authorization` — admin/pracownik, генерирует `authorizationToken` (UUID v4), переводит claim в `OCZEKUJE_NA_AUTORYZACJE`, шлёт email Maksim-у через Mailhog. Audit через `@Audit({action: 'claim.requestAuthorization'})` + ambient tx.
  - [x] api: `RequestAuthorizationSchema` (Zod) в `packages/shared/src/schemas/claims.ts`. Body — `{kwotaMaksima, comment?}`.
  - [x] api: `MailService.sendAuthorizationRequest` + React Email template `authorization-request.tsx` с MAGTRANS RED branding, deeplink `{APP_URL}/employee/claims?nrZgl={nrZgl}` (страницы `/employee/claims/{nrZgl}` нет; письма линковали на неё до 2026-10-22, исправлено — UWAGI #2), plain-text fallback.
  - [x] api: получатель kwota-Maksima-авторизации — env-var `MAKSIM_EMAIL` (validated в `apps/api/src/config/env.schema.ts`, `.default('maksim.siankevich@magtrans.eu')` = прод-адрес, override на dev/staging, читается через `ConfigService`). Опция вынести в AppConfig в Phase 9 остаётся. `APP_URL` env-var добавлен.
  - [x] api: `PATCH /claims/:nrZgl` принимает `amountMaximum` (= kwotaMaksima) внутри `UpdateClaimToAccepted` ветки — kwotaMaksima меняется **только при акцепте**, без отдельного override endpoint-а (решение от 2026-05-25: «потолок» — атрибут одобрения, не отдельная сущность).
  - [x] web: TanStack `useRequestAuthorization(nrZgl)` хук. UI Autoryzacja-таба переписан под Phase 4.2 (RHF + `zodResolver(RequestAuthorizationSchema)`, кнопка «Wymaga autoryzacji» с email-toast, при статусе уже `OCZEKUJE_NA_AUTORYZACJE` — read-only summary с info-banner).
  - [x] web: `decisionTargetsFor('NA_WERYFIKACJI')` в `claim-transitions.ts` больше не включает `OCZEKUJE_NA_AUTORYZACJE` — единственный путь в этот статус теперь через Autoryzacja-таб с email. Старый legacy PATCH-вариант в backend `UpdateClaimToAuthorizationPending` остаётся в schema для API-обратной совместимости, но из UI исключён.
  - [x] tests: 9 unit на `ClaimsService.requestAuthorization()` (happy path, illegal transition, missing claim, audit before-capture, mail-failure isolation, optional-comment) + 2 на PATCH `amountMaximum` + 6 на email-шаблон.
  - [x] **REWORK 2026-07-24 — ручной флоу авторизации выпилен целиком.** Удалены: `POST /request-authorization`, `PUT /authorization-amount`, ветка `UpdateClaimToAuthorizationPending`, письмо `authorization-request.tsx`, колонки `authorization*` / `margin` / `amountMaximum` / `authScreenshotUrl`, статус `AUTORYZACJA_KWOTA_MAKSIMA`, seed-ключи `auth_threshold_*`. Единственный путь в `OCZEKUJE_NA_AUTORYZACJE` — **автоматический Maksim-gate** при zapisie weryfikacji (`paymentEur > getAuthThreshold`); скриншот-clear и решение из OCZEKUJE сохранены; правка под порог авто-откатывает в `NA_WERYFIKACJI` (новое ребро state machine); re-verify в OCZEKUJE остаётся admin-only.
  - ❌ ~~Screenshot upload~~ — выпилено (2026-05-13).

- [x] **4.3 Dashboard** (≈3 дня) — **DONE** (2026-05-26)
  - [x] api: новый `DiagnosticsModule` (`apps/api/src/modules/diagnostics/`) + `GET /api/v1/diagnostics/dashboard` (admin+pracownik). Response: `{kpi, urgent, recent, topCarriers, monthlySeries (rolling 12 мес), reklamacje}`. Read-only, без `@Audit`. KPI через `claim.groupBy({by:'status'})`, `urgent` = NA_WERYFIKACJI && updatedAt < now-3d (max 20), `recent` = 10 audit-row где `targetType LIKE 'claim.%'`, `topCarriers` = top-5 по `sum(paymentEur)`, `reklamacje` = count(status='REKLAMACJA').
  - [x] web: `app/(employee)/employee/dashboard/page.tsx` (server shell) + `<DashboardView>` client. 5 `<KpiCard>` (total/naWeryfikacji/zaakceptowano/odrzucono/oczekujeNaAutoryzacje, grid 2→3→5 cols). Recharts bar для `monthlySeries` + pie для status distribution. `<DashboardSidebar>` 380px с 4 секциями (Urgent / Recent / TopCarriers / Reklamacje). `useDashboard()` хук с `staleTime: 60_000`. Recharts ^2.13.0 добавлен в deps.
  - **Деviation:** `<KpiCard>` "purple" tone замаплен на `bg-brand` — purple-токена в палитре нет, политика 4.4 запрещает новые токены.

- [x] **4.4 Admin справочники доводка** (≈3 дня) — **DONE** (2026-05-25)
  - [x] api: `AuditWriter` интеграция в carriers/vehicles/drivers/trailers/trailer-types — **automated через pre-Phase-4.4 atomic-audit refactor** (commit `2d43fce`). `@Audit()` декоратор оборачивает handler в `prisma.$transaction` под `AuditContext`, mutation + audit-row atomic.
  - [x] api: `AuditContext.setMetadata(meta)` + `AuditContext.setBefore(loaded)` API. Перед update/delete в 5 lookup-сервисах загружается current row и кладётся в `setBefore`. `AuditInterceptor` делает scoped diff — `before` тримится до ключей `after` + `id` (для коротких audit-rows; full `before` сохраняется когда `omitResultBody: true`).
  - [x] api: hard-delete с обязательным `reason` (Zod `DeleteWithReasonSchema` min 3 max 500) → `audit_log.metadata.reason`. Отдельные endpoint-ы `DELETE /:id/hard` (только admin) на carriers/vehicles/drivers/trailers/trailer-types; soft-delete остаётся как был. `hardDeleteCarrier` каскадно удаляет shadow User row.
  - [x] api: `GET /api/v1/lookups/carriers?q=...` — admin/pracownik/opiekun, ownership-фильтр (opiekun видит только supervised), лимит 100, response `{id, login, name, active}[]`.
  - [x] api: TrailerType hard-delete с `Restrict` FK ловит P2003 → 409 ConflictException (помощник `isPrismaForeignKeyViolation`).
  - [x] web: новая `/employee/users` admin-страница — `<UsersTable>` (6 колонок, role-badge с цветом по матрице), `<UserSheet>` create/edit (RHF + Zod), reset-password modal с clipboard copy, deactivate/reactivate confirm. Доступ через guard `requireRoleAccess(['admin'])`.
  - [x] web: shared `<ConfirmDeleteWithReasonDialog>` в `components/ui/` (RHF + `DeleteWithReasonSchema`), подцеплен в 5 lookup-pages как Trash2-button (только для admin).
  - [x] web: 8 uiux-фиксов применены механически (layout strip `mx-auto max-w-screen-2xl` × 5; `Input.tsx` default height `h-11 → h-10` + bulk-strip ~45 ad-hoc `className="h-10"`; redundant `bg-input` в wizard read-only inputs убраны; `DataTable` loading label через prop; responsive Edit-button label `<span className="hidden lg:inline">` × 4; belts/mats counter обёрнут в `<FormField>`; trailer-types filter в flex row).
  - [x] uiux: `bg-input` зафиксирован как single surface token в `docs/14-design-system.md` (Surface-token policy section); `bg-bg-soft` deprecated.
  - **Открытый side-quest (defer):** carrier-autocomplete фильтр в `<ClaimsTable>` через готовый `/lookups/carriers` — пока остаётся full-text `q`.

- [x] **4.5 Admin ops: limits / audit / diagnostics** (≈3 дня) — **DONE** (2026-05-26)
  - [x] api: новый `LimitsModule` — `GET /api/v1/limits?year=YYYY` (admin, raw rows) + `PUT /api/v1/limits/:yearMonth` (admin, audited `limits.update`, upsert по composite unique `[year, month]`, before-snapshot для UPDATE-ветки). `UpdateMonthlyLimitSchema` в `packages/shared/src/schemas/limits.ts`. 5 unit-тестов.
  - [x] api: audit read-side — расширение существующего `AuditModule` с `AuditQueryController` + `AuditQueryService` + `AuditQueryRepository`. `GET /api/v1/audit?targetType=&targetKey=&userId=&action=&from=&to=&cursor=&limit=50` (admin). Cursor pagination на composite `(createdAt, id)` через opaque base64. Resolved `userLogin`/`userName` через join. 7 unit-тестов. Write-side (`AuditWriter`/`AuditInterceptor`/`@Audit()`) не тронут.
  - [x] api: `DiagnosticsModule` расширен endpoint-ами `/diagnostics/mails`, `/diagnostics/mails/:jobId/resend` (audited `diagnostics.mail.resend`), `/diagnostics/claims`, `/diagnostics/db` (все admin). Postgres ping через `prisma.$queryRaw('SELECT 1')` + `pg_total_relation_size` для главных таблиц, Redis ping через существующий `RedisModule`.
  - [x] api: `GET /api/v1/lookups/users?q=` (admin, лимит 100, ILIKE на `login`+`name`) — для autocomplete в audit-фильтре.
  - [x] web: `app/(employee)/employee/(admin)/limits/page.tsx` — year-selector (default 2026), таблица 12 `<LimitsRow>` (month label + 2 inline number-input с save-on-blur, optimistic update), `useLimits(year)` + `useUpdateLimit()` с rollback на ошибке.
  - [x] web: `app/(employee)/employee/(admin)/audit/page.tsx` — `<AuditTable>` через `<DataTable>`, filter-bar (targetType selector + `<UserAutocomplete>` на `/lookups/users` + action text + date-range), cursor pagination, click-row → `<Sheet size="lg">` с side-by-side `before`/`after` JSON.
  - [x] web: `app/(employee)/employee/(admin)/diagnostics/page.tsx` — 3 секции через `<Tabs>`: Mails (queue table + Resend кнопка), Claims (health-cards), DB (ping-pills + table-sizes). Refetch intervals: mails 30s, db 60s.
  - **Деviations:**
    - BullMQ не в зависимостях (deferred to Phase 9 по прецеденту GPS-модуля). Mail registry реализован как Redis-backed `MailJobsRegistry` (LIST + per-job HASH ring buffer, 200-id cap, 14-day TTL) с identical контрактом — в Phase 9 swap-able на `Queue.getJobs()` proxy без правки controller/DTO.
    - `resendMail` отправляет bare-text payload (не re-render шаблона) — registry не сохраняет полный `data` blob ради redaction. Полный re-render — future upgrade.
    - `<AuditRow>` default variant использует row-click → `<Sheet>` вместо inline expand (DS L813). Параллель с UX `<ClaimVerificationModal>` из 4.1; компактный вариант для дашборда (`AuditRowCompact`) — как в DS.
    - `<UserAutocomplete>` — новый компонент на базе `<Popover>` (DS не специфицировал).
  - **Открытый side-quest:** carrier-autocomplete фильтр в `<ClaimsTable>` через `/lookups/carriers` — defer per roadmap.

**Открытые мелочи (не блокеры, фиксятся в нужном sub-slice-е):**

- **Audit-инфраструктура унифицирована.** Wave-2 `AuditService` удалён. Единственный путь записи audit — `AuditWriter` через `AuditInterceptor`, который оборачивает handler в `prisma.$transaction` под `AsyncLocalStorage`-based `AuditContext`. Atomic audit гарантирован для всех `@Audit()`-помеченных эндпоинтов (mutation + audit-row коммитятся вместе или ни одна из них). Решено 2026-05-25, реализовано pre-Phase-4.4.
- **Status-фильтр в claims list — single-select** (так позволяет `ClaimFiltersSchema` в `packages/shared`). Multi-select требует правки schema.
- **`bg-input` зафиксирован как single surface token** (решено 2026-05-25 в Phase 4.4 uiux-аудите). `bg-bg-soft` deprecated. Policy в `docs/14-design-system.md` Surface-token policy section.
- **`opiekun` тоже впущен в `/employee` shell** с пустым nav-ом (роль идёт через `lib/roles.ts:ROLE_LANDING.opiekun = '/employee'`). Не блокер для Phase 4, чинится естественно в Фазе 5 при добавлении opiekun-вкладки.
- **Save kwotaMaksima без смены статуса не делается.** Решено 2026-05-25: kwotaMaksima меняется только внутри `UpdateClaimToAccepted` ветки `UpdateClaimSchema` (т.е. в момент акцепта). По бизнес-flow «потолок» — атрибут одобрения, не отдельная сущность. Никаких dedicated `PATCH /claims/:nrZgl/amount-maximum`. **UPD 2026-07-24: концепция kwotaMaksima выпилена целиком** (вместе с ручным request-authorization флоу) — поле `amountMaximum` удалено из схемы, подтверждение Максима фиксируется только скриншотом.
- **Stale generated Prisma client** — recurring проблема при schema-изменениях. После любого редактирования `schema.prisma` нужно `npm run build -w @magguarantee/database` (не только `prisma generate` — он обновляет только `src/generated/`, а api читает из `dist/generated/`). Side-quest для будущего: chain `prisma generate` в `npm run build -w api` через prebuild-script.

### Backend

1. ✅ `ClaimsService.update()` — `updateClaimFull` (`Code.gs:5183`, 462 строки) → разбита на:
   - ✅ `_validateClaimUpdate()`
   - ✅ `_recalcClaim()` (через `KmCalcService`)
   - ✅ `_buildUpdatePatch()` (вместо `_persistClaimUpdate()` — переименовано)
   - ✅ `_handleReklamacjaTransition()`
   - ✅ `_applyDecisionEmails()`
2. ✅ `PATCH /claims/:nrZgl` — только admin/pracownik, с `RolesGuard`.
3. ❌ ~~`ClaimsService.requestAuthorization()` + `POST /claims/:nrZgl/request-authorization`~~ — был реализован в 4.2, **выпилен 2026-07-24** (rework: в `OCZEKUJE_NA_AUTORYZACJE` только автоматический Maksim-gate при zapisie weryfikacji).
4. ❌ ~~`S3Module`: загрузка scrennshot-ов авторизации.~~ **Выпилено** из scope (решение от 2026-05-13).
5. ❌ ~~`POST /claims/:nrZgl/auth-screenshot` (multipart).~~ **Выпилено.**
6. ✅ Endpoint `/diagnostics/dashboard` (Sub-slice 4.3 DONE) — KPI counts, top carriers по выплатам, recent activity, urgent NA_WERYFIKACJI > 3d, rolling-12-month series, reklamacje count.
7. ✅ Endpoints для управления лимитами (`/limits` GET + PUT) — Sub-slice 4.5 DONE. Также добавлены `/audit` (read-side с cursor pagination + фильтрами), `/diagnostics/{mails,claims,db}` (+ POST resend), `/lookups/users`.
8. ✅ Управление справочниками типов прицепов (`/trailer-types`) — CRUD из Phase 2 + hard-delete с `reason` + before-snapshot для audit-diff (Sub-slice 4.4 DONE).
9. ✅ **Audit-log запись для всех mutating actions** — реализовано pre-Phase-4.4: atomic-audit refactor (commit `2d43fce`) обеспечивает запись через `@Audit()` декоратор внутри ambient `prisma.$transaction`. Все `@Audit()`-помеченные эндпоинты на carriers/vehicles/drivers/trailers/trailer-types/users/delegations/claims пишут audit-row атомарно с mutation. Phase 4.4 добавил `AuditContext.setBefore` (для before-snapshot diff) + `setMetadata` (для hard-delete `reason`).

### Frontend

> Видимость каждой страницы регулируется guard-ом на роль внутри `layout.tsx` — pracownik в навигации видит только пункты, помеченные **[оба]**; admin видит все. Прямой URL к admin-only странице у pracownik должен возвращать 403.

1. ✅ **[оба]** `app/(employee)/layout.tsx`: header + sidebar (240px desktop, slide-over mobile). Tabs рендерятся условно по `session.user.role` через `filterNavForRole()` из `lib/nav.config.ts`: pracownik → Dashboard + Wnioski; admin → 11 пунктов. Реализовано в Sub-slice 4.0.
2. ✅ **[оба]** `app/(employee)/employee/dashboard/page.tsx` — Sub-slice 4.3 DONE: 5 `<KpiCard>` row, `<DashboardSidebar>` 380px (Urgent/Recent/TopCarriers/Reklamacje), Recharts bar (monthlySeries) + pie (status distribution).
3. ✅ **[оба]** `app/(employee)/claims/page.tsx`: таблица всех wniosków с фильтрами. Sub-slice 4.1.
4. ✅ **[оба] `<ClaimVerificationModal>`** — главный модал верификации:
   - ✅ Все поля редактируемы (discriminated по `targetStatus`).
   - ✅ Live recalculation на каждое изменение (debounced 300ms → `/preview`).
   - ✅ История рекламации в табе «Historia» (если есть `origData`).
   - ❌ ~~Таб «Autoryzacja» (Phase 4.2 wiring: кнопка «Wymaga autoryzacji» → `POST /request-authorization`)~~ — **выпилен 2026-07-24**: вкладка удалена, единственная поверхность авторизации — `MaksimGateBlock` (авто-гейт); `decisionTargetsFor` не знает `OCZEKUJE_NA_AUTORYZACJE` вовсе.
   - ❌ ~~Upload screenshot для авторизации.~~ **Выпилено.**
5. ✅ **[admin only]** `app/(employee)/employee/(admin)/carriers/...` — Sub-slice 4.4 DONE: layout strip, hard-delete с `reason` через `<ConfirmDeleteWithReasonDialog>`, h-10 polish.
6. ✅ **[admin only]** `app/(employee)/employee/(admin)/vehicles/`, `drivers/`, `trailers/`, `trailer-types/` — Sub-slice 4.4 DONE (тот же набор фиксов).
7. ✅ **[admin only]** `app/(employee)/employee/(admin)/limits/page.tsx` — Sub-slice 4.5 DONE: year-selector + 12 `<LimitsRow>` с inline save-on-blur и optimistic mutation.
8. ✅ **[admin only]** `app/(employee)/employee/(admin)/audit/page.tsx` — Sub-slice 4.5 DONE: `<AuditTable>` + filter-bar (`targetType` / `<UserAutocomplete>` / action / date-range), cursor pagination, click-row → side-by-side JSON diff в `<Sheet>`.
9. ✅ **[admin only]** `app/(employee)/employee/(admin)/diagnostics/page.tsx` — Sub-slice 4.5 DONE: 3 секции через `<Tabs>` (Mails + Resend / ClaimsHealth / DbPing).
10. ✅ **[admin only]** `app/(employee)/employee/(admin)/users/page.tsx` — Sub-slice 4.4 DONE: `<UsersTable>` 6 колонок, `<UserSheet>` create/edit (RHF+Zod), reset-password с clipboard copy, deactivate/reactivate confirm, role-badge с цветовой матрицей.

### Deliverables

**Общие (обе роли):**
- Верификация wniosku end-to-end (статус, korekta godzin, nrZlecenia, запрос авторизации у Maksima, screenshot, обработка reklamacji).
- Email перевозчику с правильным цветным header (по `CONFIG.KOLORY` → теперь enum в shared).
- Email внутренним сотрудникам (planista, opiekun, lider) — отправляется.
- Dashboard показывает правильные числа (сверка с GAS на тех же данных).

**Только admin:**
- CRUD по carriers / vehicles / drivers / trailers / trailer-types / users.
- Управление помесячными лимитами и ставками.
- Audit log и diagnostics доступны через UI.
- Hard-delete с обязательным `powod`.

**Guard-контракт (важно для QA):** pracownik, открыв прямой URL вида `/employee/carriers` или `/employee/users`, получает 403 — это критерий приёмки фазы.

### Зависимости
- Фазы 0–3.

---

## Фаза 5 — Opiekun panel (≈ 1 неделя) ✅ ЗАВЕРШЕНА (2026-05-27)

**Цель:** опекун может управлять своими перевозчиками, видеть «Moja opieka» статистику.

### Backend

Большая часть уже сделана в Фазе 2 (CRUD с `OpiekunOwnershipGuard`). Добавлено в этой фазе:

1. ✅ `GET /api/v1/fleet/opiekun` — per-carrier fleet aggregates (`getOpiekunFleet`, ref `Code.gs:2733`). По каждому carrier-у: jezdzace, stojace, nieaktywne, potencjalne + cross-carrier totals. Реализовано в `apps/api/src/modules/fleet/fleet.service.ts` (`getOpiekunFleet` + `_classifyVehicles`/`_mapCarrierStats`/`_buildTotals` helpers); data layer через `CarriersRepository.listForOpiekunAggregate({ opiekunId? })`. Role-scope: opiekun → `opiekunId === user.sub`, admin → все.
2. ✅ `GET /api/v1/opiekun/carriers` — лёгкий список перевозчиков под opiekun-ом (identity + active-child counts). Новый модуль `apps/api/src/modules/opiekun/` (controller + service), зарегистрирован в `app.module.ts`.
3. ✅ Filter в service (НЕ через `OpiekunOwnershipGuard` — guard decorator-driven, для read-list endpoints нужен manual `where: { opiekunId: user.sub }`).
4. ✅ Тесты: 14 cases в `fleet.service.opiekun.spec.ts` (role gating + classification) + 10 cases в `opiekun.service.spec.ts` (ownership scope).

### Shared

1. ✅ `packages/shared/src/schemas/fleet.ts` — добавлены `OpiekunFleetQuerySchema`, `OpiekunCarrierVehicleStatsSchema`, `OpiekunCarrierStatsSchema`, `OpiekunFleetTotalsSchema`, `OpiekunFleetResponseSchema`.
2. ✅ `packages/shared/src/schemas/opiekun.ts` (новый) — `OpiekunCarrierCountsSchema`, `OpiekunCarrierListItemSchema`, `OpiekunCarriersResponseSchema`.

### Frontend

1. ✅ `app/(employee)/employee/opieka/page.tsx`: dashboard с totals strip (6 × `<KpiCard>`) + `<DataTable>` per-carrier (Firma, NIP, Aktywny badge, 4 vehicle buckets, drill-down link). Empty state.
2. ✅ `app/(employee)/employee/opieka/carriers/[login]/page.tsx`: read-only drill-down. Header + 3-tab `<Tabs>` (Auta / Kierowcy / Naczepy) с курированными sub-table компонентами.
3. ✅ Nav entry `{ key: 'opieka', href: '/employee/opieka', roles: ['opiekun','admin'] }` в `lib/nav.config.ts` + `HeartHandshake` icon в `EmployeeSidebar.tsx`. Закрывает Phase-4-gap «opiekun в /employee shell с пустым nav-ом».
4. ✅ Hooks: `useOpiekunFleet` + `useOpiekunCarriers` (TanStack Query) + API wrappers `lib/api/opiekun.ts`.
5. ✅ i18n: `nav.opieka` + полный `opieka.*` namespace в `messages/{pl,en}.json`.
6. ❌ ~~RoleSwitcher для alternate `opiekun` роли~~ — defer: `User` schema single-role, вернёмся когда multi-role появится.

### Deliverables
- ✅ Opiekun видит только своих перевозчиков (scope filter в service).
- ✅ Все mutating actions проходят через `OpiekunOwnershipGuard` — попытка править чужого carrier-а = 403 (уже из Phase 2).
- ✅ Audit-log пишется с `userRole=opiekun` (автоматически через unified `@Audit` + AuditInterceptor pipeline из Phase 4).

### Sub-slice 5.1 — Opiekun CRUD UI (2026-05-27) ✅ ЗАВЕРШЕНО

Открытие admin entity pages для роли opiekun. Бэкенд уже умел scope-filtering из Phase 2 — Phase 5.1 закрыл оставшиеся gap-ы.

**Backend (`apps/api/src/modules/`)**
- ✅ `vehicles.service.ts:610-636` — снято Phase-2 ограничение «opiekun must pass carrierId». Теперь opiekun без фильтра видит union vehicles всех своих carrier-ов (`carrierIds: [...]` в repo). `vehicles.repository.ts` поддерживает `carrierIds?: string[]` с empty-set short-circuit.
- ✅ `carriers.service.ts._resolveOpiekunId` уже бросал 403 для opiekun-а с `opiekunId != self` (no-op для Phase 5.1, добавлены unit-тесты которые этого факта раньше не покрывали).
- ✅ Vehicles/Drivers/Trailers create — `_assertCarrierAccessibleForWrite` уже проверял `carrier.opiekunId === user.sub` (no-op + тест).
- ✅ Политика «opiekun create with foreign opiekunId» = **403** (а не silent override) — consistency с update + audit-log clarity.
- ✅ Тесты: +9 cases (4 в vehicles, 5 в carriers). api total 437/441 green (4 фейла — известная Postgres-integration suite).

**Frontend (`apps/web/`)**
- ✅ `lib/roles.ts` — убраны `/employee/{carriers,vehicles,drivers,trailers}` из `ADMIN_ONLY_EMPLOYEE_PREFIXES`. Оставлены `trailer-types`, `users`, `limits`, `audit`, `diagnostics`.
- ✅ `lib/nav.config.ts` — добавлен `'opiekun'` в `roles` для 4 entity-пунктов.
- ✅ Route-group рефакторинг (Option A): 4 директории (`carriers/`, `vehicles/`, `drivers/`, `trailers/`) вынесены из `app/(employee)/employee/(admin)/` в `app/(employee)/employee/`. `(admin)/layout.tsx` теперь гейтит только admin-only страницы.
- ✅ Stale imports patched в `components/carrier-onboarding/CarrierOnboardingWizard.tsx`.
- ✅ UI nuances для opiekun-caller:
  - Carriers list: «filter by opiekun» Select скрыт (видит только своих).
  - Carrier create/edit Sheet: `opiekunId` Select скрыт; в create-режиме полностью скрыт «Assignment» FormSection; `<input type="hidden">` несёт `defaultOpiekunId = self`.
  - Vehicles/Drivers/Trailers: `canHardDelete = admin || opiekun` (раньше было только admin).
  - `carrierId` dropdowns во всех формах автоматически сужены — backend уже фильтрует `/api/v1/carriers` для opiekun.
  - `plannerId` / `dispatcherId` selects в vehicles sheet оставлены доступными opiekun-у (operational assignment, не ownership).

**Открытые мелочи (Phase 5)**

- **Drill-down делает 2 round-trip** (login → cached fleet list → carrier-by-id). Если станет узким местом — расширить `/fleet/opiekun` опциональным `?login=...` filter-ом. Не блокер.
- **`OpiekunCarriersResponse` не consumed в UI** — wrapper + hook есть «на вырост» (например, для future sidebar/picker).
- **Counts semantics:** `OpiekunCarriersResponse.counts.vehicles` = active+non-deleted; `OpiekunFleetResponse.carriers[].vehicles.total` = all non-deleted. Intentional разница — sidebar показывает «operational fleet size», dashboard разбивает по active/inactive.
- **`GET /opiekun/carriers` не задокументирован** в `docs/13-api-design.md` (только `/fleet/opiekun` упомянут). Дополнить при следующей правке docs.
- **Carrier list: колонка `opiekun` для opiekun-caller**. Сейчас показывает каждый раз его собственное имя (визуальный шум). Тривиально завернуть в `{!isOpiekun && ...}` если попросят.

### Sub-slice 5.2 — Expiring-documents alerts (📋 ЗАПЛАНИРОВАНО)

Вкладка «Alerty» для opiekun: предупреждения, что у его подопечных истекают документы со сроком. Спроектирована как **расширяемый alert-движок** (паттерн реестра провайдеров) — обособленная логика, куда новые типы алертов добавляются одной записью. Решения с заказчиком 2026-06-17.

**Scope v1 — только документы с уже существующим полем-датой** (3 провайдера): `Carrier.insuranceExpiry` (OCP), `Carrier.licenseExpiry` (лицензия), `Driver.licenseExpiry` (права водителя). Документы без даты (ADR, каботаж, техосмотр, паспорт, umowa, KREPTD) — НЕ обрабатываются; архитектура делает их добавление тривиальным (добавить поле-дату + 1 провайдер).

**Backend** — новый модуль `apps/api/src/modules/alerts/`:
- `AlertProvider`-интерфейс + реестр `ALERT_PROVIDERS` (декларативные записи: `type`, `model`, `dateField`, `documentCategory`, `scopeWhere` (opiekun-фильтр), `toSubject`). Добавление типа = +1 провайдер; движок/контроллер/репозиторий не меняются. Золотой тест читает длину реестра (подключение нового провайдера проверяется механически).
- Движок (`alerts.service`): итерация провайдеров → scoped-запрос (`dateField not null AND <= today+N`) → `daysToExpiry`/severity → merge + sort (expired first, затем по возрастанию дней). Неактивные/soft-deleted исключаются.
- `GET /api/v1/alerts` `@Roles('admin','opiekun')` — opiekun scoped (`carrier.opiekunId`), admin all, pracownik 403. Read-only (без `@Audit`). См. [13-api-design.md](13-api-design.md) «Alerts».
- Точки расширения (заглушки): `_filterDismissed` no-op (будущая таблица `AlertDismissal` для snooze/dismiss); без пагинации.

**Shared** — `packages/shared/src/schemas/alerts.ts`: `AlertItemSchema`, severity/type/category enum-ы, query/response (`{ items, meta: { warnDays, total } }`).

**DB** — без миграции/новых таблиц. Один seed-ключ `AppConfig.document_expiry_warn_days = 30` (1 порог; движок работает и без него — fallback 30). Будущая `AlertDismissal` — точка расширения для snooze.

**Frontend** — вкладка в `/employee/opieka`:
- Верхние табы «Przewoźnicy» (текущее) + «Alerty» (новое); таб-контент в `AlertsTab`.
- `lib/api/alerts.ts` + `useAlerts` + `AlertsTab`/`AlertList`/`AlertRow`/`AlertCountdownBadge`. Визуал переиспользует urgent-список дашборда pracownika (`SlaAttentionSection`/`SlaCountdownBadge`): expired→danger, warning→warning. Новых токенов нет.
- i18n `opieka.alerts.*` + `opieka.mainTabs.*` (PL/EN паритет). v1 read-only (без dismiss/deep-link; `carrierId`/`login` в DTO заложены на будущее).
- uiux отдельно не нужен (паттерн существует).

**Решения (2026-06-17):** доступ — opiekun (свои) + admin (все), pracownik нет; 1 порог срочности; имя водителя = `firstName + lastName`, перевозчика = `name ?? company`; неактивные/удалённые исключаются.

### Зависимости
- Фазы 2, 4 (компоненты CRUD).

---

## Фаза 6 — Planista, Dyspozytor (≈ 1 неделя) ✅ ЗАВЕРШЕНА (2026-06-01)

**Цель:** read-only panels для спедиторов и диспетчеров.

### Зафиксированные решения (перед стартом)

- **Planista panel** — полный паритет с legacy: 3 read-only вкладки Auta / Kierowcy / Naczepy (text roadmap упоминал только fleet+drivers — расширено до прицепов, т.к. backend всё равно их отдаёт).
- **Dyspozytor panel** — полный паритет: KPI-полоска статистики (jeżdżące / stojące>7dni / nieaktywne + totals) + 4 вкладки Auta / Wyjazdy / Kierowcy / Naczepy.
- **`GET /delegations` для dyspozytor — серверный авто-скоуп по JWT** (`where vehicle.dispatcherId = caller.sub`), а НЕ `?dyspozytorId=` query-param из исходного текста ниже. Консистентно с przewoznik→carrierId (Phase 3) и opiekun (Phase 5); client-параметр игнорируется.
- **Без миграций БД** — `Vehicle.plannerId`/`dispatcherId` и модель `Delegation` уже в схеме.

### Backend ✅

1. ✅ `GET /api/v1/fleet/planista` `@Roles('planista','admin')` — `FleetService.getPlanistaFleet` (ref `getPlanistaFleet`, `Code.gs:3583`). Vehicles по `plannerId === user.sub` (admin → all) + drivers/trailers carrier-ов этих авто. Slim-мапперы `toVehicleListItem`/`toDriverListItem`/`toTrailerListItem` вынесены и переиспользуются с `getMyFleet`.
2. ✅ `GET /api/v1/fleet/dyspozytor` `@Roles('dyspozytor','admin')` — `FleetService.getDyspozytorFleet` (ref `getDyspozytorFleet`, `Code.gs:3676`). По `dispatcherId === user.sub` + `stats` (через общий `DRIVING_RECENCY_DAYS = 7` / `_classifyVehicles`, идентично opiekun) + `stojaceList`.
3. ✅ `GET /api/v1/delegations` — `dyspozytor` вынесен из all-access ветки `_scopeListFilters` в собственную с server-side `dispatcherId` scope; в репозитории добавлен фильтр `where: { vehicle: { dispatcherId } }` (покрыт `@@index([vehicleId, status])`). Newest-first сохранён. `pracownik` по-прежнему 403 (quirk #13 не задет).
4. ✅ Тесты: `fleet.service.planista.spec.ts` (8), `fleet.service.dyspozytor.spec.ts` (13), `delegations.service.scope.spec.ts` (8). Полный api-сьют: 538 pass (известный Postgres-integration `check-constraints.spec.ts` падает без БД — не связан).

### Shared ✅

- ✅ `packages/shared/src/schemas/fleet.ts`: `PlanistaFleetResponseSchema`, `DyspozytorFleetResponseSchema`, `DyspozytorFleetStatsSchema`, `DyspozytorStojacyItemSchema` (+ inferred-типы). Переиспользуют `VehicleListItemSchema`/`DriverListItemSchema`/`TrailerListItemSchema`. `DelegationFiltersSchema` не менялась (scope серверный).

### Frontend ✅

> Панели — single-page с in-page `<Tabs>` внутри `<RoleShell>` (у него нет сайдбара). Route-группы `(planista)`/`(dyspozytor)` + `layout.tsx` (`requireRoleAccess` + `RoleShell`) уже существовали из ранних фаз.

1. ✅ `app/(planista)/planista/page.tsx` — heading + read-only banner + `<Tabs>` Auta/Kierowcy/Naczepy (`<DataTable>`), empty-states. `usePlanistaFleet` (`['fleet','planista']`) + `getPlanistaFleet()` в `lib/api/fleet.ts`.
2. ✅ `app/(dyspozytor)/dyspozytor/page.tsx` — heading + banner + 5-tile KPI-полоска + warning sub-list «stojące > 7 dni» + `<Tabs>` Auta/Wyjazdy/Kierowcy/Naczepy. Вкладка Wyjazdy через существующий `useDelegations()` (без параметров — сервер авто-скоупит), статус — статичный `<StatusBadge>`, без mutation-контролов. `useDyspozytorFleet` (`['fleet','dyspozytor']`) + `getDyspozytorFleet()`.
3. ✅ Общие компоненты `components/fleet/FleetTables.tsx` (3 read-only sub-table) + `components/fleet/ReadOnlyBanner.tsx`.
4. ✅ i18n: namespaces `planista.*` + `dyspozytor.*` в `messages/{pl,en}.json` (PL/EN паритет ключей). Вкладка выездов — «Wyjazdy» (консистентно с carrier-UI).
5. ✅ DS-секция «Phase 6 — Planista / Dyspozytor read-only panels» в `docs/14-design-system.md` (паттерн панели, колонки, KPI tone-map без purple, idle-highlight). Token policy соблюдена (новых токенов нет).

### Deliverables ✅
- ✅ Planista видит только закреплённые за ним авто (+ водителей/прицепы их carrier-ов); admin — debug-fallback.
- ✅ Dyspozytor видит свои авто, их выезды и KPI-статистику.
- ✅ Никаких mutating actions для этих ролей; прямой URL к чужому scope → пусто/403.

### Открытые мелочи (не блокеры)
- **Slim-DTO vs DS-колонки:** часть колонок из DS §6.3.2 (CERT.L / EURO / ADR / GPS / fuel-card / квад ставок / driver `idDocument`) опущены — их нет в slim `VehicleListItem`/`DriverListItem`. Если понадобятся — расширить slim-схемы или отдать full-DTO.
- **6-й KPI-tile `autaNieaktywne`** доступен в `stats`, но не выводится (grid зафиксирован 5-up по DS). Тривиально добавить (`lg:grid-cols-6`).
- **`GET /opiekun/carriers`** и теперь `/fleet/{planista,dyspozytor}` — все три есть в `docs/13-api-design.md`; новые response-схемы документировать при следующей правке docs.

### Доработка (2026-06-01, post-Phase-6 refinement)

По запросу владельца продукта — улучшения поверх готовой Фазы 6 (роутинг через `orchestrator-agent`, uiux → api → web):

- ✅ **Redesign detail-модалки выезда** (`DelegationDetailModal`, единый компонент → применяется везде: carrier + planista + dyspozytor). Новый «route-card» макет (DS §6.4.1): шапка = только номер авто + статус-badge (имя водителя убрано из шапки → перенесено в body-секцию), презентационный `<RouteCard>` (страна выезда → грузовик + пилюля «X dni · plan.» → страна возврата). Все 19 полей `DelegationDto` сохранены. Read-only, `max-w-2xl`.
- ✅ **Planista = Dyspozytor (временный паритет).** Извлечён общий `<FleetPanel>` (KPI-полоска + stojaceList + 4 вкладки Auta/Wyjazdy/Kierowcy/Naczepy), обе страницы — тонкие обёртки. Помечено в коде как TEMPORARY (разойдутся позже). Backend: `PlanistaFleetResponse` расширен `stats`+`stojaceList`; `getPlanistaFleet` строит их теми же хелперами (`_buildDispatcherStats`/`DRIVING_RECENCY_DAYS=7`).
- ✅ **Кликабельные строки → read-only модалки.** В `DataTable` добавлена клавиатурная a11y для активируемых строк (`role="button"`, `tabIndex=0`, Enter/Space, focus-ring, `rowAriaLabel`). Новые read-only модалки `FleetVehicleDetailModal`/`FleetDriverDetailModal`/`FleetTrailerDetailModal` (на `EntityDetailModal`), рендерятся из обогащённых slim-DTO **без доп. запроса**. Выезды → `DelegationDetailModal`.
- ✅ **Обогащение slim-DTO** (DS §6.4.2): `VehicleListItem`/`DriverListItem`/`TrailerListItem` дополнены курируемыми read-only полями, отдаются через уже-заскоупленные `/fleet/*`. **Без новых endpoint'ов, без расширения ролей, без IDOR.** Финансовые ставки (`rateDe/Ue/Export/Import`) и `bankAccount` **не** экспонируются planista/dyspozytor. `gpsMobilePhone` подписан как «ID urządzenia GPS» (quirk #2), `lastDroveAt` — display-only (quirk #11).
- ✅ **Security-hardening delegacji:** planista убран из all-access ветки `_scopeListFilters` → scope по `plannerId` (закрыта утечка из находки smoke-ревью); `getOne` защищён для planista (`plannerId`) и dyspozytor (`dispatcherId`) — закрыта by-id дыра. `pracownik` по-прежнему 403 везде (quirk #13).
- Тесты: api 50 fleet + 33 delegations зелёные; web typecheck/lint/build чистые; PL/EN паритет 1060 ключей.
- **Осталось вне scope:** opiekun/eksport all-access на `GET /delegations` (нет панелей — отдельно). Метка вкладки выездов оставлена «Wyjazdy» (консистентно с carrier-UI), хотя DS §6.3 предлагает «Delegacje».

### Исходный план (до старта — оставлен для истории)

Backend: `GET /fleet/planista`, `GET /fleet/dyspozytor`, `GET /delegations?dyspozytorId=...`. Frontend: отдельные страницы `app/(planista)/fleet|drivers` и `app/(dyspozytor)/fleet|delegations`. Фактическая реализация: single-page tabbed-панели + серверный scope вместо query-param (см. зафиксированные решения выше).

### Зависимости
- Фазы 2, 4 (+ 5 — компоненты opieka read-only паттерна).

---

## Фаза 7 — Eksport, Weryfikator (≈ 1 неделя) ✅ ЗАВЕРШЕНА (2026-06-22)

> 📄 Детальная импл-спека + открытые вопросы по scope: [`20-phase-7-eksport-weryfikator.md`](20-phase-7-eksport-weryfikator.md).
>
> ⚠️ Текст ниже — исходный план. Реализация прошла несколько rework-ов (doc 20 §0′, §0″): weryfikator — недельная km-доска (`VehicleDailyKm`) плюс переходы `gotowy→w_trasie→zjechal` с точными datetime; eksport ставит `gotowy` (= акцепт выезда); cancel — у перевозчика (свой `zgloszony`) и admin (любой активный), **не** у weryfikatora. Актуальное — doc 20 §0″ и [03-roles.md](03-roles.md).

**Цель:** ekspert экспорта и верификатор делегаций имеют свои панели.

### Backend

1. `GET /fleet/eksport` — `getEksportData` (`Code.gs:4196`).
2. `GET /delegations?role=eksport` (или просто `?carrierId=...&type=eksport`).
3. `GET /fleet/weryfikator` — `getWeryfikatorData`.
4. `GET /delegations?status=*&includeHistory=...` — для weryfikator-а all-access.
5. `POST /delegations/:id/in-transit` — `markDelegacjaInTransit`.
6. `POST /delegations/:id/returned` — `markDelegacjaReturned` + автообновление `Vehicle.lastDroveAt`.
7. `POST /delegations/:id/cancel` — для weryfikator-а (любой статус).

### Frontend

1. `app/(eksport)/delegations/page.tsx` — read-only.
2. `app/(weryfikator)/delegations/page.tsx` — таблица + кнопки изменения статуса + история.

### Deliverables
- Eksport видит «свои» делегации.
- Weryfikator может менять статус → автоматически обновляется `lastDroveAt` авто.

### Зависимости
- Фазы 2, 4.

---

## Фаза 8 — Audit + полировка (≈ 1 неделя) 🚧 В РАБОТЕ (старт 2026-06-16)

**Цель:** просмотр audit log, исправление мелких регрессий, отшлифовка UI.

> ⚠️ **DEFER — доделать после резолва eksport-панели (Phase 7).** Phase 7 не до конца
> закрыта по вопросам экспортёра. Поэтому часть Phase 8, завязанная на eksport-панель,
> сознательно отложена и должна быть доделана, **когда определится scope eksport-панели**:
> 1. **Audit-coverage для mutating-эндпоинтов eksport-панели** — когда появятся
>    eksport-specific мутации, добавить spot-check тесты что они пишут audit-row
>    (как для остальных критичных эндпоинтов, item 3 ниже).
> 2. **Polish/a11y/dark-mode проход по eksport-специфичным экранам** — если eksport-flow
>    изменится при резолве, заново прогнать его через Phase 8 чек-лист.
>
> Всё остальное в Phase 8 делается сейчас в полном объёме. Этот блок — единственный
> явно отложенный кусок; убрать пометку, когда eksport-панель финализирована.

### Прогресс выполнения (2026-06-16)

Роутинг через `orchestrator-agent`. Ключевой вывод: audit-reader (`GET /api/v1/audit`)
и audit-страница были фактически доставлены ещё в Phase 4.5, а primitives
(`<EmptyState>`/`<Skeleton>`/sonner/focus-trap) уже в репо — поэтому Phase 8 это
**проход верификации + полировки**, а не разработка с нуля.

- ✅ **Backend (api-agent).** Audit-reader сверен со спекой — все 6 фильтров
  (`targetType/targetKey/userId/action/from/to`) + cursor-пагинация на месте, ничего
  не пересобиралось. **Найден и исправлен реальный регресс:** `PATCH /claims/:nrZgl`
  (верификация заявления) с Phase 4.1 шёл **без** `@Audit()`-декоратора → в проде
  audit-row для верификации **не писался** (сервисные тесты маскировали это, открывая
  audit-контекст вручную). Добавлен декоратор + переиспользуемый
  `audit-coverage.harness.ts` (читает реальную `@Audit()`-конфигурацию через `Reflector`,
  гоняет продакшн `AuditInterceptor` end-to-end) + `audit-coverage.spec.ts` (22 spot-check
  теста на claims-update/request-authorization/limits-PUT/user-CRUD/hard-deletes ×5).
  Endpoint-sweep по `13-api-design.md`: всё in-scope реализовано; `GET /ready`
  (readiness-probe) отложен в Phase 9 — ✅ закрыт там 2026-07-30. Сьют: **721 pass /
  4 pre-existing fail** (нужен live Postgres).
- ✅ **Design system (uiux-agent).** Добавлена секция §8.0–§8.10 в
  [`14-design-system.md`](14-design-system.md): 5 screen-архетипов, skeleton/empty-state/
  toast/keyboard-контракт, a11y-чек-лист (7 «key screens»), dark-mode матрица + per-screen
  polish-матрица (28 экранов × 6 колонок).
- ✅ **Frontend (web-agent).** Полировка по матрице: централизован table-skeleton в
  `DataTable`, dual empty-state (data-empty vs filtered-empty), новый accessible
  `<CursorPager>` (заменил 3 ad-hoc «←/→» блока), i18n close-labels в `Dialog`/`Sheet`,
  aria-labels на icon-only кнопках, Recharts на CSS-var цветах для dark-mode. typecheck/
  lint/build чисто; i18n паритет **1242 PL ↔ 1242 EN**.
- 🚧 **Carry-overs (не блокеры, см. §8.10 в DS):** (1) dirty-form guard на 6 admin
  edit-`<Sheet>` (поведенческое изменение — отдельный слайс); (2) live axe-прогон
  (light+dark) на 7 key-screens — human/CI шаг; (3) eksport-экраны — △ re-pass после
  резолва export-панели (DEFER-блок выше).

### Backend

1. ✅ Audit log читалка: `GET /audit?targetType=...&targetKey=...&userId=...&from=...&to=...` (Phase 4.5, сверено).
2. ✅ Пагинация audit (cursor-based) — Phase 4.5, сверено.
3. ✅ Spot-check: критичные mutating endpoints фактически пишут audit (22 теста; найден+исправлен claims-verification регресс).
4. ✅ Финализация остальных endpoints из [13-api-design.md](13-api-design.md) — всё in-scope реализовано; `GET /ready` был отложен в Phase 9 и там ✅ закрыт (2026-07-30).

### Frontend

1. ✅ `app/(employee)/.../audit/page.tsx` — фильтры (target/user/action/date) + таблица + детали (Phase 4.5; сверено под polished-bar).
2. ✅ Полировка существующих экранов:
   - ✅ Loading skeletons вместо голого `Loading...` (централизовано в `DataTable`).
   - ✅ Empty states с подсказками (`<EmptyState>`, data-vs-filtered split).
   - ✅ Error toasts через sonner.
   - ✅ Keyboard shortcuts (Esc — close, Enter — submit) — кроме dirty-form guard на 6 admin sheets (carry-over).
3. ✅ Accessibility: focus-traps, aria-labels, контраст — code-level satisfied; live axe-прогон — carry-over.
4. ✅ Проверка dark mode на экранах (Recharts/badges на CSS-var; eksport-экраны — △ re-pass).

### Deliverables
- ✅ Audit log полностью функционален (+ закрыт регресс, при котором верификация заявлений не аудировалась).
- ✅ Экраны отполированы в обеих темах (eksport — после резолва export-панели).
- 🟡 a11y нарушения < 5 на ключевых экранах — code-level выполнено, требуется live axe-подтверждение.

### Зависимости
- Фазы 4–7 (нужны mutating endpoints, чтобы было что читать в audit).

---

## Фаза 9 — Email, Cron, S3, OAuth (параллельно с Фазами 3–8)

**Цель:** все integrations работают как в проде. Это не отдельная phase в timeline-е — задачи распределяются по предыдущим фазам, но выделены отдельно для трекинга.

> **BullMQ поднят рано (in-process):** очередь `email-send` работает внутри
> API-процесса и через неё идут **все** транзакционные письма (у каждого
> отправителя есть `enqueueX`-вариант с sync-фолбэком). Вторая очередь —
> `chat-notify-wyjazd` (Google Chat нотификация о выездах): выпиливалась
> 2026-07-28, **возвращена 2026-08-07**. Deps: `@nestjs/bullmq@10.2.3`, `bullmq@5.78.0`.
>
> **Крон — не BullMQ, а `@Cron` в API-процессе.** Четыре джобы (verification-sla
> 07:00, guarantee-watchdog 07:10, vehicle-removal-alert 07:20, weekly-report
> пн 09:00) живут как `@Cron`; письма из них всё равно уходят через очередь.
> Осознанное отклонение от исходной BullMQ-схемы в docs/16 — потребность в
> планировщике одинаковая, а `@Cron`-путь уже обкатан. Известное ограничение
> (у всех четырёх): при горизонтальном масштабировании N реплик = N писем,
> нужен Redis-lock по варшавской дате.

### Шаги

1. ✅ **Gmail API setup** — `GmailApiProvider` + RFC-threading + `npm run gmail:token`; выбор через `MAIL_PROVIDER=smtp|gmail`. Остались только внешние действия заказчика (GCP-проект фирмы, ящик `wnioski@`) — см. [23-prod-deployment-runbook.md](23-prod-deployment-runbook.md) Фаза 1.
2. ✅ **Все email-шаблоны** в React Email — 19 штук, все на едином дизайне ([22-email-design.md](22-email-design.md)). Полный список — [16-jobs-and-integrations.md](16-jobs-and-integrations.md#email-шаблоны-полный-список).
3. ✅ **Account-lifecycle письма закрыты для перевозчиков** (2026-07-30): `POST /carriers` шлёт `account-created` с временным паролем на `User.email` (не на `Carrier.ordersEmail`), reset-пароля у перевозчика и у внутренних ролей шлёт **общий** `account-password-reset`, реактивация — `account-reactivated`. Деактивация перевозчику **не** шлётся (решение заказчика) — асимметрия с внутренними ролями намеренная. Раньше пароль перевозчика писался в лог и передавался руками.
4. 🟡 **BullMQ queues:** `email-send` ✅; `daily-reminders` ❌ **отменён** (дублировал verification-SLA дайджест — шаблон удалён 2026-07-30); `weekly-report` ✅ (как `@Cron`, не repeatable job); `token-cleanup` 🚧 — единственная незакрытая джоба.
5. ✅ **S3** — `StorageService` (MinIO/S3-совместимый) + вложения claim-ов и машин. Retention policy — не формализована.
6. ✅ **Google OAuth** для внутренних — сделан как Google SSO + MAGSpace-справочник (трек A, 2026-09-09): id_token-flow, роль из stanowiska, reconcile раз в 15 мин. См. [24-sso-magspace-and-permissions-plan.md](24-sso-magspace-and-permissions-plan.md), [15-auth-strategy.md](15-auth-strategy.md). Слой permissions (трек B) — **сделан B1–B5 (2026-10-23)**: модель — [15-auth-strategy.md §Roles & Guards](15-auth-strategy.md), план и журнал — [25-permissions-layer-plan.md](25-permissions-layer-plan.md); точечные права пользователю (B6) — следующий шаг.
7. ✅ **`GET /ready`** (2026-07-30) — readiness-проба: Postgres `SELECT 1` + Redis `PING`, 200 / 503 с диагностическим телом. Было отложено из Phase 8.
8. 🚧 **Uptime Kuma** на VPS — пинг `/health` и `/ready`, алерты. Делается при выкате прода.
9. ❌ **Bull Board UI** на `/admin/queues` — не делали; очередь пока наблюдается через `/diagnostics/mails`.

### Deliverables
- 🚧 Все email уходят через Gmail API — код готов, ждёт GCP-креды заказчика.
- 🟡 Крон работает (5 джоб на `@Cron`); наблюдаемость — через `/diagnostics/mails`, не Bull Board.
- ✅ Файлы сохраняются в S3/MinIO и отдаются через download-proxy.

### Зависимости
- Фаза 1 (для 2FA email).
- Фазы 3–4 (для бизнес-email).

---

## Фаза 10 — Launch (≈ 0.5–1 неделя) ⏳ НЕ ЗАПУЩЕН (на 2026-09-14)

> **Статус на 2026-09-14.** Прод не выкачен. Код и процедура готовы: runbook [23-prod-deployment-runbook.md](23-prod-deployment-runbook.md) проверен репетицией 2026-07-28/29. Топология изменилась относительно исходного плана: TLS терминирует **корпоративный nginx MAGTRANS**, наш Caddy работает за ним по HTTP без ACME (коммит `3d70636`); деплой — `workflow_dispatch` на self-hosted runner (`staging` / `prod`), без SSH и без ghcr.io.
>
> Блокеры внешние, со стороны заказчика: прод-VPS; vhost `mymag.magtrans.eu` на nginx и IP nginx (для `UPSTREAM_PROXY_CIDRS`); GCP-проект фирмы для Gmail API; Google Group `no-reply@`; реальные ставки и лимиты вместо заглушек сида.
>
> Разделы ниже («staging уже работает», «Краткие шаги», «Rollback») — история до перехода на nginx и runner; актуальная последовательность — только docs/23.
>
> **2026-09-15:** пока prod-сервера нет, OVH-staging работает как боевой (pre-prod) с последующим переносом базы и вложений — [26-preprod-on-staging.md](26-preprod-on-staging.md), журнал паритета — [27-preprod-parity-ledger.md](27-preprod-parity-ledger.md).

**Цель:** новое приложение запущено в проде, готово принимать первых реальных пользователей. Так как мигрировать нечего, это простой production deployment.

См. [18-launch-and-deployment.md](18-launch-and-deployment.md) для полного чек-листа prod-окружения, CI/CD, secrets, мониторинга.

### Статус — staging уже работает (2026-05-12)

Отдельный staging-стенд развёрнут на OVH VPS (`vps-29a0acba.vps.ovh.net`) под промежуточным OVH-хостнеймом. Полный CI/CD pipeline настроен в `.github/workflows/ci.yml` — каждый push в `main` автоматически билдит, тестит, и через SSH деплоит на VPS (`git pull` + миграции + `docker compose up -d --build`).

Что уже сделано на staging и применимо к проду без изменений:
- ✅ VPS bootstrap (Docker, ufw, fail2ban, chrony, unattended-upgrades).
- ✅ Shared Caddy в `/opt/caddy/` с auto-HTTPS от Let's Encrypt.
- ✅ Docker compose стек (postgres + redis + mailhog + api + web) в `infra/docker-compose.staging.yml`.
- ✅ Multi-stage Dockerfiles для api/web (`apps/{api,web}/Dockerfile`) — build-on-server, без registry. Достаточно для одного разраба; при росте команды переключимся на ghcr.io.
- ✅ ENV-шаблон `infra/.env.staging.example` + правильные права на `/opt/magguarantee/.env`.
- ✅ Postgres exposed только на VPS-loopback для GUI-клиента (DBeaver / pgAdmin / TablePlus) через SSH-туннель.
- ✅ Deploy Key (read-only SSH-ключ от GitHub) для `git pull` на VPS.
- ✅ GitHub Actions secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`.
- ✅ Seed (admin + 7 тестовых юзеров других ролей + 14 типов прицепов + app_config) выполнен.

Что **отличается** от staging и должно быть переделано/добавлено для прода — см. [18-launch-and-deployment.md#переход-staging--prod](18-launch-and-deployment.md#переход-staging--prod).

### Краткие шаги

1. VPS поднят (Hetzner CX32 или эквивалент), bootstrap-скрипт `infra/setup.sh` отрабатывает: установка Docker + Compose, `ufw`, `fail2ban`, `chronyd`, `rclone`, создание `proxy-net` external network. S3-bucket (Cloudflare R2 / Hetzner Object Storage) создан.
2. **Shared Caddy** запущен в `/opt/caddy/` (auto-HTTPS via Let's Encrypt, роутит несколько приложений на VPS по доменам).
3. CI/CD pipeline готов: GitHub Actions билдит multi-stage Docker images для api и web, пушит в `ghcr.io`, по ssh обновляет `.env` на VPS и делает `docker compose pull && up -d --no-deps api web`. Миграции `prisma migrate deploy` запускаются ДО подмены контейнеров. См. [18-launch-and-deployment.md#cicd](18-launch-and-deployment.md#cicd).
4. **Prod docker-compose стек** в `/opt/magguarantee/`: postgres + redis + api + web. Bind mounts для данных (`./data/postgres`, `./data/redis`). Postgres exposed только на `127.0.0.1:5432` для GUI-клиента через SSH-туннель.
5. Все ENV переменные заполнены в `/opt/magguarantee/.env` (`chmod 0600`). Файл НЕ в репозитории, оригинал в 1Password.
6. Запуск seed: 14 типов прицепов + monthly_limits + app_config + первый admin (`docker compose run --rm api npm run db:seed`).
7. Smoke-тесты против prod зелёные.
8. Первый admin через UI создаёт сотрудников и перевозчиков (никаких скриптов-импортеров).
9. Uptime Kuma настроена (отдельный compose-стек, проксируется через тот же Caddy на `status.magtrans.eu`), бэкапы Postgres крутятся через systemd-таймер на хосте (`pg_dump` через `docker exec` → S3 через rclone).

### Rollback

Если деплой сломал prod:
- **api/web**: подмена `API_TAG`/`WEB_TAG` в `.env` на предыдущий sha и `docker compose up -d --no-deps api web`. Атомарно, без даунтайма Postgres/Redis. Старые образы хранятся локально 30 дней + всегда доступны из `ghcr.io`. Скрипт-обёртка `/usr/local/bin/magguarantee-rollback <sha>`.
- **БД-миграции**: forward-only — пишем новую миграцию, отменяющую проблемную. Никогда не делать `prisma migrate reset` на prod.

### Что делать с `Code.gs` + `index.html`

- Не нужны для launch вообще.
- Решить после Фазы 4: оставить в `legacy/` папке как референс или удалить полностью.
- Решение в [18-launch-and-deployment.md#что-делать-с-legacy](18-launch-and-deployment.md#что-делать-с-legacy-codegs--indexhtml).

### Deliverables
- Приложение доступно по prod-URL (`https://app.magtrans.eu`, `https://api.magtrans.eu`) — TLS получен Caddy автоматически.
- Admin может зайти, создать пользователей, начать UAT с реальными перевозчиками.
- Uptime Kuma пингует endpoints, `docker logs` собирает stdout, бэкапы Postgres крутятся.
- DR-тест успешен: восстановление дампа из S3 в чистый Postgres-контейнер занимает < 10 минут.

### Зависимости
- Все предыдущие фазы.

---

## Фаза 11+ — Wyjazd approval workflow (планируется после launch)

> ✅ **ФАЗА ЗАКРЫТА (2026-07-03, решение заказчика).** Все живые куски реализованы, остаток отменён:
> - **Шаг A (блок прошлых дат)** — ✅ реализовано (гейт в `DelegationsService.add()`, грань now−10 мин, обход env-флагами `ALLOW_PAST_DEPARTURE` / `NEXT_PUBLIC_ALLOW_PAST_DEPARTURE`).
> - **Шаг B (связка wniosek ↔ wyjazd)** — ✅ реализовано в Phase 7 §0″ (`Claim.delegationId` `@unique`, carrier выбирает выезд, период/пробег производные, авто-пересчёт при позднем `zjechal`).
> - **Шаг C (approval workflow)** — ✅ закрыт как есть: отдельного статуса **`zaakceptowany` НЕ будет — нынешний `gotowy` и есть акцепт** (`POST /delegations/:id/ready`, `eksport|admin`, флип после zlecenia в SpedTrans, откат до `w_trasie`). **Роли Аркадиуша НЕ будет** — каждый ставит статус под свою ответственность, авторство фиксируется на выезде (`readyBy/readyAt`, `verifiedBy/At`) + audit-log. Автоимпорт из SpedTrans не делается.
> - **Шаг D (`Team`)** — ✅ реализовано 2026-06-17 (модель `Team`, `Vehicle.dispatchTeamId`, admin CRUD, gchat-получатели через команду; gchat выпиливался 2026-07-28 и возвращён 2026-08-07). `Team` также даёт доступ диспетчеров к своим авто и питает блок «ZESPÓŁ PROWADZĄCY» в модалке выезда.
>
> Всё ниже — историческая спека, оставлена как контекст; актуальное состояние — этот баннер.

> ⛔ **БОЛЬШАЯ ПЕРЕОЦЕНКА (2026-06-12)** — фаза сильно урезана после выяснения реального процесса:
> - **Шаг B (`Claim.delegationId` hard-link) — ОТМЕНЁН.** Связи claim↔delegation в коде нет; `Claim.mileage` = `Σ VehicleDailyKm` (по машине+периоду). См. [20-phase-7-eksport-weryfikator.md](20-phase-7-eksport-weryfikator.md) §0′.
> - **Шаг C (approval workflow выездов) — ОТМЕНЁН.** Статус выезда — «мёртвый груз», его никто не верифицирует; роль одобряющего не нужна (секция «Роль одобряющего» ниже устарела).
> - **Шаг D (`Team`) — ОСТАЁТСЯ**, но только: gchat-уведомление о выездах + доступ диспетчеров к авто. Без верификации.
> - Дневной км-лист (`VehicleDailyKm`) вынесен в **Phase 7** и делается сейчас.
>
> Ниже — исходная спека фазы, оставлена как контекст; читать сквозь призму этого баннера.

> **Status:** PLANNED — спецификация зафиксирована с заказчиком 2026-05-25. Реализация после Phase 10 launch. Решение по роли одобряющего открыто (см. ниже).
>
> 🔁 **Update 2026-06-11 — связь wniosek ↔ wyjazd ПОДТВЕРЖДЕНА (не отменяется).** В одной из сессий связку ошибочно пометили «отменённой» (потеря контекста между сессиями) — это недоразумение; связь остаётся **ядром этой фазы**. По уточнённой бизнес-инфо механизм эволюционировал: gating-статус для подачи wniosek смещается с `zjechal` на новый **`zakończony`** (рейс закрыт **И** weryfikator уже проставил/проверил км по каждому дню рейса — см. daily-km доску weryfikatora, Phase 7), а `mileage` wniosku **выводится из суммы дневных км weryfikatora**, а не вводится перевозчиком. Перевозчик в идеале лишь выбирает `zakończony`-выезд и подтверждает. Открытые детали (привязка через выбор машины vs прямой выбор выезда; точная семантика `zakończony` относительно `zjechal`) — в Шаге B.

Главная идея: расширить wyjazd с self-service регистрации carrier-а до полноценного approval workflow с участием MagTrans, и связать wyjazd ↔ wniosek жёсткой связью (один wniosek подаётся на один конкретный wyjazd, а не на свободный календарный диапазон).

### Контекст и мотивация

Сейчас (Phase 3) carrier создаёт wyjazd в статусе `zgloszony` без какого-либо акцепта со стороны MagTrans — wyjazd сразу попадает в flow `zgloszony → w_trasie → zjechal`, а wnioski можно подавать на произвольный временной диапазон (from / to), никак не привязанный к зарегистрированным wyjazdami. Это даёт carrier-у слишком много свободы (можно зарегистрировать wyjazd прошлым числом, можно подать wniosek без сопутствующей delegacji вообще) и не позволяет MagTrans контролировать назначения planista/dyspozytor под конкретный рейс.

В будущем — добавляем точку одобрения + связку wyjazd ↔ wniosek + блок прошлых дат.

### Что делается

#### Шаг A — Мелкое: блок прошлых дат

- Запретить `departureAt < today` (today в timezone Europe/Warsaw, не now — carrier может зарегистрировать выезд «завтра в 02:00», но не «вчера»).
- **Shared (`packages/shared/src/schemas/delegations.ts`)** — добавить `.superRefine` проверку в `SubmitDelegationSchema`.
- **Frontend** — `min` атрибут на date-picker в `/(carrier)/delegations/new`.
- **Backend** — schema-валидация автоматически отработает (ZodValidationPipe).
- Acceptance: попытка сабмита `departureAt = вчера` через Postman → 422.

#### Шаг B — Жёсткая связь wniosek ↔ wyjazd

- Wnioski больше не подаются на произвольный (from, to) диапазон. Wnioski подаются на конкретный, уже завершённый (`status = zjechal`) wyjazd.
- **DB:** `Claim.delegationId` (FK на `Delegation.id`, **unique** — один wniosek на один wyjazd максимум).
  - Для legacy wniosków (до этой фичи) колонка `nullable`. Для новых wniosков — `NOT NULL` через app-level check (не CHECK constraint, чтобы не мешать миграции старых строк).
- **API:** `POST /claims` принимает `delegationId` вместо `from`/`to`. Диапазон вычисляется из wyjazd:
  - `from = delegation.departureAt` (timestamp)
  - `to = delegation.actualReturnAt` (timestamp; обязан существовать, т.к. wyjazd должен быть в `zjechal`)
  - km-calc получает те же входы (from, to, корректировки часов) — реализация `calcKmGwarantPerMonth` не меняется.
- **UI carrier:** в форме нового wniosek — селект из своих wyjazdy в статусе `zjechal`, у которых ещё нет привязанного wniosek (filter `WHERE NOT EXISTS (SELECT 1 FROM claim WHERE delegation_id = d.id)`).
- **Detail wyjazd** дополняется секцией «Powiązany wniosek» с линком (если есть).

> 🔁 **Эволюция Шага B (2026-06-11).** По уточнённому бизнес-флоу подача wniosek опирается не на `zjechal`, а на новый терминальный статус **`zakończony`** — рейс закрыт **И** weryfikator проставил/проверил км по каждому дню рейса (daily-km доска weryfikatora, Phase 7). Следствия:
> - Перевозчик **не вводит `mileage` руками** — пробег берётся как **Σ дневных км** weryfikatora за период выезда (предзаполняется; перевозчик подтверждает либо подаёт reklamację — как с любыми другими числами).
> - Форма wniosek сводится к **выбору `zakończony`-выезда** (или машины → её закрытых рейсов) без привязанного wniosek; период + пробег подтягиваются автоматически.
> - `calcKmGwarantPerMonth` по-прежнему не меняется — на вход те же (from, to, корректировки часов).
> - **Открыто:** вводить ли `zakończony` отдельным статусом после `zjechal` или это переименование/слияние; точный механизм выбора (по машине vs прямой выбор выезда). Зафиксировать перед стартом реализации.

#### Шаг C — Approval workflow для wyjazd

- При `POST /delegations` wyjazd создаётся в новом статусе `oczekuje_na_akceptacje` (НЕ сразу `zgloszony`).
- Одобряющий получает:
  - **Email** с краткой инфой о wyjazd и deeplink в приложение (`delegation-pending-approval.tsx`).
  - **In-app entry** в его dashboard / списке «Wyjazdy do akceptacji».
- Одобряющий открывает detail wyjazd и видит:
  - Все поля carrier-а (departureAt, plannedReturnAt, kierowca, naczepa, postal codes, comment).
  - Приписанных к этой машине `planista` и команду диспетчеров (из `Vehicle.plannerId` / `Vehicle.dispatchTeamId`).
  - **Может изменить** `planista` / команду именно для этого wyjazd — это **snapshot per-wyjazd**, а не глобальное переназначение на машине. Глобальные `Vehicle.plannerId`/`dispatchTeamId` остаются прежними (их меняет admin/opiekun).
- После approve:
  - `status → zgloszony` (далее по существующему flow: `w_trasie → zjechal`).
  - **Email-ы** уходят всем задействованным лицам:
    - carrier (`delegation-approved-carrier.tsx`)
    - planista (`delegation-approved-planista.tsx`)
    - dyspozytor (`delegation-approved-dyspozytor.tsx`)
    - opiekun carrier-а (`delegation-approved-opiekun.tsx`)
  - Каждое из задействованных лиц может **открыть detail wyjazd** через свою панель в read-only режиме (тот же `DelegationDetailModal`, что уже сделан в Phase 3).
  - Audit-log запись `approveDelegation` через `AuditWriter`.
- После reject:
  - `status → odrzucony` (новый статус) с обязательным `reason`.
  - Email carrier-у с причиной (`delegation-rejected-carrier.tsx`).
  - Остальные участники email-ов **не получают** (wyjazd не состоялся).
  - Audit-log запись `rejectDelegation`.

#### Шаг D — Сущность `Team` (команда диспетчеров)

Заменяет одиночного `Vehicle.dispatcherId` на **команду** диспетчеров. Отражает реальный процесс: в maciosoft (Sped Trans) машине приписывается целая команда (код `1.2.5`), её состав раньше вёлся вручную в Excel (raport DAF). Теперь команды ведёт `admin` в приложении.

- **DB:**
  - Новая модель `Team { code unique, name?, active, dispatchers User[], vehicles Vehicle[] }`.
  - `User.teamId` (FK → Team, nullable; для role=dyspozytor).
  - `Vehicle.dispatchTeamId` (FK → Team) **заменяет** `Vehicle.dispatcherId`. Forward-only деструктивная миграция (реальных данных нет — пустая БД + seed, боли нет). `Vehicle.plannerId` (ведущий спедитор) без изменений.
  - Смену (zmiana) **НЕ** храним — меняется еженедельно, достаточно имён.
- **Доступ:** диспетчер видит авто, где `vehicle.dispatchTeamId = его teamId` (**оба** сменщика). Эндпоинты dyspozytor-панели — фильтр по team вместо single dispatcher.
- **Уведомление о выезде (`chat-notify-wyjazd`):** получатели = `team.dispatchers` (все) + `vehicle.planner` (один) + `carrier.opiekun`. Из строки `ZESPÓŁ PROWADZĄCY` убран `weryfikator`. Интеграция выпиливалась 2026-07-28 и **возвращена 2026-08-07** (тогда же удалено письмо опекуну о выезде — внутренняя аудитория читает Chat). Тот же состав рендерится в модалке выезда — см. [14-design-system.md](14-design-system.md) §7.9.7. Детали: [16-jobs-and-integrations.md](16-jobs-and-integrations.md).
- **Админ-UI:** CRUD команд (код + состав диспетчеров).
- **Форма машины (UI):** вместо «выбрать 1 диспетчера» — выбор **команды** (dropdown) + превью её состава (список имён); пустая команда подсвечивается («Brak dyspozytorów w zespole»). `planner` (ведущий спедитор) выбирается как раньше.
- **Не-goal:** спедиторы **НЕ** через команду — в уведомление летит один ведущий спедитор = `Vehicle.plannerId`. Team только для диспетчеров.

### Роль одобряющего — РЕШЕНО (2026-06-12)

> ⛔ **ОТМЕНЕНО (2026-06-12) — approval/верификации выезда нет** (статус выезда — «мёртвый груз»). Сущность `Team` (`Vehicle.dispatchTeamId`, заменяет `dispatcherId`) **остаётся**, но только для gchat-уведомлений и доступа диспетчеров к авто — не для одобрения. Таблица вариантов ниже и текст про «роль одобряющего» — устарели, оставлены как история.

| Вариант | Плюсы | Минусы |
|---|---|---|
| 1. `opiekun` | Уже знает carrier-а; минимум новых сущностей | Перегружает opiekun-а, у которого основной scope — CRUD carrier-ов |
| 2. `weryfikator` | Уже работает с wyjazd (`markInTransit`/`markReturned` в Phase 7); естественное расширение | Нет проверки «opiekun этого carrier-а» — нужен дополнительный guard если хотим scope-нуть |
| 3. Новая роль `akceptant_wyjazdow` | Clean separation; нагрузка на новое лицо, а не на существующее | +1 роль в матрице доступа (станет 9 ролей), +миграция, +новые seed-юзеры |

**Дефолтная рекомендация:** вариант 2 — расширить scope `weryfikator`. У него уже есть read-доступ ко всем wyjazd и mutate их статуса; акцепт логически встраивается в тот же flow. Решение фиксируется перед стартом Phase 11 после обсуждения с заказчиком.

> ⚠️ **Note 2026-06-11 — рекомендация «вариант 2» устарела.** После Phase 7 рефорка `weryfikator` занят ежедневным per-vehicle route-status/км и с выездами не работает (см. `delegations.controller.ts` — transition-хендлеры удалены). Реальный акцепт-флоу по новой инфо: роль **Arkadiusza** (назначает zespół prowadzący + указывает экспортёра) + **importer**, который ставит выезду `zaakceptowany` по факту наличия **`zlecenie` в SpedTrans** (zlecenie = твёрдый гарант, что машина выедет; `zgłoszenie` перевозчика — мягкое). Это пересматривает Шаг C (роль одобряющего + статус-машину выезда) — решение открыто.
>
> ✅ **РЕШЕНО 2026-07-03:** ни `zaakceptowany`, ни роли Arkadiusza, ни importer-а не будет. `gotowy` (Phase 7 §0″, ставит `eksport` после zlecenia в SpedTrans) — это и есть акцепт; каждый действует под свою ответственность, авторство пишется на выезде (`readyBy/readyAt`) и в audit-log. Шаг C закрыт.

### Влияние на существующие модели

| Модель | Изменение |
|---|---|
| `Delegation.status` enum | + `oczekuje_na_akceptacje`, + `odrzucony` |
| `Delegation` поля | + `plannerSnapshotId` (FK → User, nullable), + `dispatchTeamSnapshotId` (FK → Team, nullable), + `approvedById` (FK → User, nullable), + `approvedAt`, + `rejectedById`, + `rejectedAt`, + `rejectionReason` (text) |
| `Claim` поля | + `delegationId` (FK → Delegation, **unique**, nullable для legacy) |
| `POST /delegations` (controller) | Меняет дефолтный возвращаемый status с `zgloszony` на `oczekuje_na_akceptacje` |
| Новый endpoint | `POST /delegations/:id/approve` — одобряющий, body `{ plannerSnapshotId?, dispatchTeamSnapshotId? }` (опциональная переоверрайдка) |
| Новый endpoint | `POST /delegations/:id/reject` — одобряющий, body `{ reason: string }` (required) |
| `POST /claims` (controller) | Принимает `delegationId` вместо `from`/`to` для **новых** wniosków |
| Carrier UI | Status-badge для новых статусов; cancel разрешён и в `oczekuje_na_akceptacje` тоже |
| Approver UI | Новая страница `/(weryfikator|...)/delegations/pending` со списком pending wyjazdy + approve/reject actions |
| Новая модель `Team` | `code` unique, `name?`, `active`, `dispatchers User[]`, `vehicles Vehicle[]` — admin CRUD (замена ручного Excel/DAF) |
| `User` поля | + `teamId` (FK → Team, nullable; для dyspozytor) |
| `Vehicle` поля | `dispatchTeamId` (FK → Team) **заменяет** `dispatcherId` (forward-only миграция; `plannerId` без изменений) |
| `chat-notify-wyjazd` получатели | `team.dispatchers[]` + `Vehicle.planner` + `Carrier.opiekun`; `weryfikator` убран из `ZESPÓŁ PROWADZĄCY`. Тот же состав — в модалке выезда |
| Vehicle form UI | выбор команды + превью её состава (имена) вместо single dispatcher; пустая команда подсвечивается |

### Что НЕ делается в этой фазе

- ❌ **Не делается** глобальная reassignment planista/dyspozytor на машине — только snapshot для конкретного wyjazd. Глобальное переназначение остаётся за admin/opiekun.
- ❌ **Не вводится** мульти-этапный approval (только одна точка одобрения).
- ❌ **Не вводится** SLA / автоэскалация (можно добавить позже как Phase 11.5).
- ❌ **Не делается** legacy-миграция старых wniosков под новую FK — `Claim.delegationId` остаётся `nullable` для исторических записей, валидация `NOT NULL` живёт в DTO для **новых** submission-ов.

### Зависимости

- Phase 3 ✅ — wyjazd CRUD и `DelegationDetailModal` (уже сделано 2026-05-25).
- Phase 7 — weryfikator endpoints должны быть в наличии (для варианта 2 роли одобряющего).
- Phase 9 — Gmail API setup должен работать (новые email-шаблоны).
- Phase 10 — launch завершён, есть staging для UAT новой фичи.

### Acceptance criteria (предварительные)

- [ ] Carrier не может выбрать дату `departureAt < today` ни через UI, ни через Postman.
- [ ] При создании wyjazd carrier-у возвращается status `oczekuje_na_akceptacje`; в UI badge → «Oczekuje na akceptację».
- [ ] Approver видит wyjazd в своём списке pending, видит globally-приписанных planista/dyspozytor, может их override-нуть для этого wyjazd.
- [ ] После approve: carrier + planista + dyspozytor + opiekun carrier-а получают email; status флипается на `zgloszony`; в audit-log запись.
- [ ] После reject: carrier получает email с reason; status → `odrzucony`; другие участники email-ов не получают.
- [ ] `POST /claims` без `delegationId` для **новых** wniosков → 422 (с явным сообщением «wniosek требует powiązanego wyjazd»).
- [ ] Каждый из задействованных может открыть detail wyjazd в read-only modal через свою панель.

---

## Тестирование km-calc

Это самая критичная часть — расчёт `kmGwarant` и `paymentEur`. Если расхождение, перевозчик заметит и пожалуется.

Так как реальных wniosków нет (фейковые данные в Sheets некорректны для теста), fixtures генерируем сами:

### Подход

1. Внимательно прочитать `Code.gs:862` (`calcKmGwarantPerMonth`) — это эталонная реализация.
2. Реализовать ту же логику в `packages/shared/domain/km-calc.ts` (TypeScript).
3. Написать набор тест-кейсов вручную, покрывающих краевые случаи:
   - Полный месяц (Dec 1 – Dec 31).
   - Полмесяца (Jan 15 – Jan 31).
   - Перекрытие двух месяцев (Mar 25 – Apr 5).
   - Перекрытие года (Dec 28 – Jan 5).
   - С пасхальными днями (Apr 1 – Apr 10 в год где Пасха в этом окне).
   - С EU-banned днями (выходные + общие праздники).
   - Дробные дни (старт/конец посреди дня — учёт `timeFrom`/`timeTo`).
   - Корректировка часов (`hoursAdjustedValue` — applied; `origHoursAdjusted` — immutable carrier snapshot; оба `Decimal(5,2)?`).
   - Месяцы без `LIMITY KM` записи → fallback на `CONFIG.STAWKA_EUR_ZA_KM`/`KM_DZIENNIE`.

### Sample fixture

```ts
// packages/shared/tests/km-calc.test.ts
import { describe, it, expect } from 'vitest';
import { calcKmGwarantPerMonth } from '../src/domain/km-calc';

const LIMITS = {
  // Year 2026
  '2026-01': { kmPerDay: 540, ratePerKm: 0.5 },
  '2026-02': { kmPerDay: 540, ratePerKm: 0.5 },
  // ...
};

describe('calcKmGwarantPerMonth', () => {
  it('full month with weekends excluded — Jan 2026', () => {
    const r = calcKmGwarantPerMonth('2026-01-01', '2026-01-31', 0, LIMITS);
    expect(r.totalDays).toBeGreaterThan(20);  // ~21 рабочий день
    expect(r.totalDays).toBeLessThan(23);
    expect(r.kmGwarant).toBeCloseTo(r.totalDays * 540, 0);
    expect(r.ratePerKmEffective).toBeCloseTo(0.5, 4);
  });

  it('cross-month weighted rate', () => {
    // Если в январе ставка 0.5, в феврале 0.6, и распределение 10:5 дней
    const r = calcKmGwarantPerMonth('2026-01-21', '2026-02-07', 0, {
      '2026-01': { kmPerDay: 540, ratePerKm: 0.5 },
      '2026-02': { kmPerDay: 540, ratePerKm: 0.6 },
    });
    // взвешенная ставка ≈ (10 × 0.5 + 5 × 0.6) / 15 = 0.533
    expect(r.ratePerKmEffective).toBeCloseTo(0.533, 2);
  });

  it('Easter exclusion 2026', () => {
    // Пасха 2026 = 5 апреля; пасхальный понедельник = 6 апреля
    const r = calcKmGwarantPerMonth('2026-04-05', '2026-04-06', 0, LIMITS);
    expect(r.totalDays).toBe(0);  // оба дня excluded
  });

  // ... 30+ кейсов для всех краевых случаев
});
```

Эти тесты — единственный source of truth для расчёта (т.к. реальных данных нет). Если функция в Nest даёт другой результат, чем в `Code.gs:862` на тех же входных — фикс в TS-реализации, не в тестах.

## Сводный timeline

| Фаза | Длительность | Параллельно | Кумулятивно |
|---|---|---|---|
| 0. Foundation | 1 нед | — | 1 нед |
| 1. Auth | 1 нед | — | 2 нед |
| 2. Core entities | 2 нед | — | 4 нед |
| 3. Carrier panel | 2 нед | Email-шаблоны (carrier-submitted, login-code) | 6 нед |
| 4. Pracownik+Admin | 3 нед | Email-шаблоны (decision, internal), S3 | 9 нед |
| 5. Opiekun | 1 нед | — | 10 нед |
| 6. Planista, Dyspozytor | 1 нед | — | 11 нед |
| 7. Eksport, Weryfikator | 1 нед | — | 12 нед |
| 8. Audit + полировка | 1 нед | Cron jobs (reminders, report, token-cleanup) | 13 нед |
| 9. Integration polish | 0.5 нед | — | 13.5 нед |
| 10. Launch | 0.5 нед | — | **~14 нед** |

**Total: ~3–3.5 месяца** для одного разработчика full-time. Параллельность (2 dev) сокращает до **~9–10 недель** (Фазы 4 и 5 могут идти одновременно с 6–7 разными людьми).

## Definition of Done для каждой фазы

- [ ] Все запланированные endpoints прошли e2e-тесты.
- [ ] UI прошёл UAT с минимум 1 user-ом нужной роли.
- [ ] Lint, typecheck, tests — зелёные в CI.
- [ ] Дизайн соответствует скриншоту GAS-версии (визуально).
- [ ] Темы (light/dark) обе работают.
- [ ] Mobile/tablet — критичные экраны проверены на 360px и 768px.
- [ ] Audit-log пишется для всех mutating action-ов фазы.
- [ ] Email-шаблоны фазы — отправляются и выглядят как в GAS.
- [ ] Документация (README или комментарий в PR) описывает что добавлено.

## Что не входит в roadmap

Эти задачи выходят за scope «функциональной идентичности» с тем, что задумано в `Code.gs`/`index.html`, и делаются после launch (Фаза 11+):

- **[✅ ЗАВЕРШЕНО 2026-07-03]** Wyjazd approval workflow + жёсткая связь wniosek ↔ wyjazd + блок прошлых дат — всё реализовано (`gotowy` = акцепт, без `zaakceptowany`/роли Arkadiusza); итоговый баннер в [#фаза-11--wyjazd-approval-workflow-планируется-после-launch](#фаза-11--wyjazd-approval-workflow-планируется-после-launch) выше.
- Pagination/virtualization для очень длинных списков.
- Внутренний чат на каждое заявление (был в legacy, выпиливается, может вернуться позже как новая фича).
- Экспорт wniosków в PDF.
- Mobile приложение.
- API для интеграций с внешними системами (партнёрский ERP).
- Multi-language UI (PL → EN/DE).
- 2FA через TOTP-приложение или SMS.
- Self-service «История моих заявлений» с графиками для перевозчика.

Эти задачи можно оценивать отдельно — они уже не критичны для launch.

---

## Доработка (2026-07-31) — Reklamacje rework

Финальная реализация рекламаций по спеке заказчика (детали: `docs/01` §5, `docs/13` §Claims, `docs/14` §"Reklamacja sheet"/§6.5.15, `docs/12`/`docs/04` — новые колонки):

- **Cap**: `kwota ≤ origPaymentEur − (amountApproved при ZAAKCEPTOWANO, иначе 0)`, строго (легаси-допуск ±1 € удалён); `maxAmount ≤ 0` ⇒ подача запрещена. Формула живёт ТОЛЬКО в `packages/shared/src/domain/reklamacja-rules.ts` (`getReklamacjaEligibility`) — api и web потребляют её оттуда. Окно 48ч от `statusChangedAt` подтверждено заказчиком и сохранено.
- **Вариант A статус-семантики**: решение по рекламации возвращает `status` в `statusBeforeReklamacja` (оба исхода); исход — в новой колонке `reklamacjaResolution` (`UZNANA`/`ODRZUCONA`) + `reklamacjaOrderNumber` (обязателен при UZNANA, DB CHECK), `reklamacjaSubmittedAt/DecidedAt/DecidedById`. Payout-поля wniosku (`amountApproved`/`orderNumber`/`orderDate`/`decidedById`) рекламацией **не трогаются**; «wypłacono łącznie» = `amountApproved + uznana reklamacjaAmount`. Миграция `20260731120000_add_reklamacja_resolution_fields` (+ backfill старых строк).
- **Гейты/коды**: machine-codes `REKLAMACJA_*` (409 ALREADY_SUBMITTED; 422 CLAIM_NOT_DECIDED / WINDOW_EXPIRED / NO_DELTA / AMOUNT_EXCEEDS_CAP / NOT_PENDING); ветки рекламаций исключены из `CLAIM_NOT_VERIFIED`, Maksim-гейта и compensation-due-гейта; km-recalc на них заморожен.
- **Письма (3)**: `reklamacja-internal-submitted` (все active admin+pracownik), `reklamacja-carrier-submitted` (подтверждение перевозчику), `reklamacja-carrier-decision`; threadKey `wniosek-{nrZgl}`. Weekly-report: новая строка «Uznane reklamacje» (по `reklamacjaDecidedAt`) + исключение возвратов статуса из decided-in-week.
- **Web**: `ReklamacjaSheet` на shared-хелпере (3 dead-end-состояния), `<ReklamacjaOutcome>` на carrier-детали, `<ReklamacjaResolutionChip>` (carrier+employee), decision-UX staff-модалки — nr zlecenia (prefill из `orderNumber`) вместо ввода суммы.
- ~~**Follow-up**: старые письма `internal-decision`/`maksim-confirmation-request` линкуют на несуществующий роут `/employee/claims/{nrZgl}` (рабочая форма — `?nrZgl=`); вне scope этой доработки.~~ **Сделано 2026-10-22 (UWAGI #2):** `internal-decision`, `maksim-confirmation-request` и staff-копия `carrier-submitted` линкуют `{APP_URL}/employee/claims?nrZgl={encodeURIComponent(nrZgl)}` через общий helper `employeeClaimDeeplink` в `claims.service.ts` (им же пользуется `reklamacja-internal-submitted`). Страницы-редиректа нет.

---

## Доработка (2026-09-28) — Передача машины другому планисте

Продолжение Фазы 6 (планиста) и docs/28 (лидеры). План и решения — [docs/29](29-vehicle-planner-transfer-plan.md); UI — `docs/14` §17; API — `docs/13` «Vehicle planner transfers»; поведение — `docs/03` (planista, opiekun, admin, лидеры), `docs/19` #14, #15.

- **Прямой смены планисты нет** ни у кого: `PATCH /vehicles/:id` с `plannerId` → 422 `VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER`. Планиста выбирается только при создании машины.
- **Заявка → решение**: подают opiekun своего перевозчика или текущий планиста; решают admin или лидер текущего планисты (`User.liderId`), но не автор и не получатель. Одобрение в одной транзакции переключает `Vehicle.plannerId`, пишет журнал назначений и переносит невыехавшие выезды (`zgloszony`/`gotowy`). Уведомлений нет.
- **История**: `Delegation.plannerId` — снимок планисты выезда (scope выездов, «ZESPÓŁ PROWADZĄCY», Chat), `VehiclePlannerAssignment` — журнал по машине; получатели писем по wnioskam — планиста периода + его текущий лидер. Флот, km-рапорт, GPS остаются живыми.
- **`liderEmail` → `liderId`**: связь «планиста → его лидер», ставит admin в UserSheet; колонка `liderEmail` удаляется отдельным релизом.
- **Миграция** `20260928120000_vehicle_planner_transfer`: две таблицы, два поля, бэкфиллы (`liderId` из `liderEmail`, снимки выездов, журнал с источником `backfill`). Перед выкатом на pre-prod — ручной бэкап; после — проставить `liderId` планистам (через `preprod-parity-agent`).

---

## Доработка (2026-10-02) — BugBot handoff

Кнопки «Zgłoś problem» (все роли) и «Zgłoś pomysł» (admin) открывают BugBot — отдельный сервис MAGTRANS для приёма багов и идей — уже залогиненным. Контракт — `MAGGuaranteeBugBot/docs/06-contracts.md` §1; наша сторона — `docs/16` §«BugBot handoff»; API — `docs/13` «External integrations» и «Rate limiting»; auth — `docs/15` (третий JWT, отдельный от access/refresh).

- **API**: `GET /integrations/bugbot/handoff?kind=&locale=` подписывает ES256-токен на 60 с (`@nestjs/jwt`, отдельный `new JwtService({})`, без новых зависимостей) и отвечает `{ url }` с `no-store`. Личность — только из сессии; `kind=idea` не-админом — 403; не настроено — 404.
- **Env**: `BUGBOT_URL` + `BUGBOT_HANDOFF_KID` + `BUGBOT_HANDOFF_PRIVATE_KEY` — всё или ничего, ключ проверяется на старте (EC P-256); `BUGBOT_PROJECT_SLUG` (дефолт `magguarantee`); web — build-time `NEXT_PUBLIC_BUGBOT_ENABLED`.
- **Лимит**: 10/мин на пользователя отдельным guard-наследником `ThrottlerGuard`; глобальные 100/мин/IP не тронуты.
- **Логи**: токен и URL не пишутся нигде, одна INFO-строка `{ userId, kind }`.
- **Выкат** (через `preprod-parity-agent`): сгенерировать пару ключей на сервере, публичный ключ + `kid` — в BugBot (Projects → Access), приватный — в `infra/.env`, `NEXT_PUBLIC_BUGBOT_ENABLED=true` и пересборка web. Staging и prod — разные пары.
