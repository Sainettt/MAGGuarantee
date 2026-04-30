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

- **pracownik и admin делят 95% функциональности** — нет смысла делать их в разных фазах. Делаем вместе.
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
3. Seed: 14 типов прицепов (`TrailerType`), `app_config` записи.
4. Модуль `users`: `UsersService`, `UsersRepository` (Prisma wrapper), `UsersController` (admin CRUD).
5. Модуль `carriers`: то же самое + специфика — связь с User, opiekun ownership.
6. Модули `vehicles`, `drivers`, `trailers`, `trailer-types`: CRUD + soft-delete.
7. Guards:
   - `RolesGuard` из [15-auth-strategy.md](15-auth-strategy.md).
   - `OpiekunOwnershipGuard` для opiekun-эндпоинтов.
   - `CarrierOwnershipGuard` для carrier-эндпоинтов (свои авто/водители/прицепы).
8. Audit interceptor (минимальный): декоратор `@Audit('createCarrier')` пишет в `audit_log`.
9. Lookups endpoints (`/lookups/dyspozytor`, `/lookups/planisci`, `/lookups/opiekuni`, `/lookups/cert-types`).
10. Внешние интеграции: VIES, Biała Lista, info-car (см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#внешние-rest-интеграции)).
11. Unit tests: ownership guards, password hashing, репозитории.

### Frontend (минимальный, для UAT)

1. `app/(employee)/carriers/page.tsx`: таблица из `<DataTable>`, фильтр.
2. `app/(employee)/carriers/[id]/page.tsx`: деталь + редактирование (sheet/modal).
3. То же для vehicles, drivers, trailers, trailer-types.
4. Forms через React Hook Form + Zod (схемы из `@magguarantee/shared`).

### Deliverables
- Admin может через UI создать carrier-а, vehicle-а, driver-а, trailer-а.
- Все mutating-actions пишутся в `audit_log`.
- Импорт текущих 14 типов прицепов через seed (как было в `ensureNaczepyTypySheet`).
- Внешние интеграции работают (VIES для NIP в форме carrier-а, Biała Lista — для IBAN).

### Зависимости
- Фаза 1.

---

## Фаза 3 — Przewoznik (carrier) panel (≈ 2 недели)

**Цель:** перевозчик может полностью пользоваться приложением — подавать wnioski, видеть свои, управлять водителями/прицепами, регистрировать выезды.

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
5. Endpoint `/users/me/drivers`, `/me/trailers` — те же что `/drivers?carrierId=current`, alias.
6. **Тесты на km calc:** ≥30 fixtures, написанных вручную для покрытия краевых случаев (полный месяц, перекрытие, Easter, EU-banned дни, дробные дни). См. [17-migration-roadmap.md#тестирование-km-calc](#тестирование-km-calc) ниже.

### Shared

1. `packages/shared/domain/km-calc.ts` — портированная функция, **без** Nest/Next зависимостей (чистый TS). Импортируется и backend-ом, и frontend-ом.
2. Zod-схемы DTO в `packages/shared/schemas/claim.schema.ts`.

### Frontend

1. `app/(carrier)/layout.tsx`: header с RoleSwitcher, табы (My wnioski, Nowy, Flota, Wyjazdy).
2. `app/(carrier)/claims/page.tsx`: список wniosków (TanStack Query), фильтры по статусу/авто/поиск, дизайн `.claim-card`.
3. `app/(carrier)/claims/new/page.tsx`: большая форма с live-preview (debounced `POST /claims/.../preview` после каждого изменения).
4. `app/(carrier)/claims/[nrZgl]/page.tsx`: деталь + кнопка «Reklamacja» если статус позволяет.
5. `app/(carrier)/fleet/vehicles/page.tsx`: список своих авто (read-only — добавление через admin/opiekun).
6. `app/(carrier)/fleet/drivers/page.tsx`: CRUD водителей.
7. `app/(carrier)/fleet/trailers/page.tsx`: CRUD прицепов.
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

**Цель:** сотрудники MagTrans могут верифицировать wnioski, управлять автопарком всех перевозчиков, видеть dashboard.

### Backend

1. `ClaimsService.update()` — `updateClaimFull` (`Code.gs:5183`, 462 строки) → разбита на:
   - `_validateClaimUpdate()`
   - `_recalcClaim()` (через `KmCalcService`)
   - `_persistClaimUpdate()`
   - `_handleReklamacjaTransition()`
   - `_applyDecisionEmails()`
2. `PATCH /claims/:nrZgl` — только admin/pracownik, с `RolesGuard`.
3. `ClaimsService.requestAuthorization()` + `POST /claims/:nrZgl/request-authorization`.
4. `S3Module`: загрузка scrennshot-ов авторизации.
5. `POST /claims/:nrZgl/auth-screenshot` (multipart).
6. Endpoint `/diagnostics/dashboard` — `getDashboardStats` (`Code.gs:7000+`):
   - KPI counts: total claims, na weryfikacji, zaakceptowano, odrzucono.
   - Топ перевозчиков по выплатам.
   - Recent activity.
   - Урgent (NA_WERYFIKACJI > 3 days).
7. Endpoints для управления лимитами (`/limits` PUT).
8. Управление справочниками типов прицепов (`/trailer-types`).
9. **Audit-log запись для всех mutating actions** (`createCarrier`, `updateClaim`, `setLimits`, ...).

### Frontend

1. `app/(employee)/layout.tsx`: дизайн `#employeeScreen` — header + tabs/sidebar.
2. `app/(employee)/dashboard/page.tsx`:
   - `<KpiCard>` row.
   - `<DashboardSidebar>` с 5–6 секциями (Urgent, Recent, Monthly chart, Top carriers, Reklamacje, Top payouts).
   - Recharts для pie/bar.
3. `app/(employee)/claims/page.tsx`: таблица всех wniosków с фильтрами.
4. **`<ClaimVerificationModal>`** — главный модал верификации (текущий `#statusModal`):
   - Все поля редактируемы.
   - Live recalculation на каждое изменение.
   - История рекламации (если есть `OrigData`).
   - 3 кнопки: «Zaakceptuj», «Odrzuć», «Wymaga autoryzacji».
   - Upload screenshot для авторизации.
5. `app/(employee)/carriers/...` — полный CRUD (overlay из Фазы 2 → integrated).
6. `app/(employee)/vehicles/...`, `drivers/...`, `trailers/...`, `trailer-types/...`.
7. `app/(employee)/limits/page.tsx` — таблица помесячных лимитов с inline edit.
8. `app/(employee)/audit/page.tsx` — список аудит-записей с фильтрами.
9. `app/(employee)/diagnostics/page.tsx` (admin only).

### Deliverables
- Pracownik/admin может верифицировать wniosek end-to-end.
- Email карьеру с правильным цветным header (по `CONFIG.KOLORY` → теперь enum в shared).
- Email внутренним сотрудникам (planista, opiekun, lider) — отправляется.
- Dashboard показывает правильные числа (сверка с GAS на тех же данных).

### Зависимости
- Фазы 0–3.

---

## Фаза 5 — Opiekun panel (≈ 1 неделя)

**Цель:** опекун может управлять своими перевозчиками, видеть «Moja opieka» статистику.

### Backend

Большая часть уже сделана в Фазе 2 (CRUD с `OpiekunOwnershipGuard`). Здесь добавляем:

1. `GET /fleet/opiekun` — `getOpiekunFleet` (`Code.gs:2733`):
   - По каждому carrier-у: jezdzace, stojace, nieaktywne, potencjalne.
   - Один проход по всем vehicles (group by carrierId).
2. Endpoint `getOpiekunCarriers` — список своих perevoznikов.

### Frontend

1. `app/(employee)/opieka/page.tsx`: dashboard с per-carrier статистикой.
2. `app/(employee)/opieka/carriers/[login]/page.tsx`: деталь — сводка авто + drill-down.
3. RoleSwitcher: если у carrier-а есть alternate role `opiekun` — кнопка «Panel Opiekuna».

### Deliverables
- Opiekun видит только свои перевозчики.
- Все mutating actions проходят через `OpiekunOwnershipGuard` — попытка править чужого карьера = 403.
- Audit-log пишется с `userRole=opiekun`.

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
   - Корректировка часов (`hoursAdjusted`).
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

- Pagination/virtualization для очень длинных списков.
- Внутренний чат на каждое заявление (был в legacy, выпиливается, может вернуться позже как новая фича).
- Экспорт wniosków в PDF.
- Mobile приложение.
- API для интеграций с внешними системами (партнёрский ERP).
- Multi-language UI (PL → EN/DE).
- 2FA через TOTP-приложение или SMS.
- Self-service «История моих заявлений» с графиками для перевозчика.

Эти задачи можно оценивать отдельно — они уже не критичны для launch.
