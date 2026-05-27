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

- **pracownik и admin делят один Employee panel и оба верифицируют wnioski** — нет смысла делать их в разных фазах. Делаем вместе. (NB: pracownik — узкая роль «Opiekun wniosków», только wnioski + dashboard, без CRUD по carrier/vehicle/driver/trailer; admin — полный scope. См. [03-roles.md#pracownik](03-roles.md#pracownik).)
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

## Фаза 1 — Auth: login + 2FA + JWT (≈ 1 неделя)

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

## Фаза 2 — Core entities: Users, Carriers, Vehicles, Drivers, Trailers (≈ 2 недели)

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
10. Внешние интеграции: VIES, Biała Lista, info-car (см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#внешние-rest-интеграции)).
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

## Фаза 3 — Przewoznik (carrier) panel (≈ 2 недели)

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

## Фаза 4 — Pracownik + Admin panel (≈ 3 недели)

**Цель:** обе роли получают доступ к Employee panel — с разным scope-ом, **не путать**:

- **`pracownik` («Opiekun wniosków»)** — узкая роль. Видит **только 2 вкладки**: Dashboard + Wnioski. Единственная задача — верифицировать заявления (изменение статуса, korekta godzin, nrZlecenia, запрос авторизации у Maksima, обработка reklamacji). Никакого CRUD по carrier/vehicle/driver/trailer/trailer-type/limits/users, никакого audit-log, никаких diagnostics. См. [03-roles.md#pracownik](03-roles.md#pracownik).
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
  - [x] api: `MailService.sendAuthorizationRequest` + React Email template `authorization-request.tsx` с MAGTRANS RED branding, deeplink `{APP_URL}/employee/claims/{nrZgl}`, plain-text fallback.
  - [x] api: `MAKSIM_EMAIL = 'maksim.siankevich@magtrans.eu'` константа в `apps/api/src/modules/claims/maksim.config.ts` (TODO: вынести в AppConfig в Phase 9). `APP_URL` env-var добавлен.
  - [x] api: `PATCH /claims/:nrZgl` принимает `amountMaximum` (= kwotaMaksima) внутри `UpdateClaimToAccepted` ветки — kwotaMaksima меняется **только при акцепте**, без отдельного override endpoint-а (решение от 2026-05-25: «потолок» — атрибут одобрения, не отдельная сущность).
  - [x] web: TanStack `useRequestAuthorization(nrZgl)` хук. UI Autoryzacja-таба переписан под Phase 4.2 (RHF + `zodResolver(RequestAuthorizationSchema)`, кнопка «Wymaga autoryzacji» с email-toast, при статусе уже `OCZEKUJE_NA_AUTORYZACJE` — read-only summary с info-banner).
  - [x] web: `decisionTargetsFor('NA_WERYFIKACJI')` в `claim-transitions.ts` больше не включает `OCZEKUJE_NA_AUTORYZACJE` — единственный путь в этот статус теперь через Autoryzacja-таб с email. Старый legacy PATCH-вариант в backend `UpdateClaimToAuthorizationPending` остаётся в schema для API-обратной совместимости, но из UI исключён.
  - [x] tests: 9 unit на `ClaimsService.requestAuthorization()` (happy path, illegal transition, missing claim, audit before-capture, mail-failure isolation, optional-comment) + 2 на PATCH `amountMaximum` + 6 на email-шаблон.
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
- **Save kwotaMaksima без смены статуса не делается.** Решено 2026-05-25: kwotaMaksima меняется только внутри `UpdateClaimToAccepted` ветки `UpdateClaimSchema` (т.е. в момент акцепта). По бизнес-flow «потолок» — атрибут одобрения, не отдельная сущность. Никаких dedicated `PATCH /claims/:nrZgl/amount-maximum`.
- **Stale generated Prisma client** — recurring проблема при schema-изменениях. После любого редактирования `schema.prisma` нужно `npm run build -w @magguarantee/database` (не только `prisma generate` — он обновляет только `src/generated/`, а api читает из `dist/generated/`). Side-quest для будущего: chain `prisma generate` в `npm run build -w api` через prebuild-script.

### Backend

1. ✅ `ClaimsService.update()` — `updateClaimFull` (`Code.gs:5183`, 462 строки) → разбита на:
   - ✅ `_validateClaimUpdate()`
   - ✅ `_recalcClaim()` (через `KmCalcService`)
   - ✅ `_buildUpdatePatch()` (вместо `_persistClaimUpdate()` — переименовано)
   - ✅ `_handleReklamacjaTransition()`
   - ✅ `_applyDecisionEmails()`
2. ✅ `PATCH /claims/:nrZgl` — только admin/pracownik, с `RolesGuard`.
3. ✅ `ClaimsService.requestAuthorization()` + `POST /claims/:nrZgl/request-authorization` — admin/pracownik, UUID v4 authorizationToken, email Maksim-у через Mailhog с React Email template. **Sub-slice 4.2 DONE.**
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
   - ✅ Таб «Autoryzacja» — Phase 4.2 wiring: RHF + `RequestAuthorizationSchema`, кнопка «Wymaga autoryzacji» дёргает `POST /claims/:nrZgl/request-authorization` → email Maksim-у через Mailhog. При статусе уже `OCZEKUJE_NA_AUTORYZACJE` — read-only summary. `decisionTargetsFor('NA_WERYFIKACJI')` в Edit-табе больше не предлагает этот статус (единственный путь — Autoryzacja-таб).
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

### Открытые мелочи (не блокеры)

- **Drill-down делает 2 round-trip** (login → cached fleet list → carrier-by-id). Если станет узким местом — расширить `/fleet/opiekun` опциональным `?login=...` filter-ом. Не блокер.
- **`OpiekunCarriersResponse` не consumed в UI** — wrapper + hook есть «на вырост» (например, для future sidebar/picker).
- **Counts semantics:** `OpiekunCarriersResponse.counts.vehicles` = active+non-deleted; `OpiekunFleetResponse.carriers[].vehicles.total` = all non-deleted. Intentional разница — sidebar показывает «operational fleet size», dashboard разбивает по active/inactive.
- **`GET /opiekun/carriers` не задокументирован** в `docs/13-api-design.md` (только `/fleet/opiekun` упомянут). Дополнить при следующей правке docs.

### Зависимости
- Фазы 2, 4 (компоненты CRUD).

---

## Фаза 6 — Planista, Dyspozytor (≈ 1 неделя)

**Цель:** read-only panels для спедиторов и диспетчеров.

### Backend

1. `GET /fleet/planista` — `getPlanistaFleet` (`Code.gs:3583`).
2. `GET /fleet/dyspozytor` — `getDyspozytorFleet` (`Code.gs:3676`).
3. `GET /delegations?dyspozytorId=...` — `getDelegacjeForDyspozytor` (`Code.gs:4033`).

### Frontend

1. `app/(planista)/fleet/page.tsx` — таблица закреплённых авто (фильтр AUTA по plannerId).
2. `app/(planista)/drivers/page.tsx` — read-only.
3. `app/(dyspozytor)/fleet/page.tsx`.
4. `app/(dyspozytor)/delegations/page.tsx` — выезды своих авто.

### Deliverables
- Planista видит только закреплённые за ним авто.
- Dyspozytor видит свои авто и их делегации.
- Никаких mutating actions для этих ролей.

### Зависимости
- Фазы 2, 4.

---

## Фаза 7 — Eksport, Weryfikator (≈ 1 неделя)

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

## Фаза 8 — Audit + полировка (≈ 1 неделя)

**Цель:** просмотр audit log, исправление мелких регрессий, отшлифовка UI.

### Backend

1. Audit log читалка: `GET /audit?targetType=...&targetKey=...&userId=...&from=...&to=...`.
2. Пагинация audit (cursor-based).
3. Spot-check: каждый mutating endpoint фактически пишет audit (тесты на самых критичных).
4. Финализация всех остальных endpoints, не покрытых ранее (если что-то осталось из [13-api-design.md](13-api-design.md)).

### Frontend

1. `app/(employee)/audit/page.tsx` — фильтры (по target, по user, по action, по дате) + таблица + детали записи.
2. Полировка существующих экранов:
   - Loading skeletons вместо голого `Loading...`.
   - Empty states с подсказками что делать (`<EmptyState>`).
   - Error toasts через sonner.
   - Keyboard shortcuts (Esc — close modal, Enter — submit).
3. Accessibility audit (axe DevTools): focus-traps в модалках, aria-labels, контраст.
4. Проверка dark mode на всех экранах.

### Deliverables
- Audit log полностью функционален.
- Все экраны выглядят отполировано в обеих темах.
- a11y нарушения < 5 (ideally 0) на ключевых экранах.

### Зависимости
- Фазы 4–7 (нужны mutating endpoints, чтобы было что читать в audit).

---

## Фаза 9 — Email, Cron, S3, OAuth (параллельно с Фазами 3–8)

**Цель:** все integrations работают как в проде. Это не отдельная phase в timeline-е — задачи распределяются по предыдущим фазам, но выделены отдельно для трекинга.

### Шаги

1. **Gmail API setup** (см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#email-через-gmail-api)).
2. **Все email-шаблоны** в React Email (`account-created`, `password-reset`, `login-code`, `carrier-decision`, `internal-decision`, `carrier-submitted`, `daily-reminder`, `weekly-report`, `authorization-request`).
3. **BullMQ queues:** `email-send`, `daily-reminders`, `weekly-report`, `token-cleanup`.
4. **S3 для screenshots** — в Фазе 4 уже подключено, здесь — финализация retention policy.
5. **Google OAuth** для внутренних — опционально, в конце.
6. **Uptime Kuma** на VPS — пинг `/health` и `/ready`, алерты в email/Telegram.
7. **Bull Board UI** на `/admin/queues` (admin only) для мониторинга.

### Deliverables
- Все email уходят через Gmail API.
- Все cron работают (можно проверить через `/admin/queues`).
- Screenshots сохраняются в S3 и видны через pre-signed URL.

### Зависимости
- Фаза 1 (для 2FA email).
- Фазы 3–4 (для бизнес-email).

---

## Фаза 10 — Launch (≈ 0.5–1 неделя)

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
- ✅ Postgres exposed только на VPS-loopback для databasus / DBeaver через SSH-туннель.
- ✅ Deploy Key (read-only SSH-ключ от GitHub) для `git pull` на VPS.
- ✅ GitHub Actions secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`.
- ✅ Seed (admin + 7 тестовых юзеров других ролей + 14 типов прицепов + app_config) выполнен.

Что **отличается** от staging и должно быть переделано/добавлено для прода — см. [18-launch-and-deployment.md#переход-staging--prod](18-launch-and-deployment.md#переход-staging--prod).

### Краткие шаги

1. VPS поднят (Hetzner CX32 или эквивалент), bootstrap-скрипт `infra/setup.sh` отрабатывает: установка Docker + Compose, `ufw`, `fail2ban`, `chronyd`, `rclone`, создание `proxy-net` external network. S3-bucket (Cloudflare R2 / Hetzner Object Storage) создан.
2. **Shared Caddy** запущен в `/opt/caddy/` (auto-HTTPS via Let's Encrypt, роутит несколько приложений на VPS по доменам).
3. CI/CD pipeline готов: GitHub Actions билдит multi-stage Docker images для api и web, пушит в `ghcr.io`, по ssh обновляет `.env` на VPS и делает `docker compose pull && up -d --no-deps api web`. Миграции `prisma migrate deploy` запускаются ДО подмены контейнеров. См. [18-launch-and-deployment.md#cicd](18-launch-and-deployment.md#cicd).
4. **Prod docker-compose стек** в `/opt/magguarantee/`: postgres + redis + api + web. Bind mounts для данных (`./data/postgres`, `./data/redis`). Postgres exposed только на `127.0.0.1:5432` для databasus через SSH-туннель.
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

> **Status:** PLANNED — спецификация зафиксирована с заказчиком 2026-05-25. Реализация после Phase 10 launch. Решение по роли одобряющего открыто (см. ниже).

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

#### Шаг C — Approval workflow для wyjazd

- При `POST /delegations` wyjazd создаётся в новом статусе `oczekuje_na_akceptacje` (НЕ сразу `zgloszony`).
- Одобряющий получает:
  - **Email** с краткой инфой о wyjazd и deeplink в приложение (`delegation-pending-approval.tsx`).
  - **In-app entry** в его dashboard / списке «Wyjazdy do akceptacji».
- Одобряющий открывает detail wyjazd и видит:
  - Все поля carrier-а (departureAt, plannedReturnAt, kierowca, naczepa, postal codes, comment).
  - Приписанных к этой машине `planista` и `dyspozytor` (из `Vehicle.plannerId` / `Vehicle.dispatcherId`).
  - **Может изменить** `planista` / `dyspozytor` именно для этого wyjazd — это **snapshot per-wyjazd**, а не глобальное переназначение на машине. Глобальные `Vehicle.plannerId`/`dispatcherId` остаются прежними (их меняет admin/opiekun).
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

### Роль одобряющего — открытый вопрос

| Вариант | Плюсы | Минусы |
|---|---|---|
| 1. `opiekun` | Уже знает carrier-а; минимум новых сущностей | Перегружает opiekun-а, у которого основной scope — CRUD carrier-ов |
| 2. `weryfikator` | Уже работает с wyjazd (`markInTransit`/`markReturned` в Phase 7); естественное расширение | Нет проверки «opiekun этого carrier-а» — нужен дополнительный guard если хотим scope-нуть |
| 3. Новая роль `akceptant_wyjazdow` | Clean separation; нагрузка на новое лицо, а не на существующее | +1 роль в матрице доступа (станет 9 ролей), +миграция, +новые seed-юзеры |

**Дефолтная рекомендация:** вариант 2 — расширить scope `weryfikator`. У него уже есть read-доступ ко всем wyjazd и mutate их статуса; акцепт логически встраивается в тот же flow. Решение фиксируется перед стартом Phase 11 после обсуждения с заказчиком.

### Влияние на существующие модели

| Модель | Изменение |
|---|---|
| `Delegation.status` enum | + `oczekuje_na_akceptacje`, + `odrzucony` |
| `Delegation` поля | + `plannerSnapshotId` (FK → User, nullable), + `dispatcherSnapshotId` (FK → User, nullable), + `approvedById` (FK → User, nullable), + `approvedAt`, + `rejectedById`, + `rejectedAt`, + `rejectionReason` (text) |
| `Claim` поля | + `delegationId` (FK → Delegation, **unique**, nullable для legacy) |
| `POST /delegations` (controller) | Меняет дефолтный возвращаемый status с `zgloszony` на `oczekuje_na_akceptacje` |
| Новый endpoint | `POST /delegations/:id/approve` — одобряющий, body `{ plannerSnapshotId?, dispatcherSnapshotId? }` (опциональная переоверрайдка) |
| Новый endpoint | `POST /delegations/:id/reject` — одобряющий, body `{ reason: string }` (required) |
| `POST /claims` (controller) | Принимает `delegationId` вместо `from`/`to` для **новых** wniosków |
| Carrier UI | Status-badge для новых статусов; cancel разрешён и в `oczekuje_na_akceptacje` тоже |
| Approver UI | Новая страница `/(weryfikator|...)/delegations/pending` со списком pending wyjazdy + approve/reject actions |

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

- **[ЗАФИКСИРОВАНО]** Wyjazd approval workflow + жёсткая связь wniosek ↔ wyjazd + блок прошлых дат — спецификация в [#фаза-11--wyjazd-approval-workflow-планируется-после-launch](#фаза-11--wyjazd-approval-workflow-планируется-после-launch) выше.
- Pagination/virtualization для очень длинных списков.
- Внутренний чат на каждое заявление (был в legacy, выпиливается, может вернуться позже как новая фича).
- Экспорт wniosków в PDF.
- Mobile приложение.
- API для интеграций с внешними системами (партнёрский ERP).
- Multi-language UI (PL → EN/DE).
- 2FA через TOTP-приложение или SMS.
- Self-service «История моих заявлений» с графиками для перевозчика.

Эти задачи можно оценивать отдельно — они уже не критичны для launch.
