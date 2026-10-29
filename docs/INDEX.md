# Документация проекта MAGGuarantee

Система управления гарантией километража для логистической компании.

## Контекст

`Code.gs` + `index.html` — это **незавершённая разработка** на Google Apps Script от другого человека. Она **никогда не была в проде**, все данные в Google Sheets — **фейковые**.

**Цель:** написать с нуля полноценное приложение на современном стеке (NestJS + PostgreSQL + Next.js + Tailwind) в отдельной папке `magguarantee-app/`. `Code.gs` и `index.html` — это **функциональный референс** при необходимости (если что-то непонятно про бизнес-flow или дизайн), но **не код для портирования**.

> ❌ Чат на каждое заявление — выпиливается. Не нужен.
>
> ❌ Миграция данных не нужна — данные фейковые. Стартуем с пустой БД + seed.

## Состав репозитория

| Файл / папка | Описание |
|---|---|
| `Code.gs` | GAS-backend, ~7 482 строки — функциональный референс при необходимости |
| `index.html` | GAS-frontend, ~10 584 строк — функциональный референс (CSS строки 8–502) |
| `docs/` | Эта документация |
| `magguarantee-app/` (будет создана) | Новое приложение — монорепо (NestJS + Next.js + Postgres) |

## Структура документации

### Domain reference (что нужно реализовать в новом приложении)

Бизнес-логика и предметная область — без привязки к технологиям. Это и есть «логика отношений между сущностями» для опоры при разработке.

| # | Файл | Тема |
|---|------|------|
| 1 | [01-overview.md](01-overview.md) | Что делает система: бизнес-процессы, формула km-calc |
| 3 | [03-roles.md](03-roles.md) | 8 ролей и матрица доступа |
| 4 | [04-data-model.md](04-data-model.md) | Сущности и их отношения |

### Implementation guide (как реализуем)

| # | Файл | Тема |
|---|------|------|
| 10 | [10-target-architecture.md](10-target-architecture.md) | **Целевая архитектура:** стек, слои, не-цели |
| 11 | [11-folder-structure.md](11-folder-structure.md) | Структура монорепо `magguarantee-app/` |
| 12 | [12-database-schema.md](12-database-schema.md) | Prisma schema (Postgres) |
| 13 | [13-api-design.md](13-api-design.md) | REST API endpoints |
| 14 | [14-design-system.md](14-design-system.md) | **Дизайн:** токены из CSS `index.html:8–502`, Tailwind, компоненты |
| 15 | [15-auth-strategy.md](15-auth-strategy.md) | JWT + 2FA + OAuth + Roles + Guards |
| 16 | [16-jobs-and-integrations.md](16-jobs-and-integrations.md) | BullMQ cron, Gmail API, S3, VIES, Biała Lista, GPS tracker |
| 17 | [17-migration-roadmap.md](17-migration-roadmap.md) | **Поэтапный план разработки** (10 фаз) |
| 18 | [18-launch-and-deployment.md](18-launch-and-deployment.md) | Launch: prod-окружение, CI/CD, seed, мониторинг |
| 19 | [19-known-quirks.md](19-known-quirks.md) | **Known quirks** — load-bearing reference: legacy quirks, business rules, foot-guns. Read BEFORE implementing claims-flow / vehicle-CRUD / delegations / authorization. |
| 20 | [20-phase-7-eksport-weryfikator.md](20-phase-7-eksport-weryfikator.md) | **Phase 7 импл-спека** — роли `eksport` + `weryfikator` (статус выездов, `lastDroveAt`). Scope частично неясен → делаем как в легаси. |
| 21 | [21-pracownik-verification-sla.md](21-pracownik-verification-sla.md) | **SLA верификации wniosków** — 7 польских рабочих дней от входа в `NA_WERYFIKACJI`, бакеты `overdue` / `dueSoon` на дашборде pracownika, дайджест-крон 07:00. |
| 22 | [22-email-design.md](22-email-design.md) | **Email design system** — единый table-based шаблон транзакционных писем (палитра `#E02020`, блоки, статус-бейджи, `MAIL_LOGO_URL`). |
| 23 | [23-prod-deployment-runbook.md](23-prod-deployment-runbook.md) | **Runbook выката в прод** — пошагово с нуля: домен, GCP, bootstrap VPS, Caddy, `.env`, миграции, сид, бэкапы, CI/CD, приёмка. Проверен репетицией 2026-07-29. |
| 24 | [24-sso-magspace-and-permissions-plan.md](24-sso-magspace-and-permissions-plan.md) | **Трек A реализован (2026-09-09).** Google SSO для сотрудников, MAGSpace как справочник (одно stanowisko → роль через admin-маппинг, JIT-provisioning, pull-reconcile), admin только локально, пароль остаётся запасным. §9 — шесть расхождений реализации с планом, §10 — итоговый маппинг 17 должностей и почему `pracownik`/`weryfikator`/`eksport` выдаются вручную. Трек B (слой permissions) — реализован, см. doc 25. |
| 25 | [25-permissions-layer-plan.md](25-permissions-layer-plan.md) | **Трек B — слой permissions, реализован 2026-10-23…27.** Каталог из 45 прав в shared, `@RequirePermission` + `PermissionsGuard` (запрет по умолчанию), `can()` в сервисах, web по правам, три фикстуры authz; B6 — точечные права пользователю (`extraPermissions` / `deniedPermissions`, первый случай: документы перевозчика). Модель — docs/15 §Roles & Guards; этот документ — план и журнал решений. |
| 26 | [26-preprod-on-staging.md](26-preprod-on-staging.md) | **Pre-prod на staging (2026-09-15).** Пока prod-сервера нет, OVH-staging работает как боевой: инвентаризация, решения, чистый старт на прод-компоузе, `.env`, GitHub, бэкапы, приёмка; перенос базы и MinIO на prod (C-00…C-13) и зачистка. |
| 27 | [27-preprod-parity-ledger.md](27-preprod-parity-ledger.md) | **Журнал паритета staging ↔ prod** — живой: что сделано (только подтверждённое), что повторить на prod, `.env`/GitHub/внешние сервисы. Ведёт `preprod-parity-agent`. Секретов не содержит. |
| 28 | [28-lider-roles-plan.md](28-lider-roles-plan.md) | **Роли-лидеры (`lider_*`) — реализовано 2026-09-25.** Лидер — не новое значение `Role`, а флаг `User.lider` над `planista`/`dyspozytor`/`opiekun`/`pracownik`/`eksport`; откуда берётся (маппинг stanowiska или admin, те же правила, что у `role`), как встраивается в B1/B2/B6 трека B, что не делаем, открытые вопросы перед фичей передачи машин. §9 — отступления реализации (строгий `?lider=`, семантика `PUT` маппинга, 422 из pipe, правила `PATCH /users`, web). Поведение системы теперь описывают docs/03 §«Лидеры» и docs/13. |
| 29 | [29-vehicle-planner-transfer-plan.md](29-vehicle-planner-transfer-plan.md) | **Передача машины другому планисте — реализовано 2026-09-28** (на pre-prod ещё не выкачено). Прямая смена `plannerId` запрещена всем; заявку подают opiekun или текущий планиста, решают admin или лидер текущего планисты (`User.liderId` вместо `liderEmail`). Выезд помнит планисту своего периода, журнал назначений по машине, уведомлений нет. Модель данных, API, UI, порядок работ по агентам, конфликты с docs/03/13/28. |

## Быстрая навигация по ролям

- **Перевозчик (przewoznik)** → [03-roles.md#перевозчик](03-roles.md#przewoznik)
- **Опекун (opiekun)** → [03-roles.md#опекун](03-roles.md#opiekun)
- **Планиста (planista)** → [03-roles.md#планиста](03-roles.md#planista)
- **Диспетчер (dyspozytor)** → [03-roles.md#диспетчер](03-roles.md#dyspozytor)
- **Работник/Админ (pracownik/admin)** → [03-roles.md#работник](03-roles.md#pracownik)
- **Эксперт экспорта / Верификатор** → [03-roles.md#специальные](03-roles.md#специальные-роли)

## Как читать документы

### Если ты только пришёл в проект
1. [01-overview.md](01-overview.md) — что вообще делает система.
2. [03-roles.md](03-roles.md) — кто использует.
3. [04-data-model.md](04-data-model.md) — какие сущности и как связаны.
4. [10-target-architecture.md](10-target-architecture.md) — стек.
5. [17-migration-roadmap.md](17-migration-roadmap.md) — план работы.

### Если ты начинаешь имплементацию
1. [10-target-architecture.md](10-target-architecture.md) — общая картина.
2. [11-folder-structure.md](11-folder-structure.md) — где что лежит.
3. [12-database-schema.md](12-database-schema.md) — модели.
4. [13-api-design.md](13-api-design.md) — endpoints.
5. Конкретная фаза в [17-migration-roadmap.md](17-migration-roadmap.md).

### Если ты делаешь UI
1. [14-design-system.md](14-design-system.md) — токены и компоненты.
2. Открыть `index.html` локально в браузере — посмотреть как выглядит.
3. Скриншоты `docs/screenshots/` (если сделаны).

### Если ты делаешь auth
1. [15-auth-strategy.md](15-auth-strategy.md) — JWT + 2FA + Guards + Google SSO.
2. [24-sso-magspace-and-permissions-plan.md](24-sso-magspace-and-permissions-plan.md) §9–§10 — почему SSO устроен именно так и как маппятся должности.
3. Контракт справочника со стороны MAGSpace — `MAGSpace/docs/07-directory-api.md`.

### Если ты делаешь email-шаблоны
1. [22-email-design.md](22-email-design.md) — единый шаблон, токены, блоки, статус-бейджи.
2. Код: `magguarantee-app/apps/api/src/modules/mail/templates/` (`_theme.ts` + `MailLayout.tsx` + шаблоны).

### Если ты готовишь launch
1. [18-launch-and-deployment.md](18-launch-and-deployment.md) — prod чек-лист.
2. [12-database-schema.md](12-database-schema.md) — seed.

## Стек коротко

**Backend:** Node 20 + TypeScript + NestJS + Prisma + PostgreSQL + Redis + BullMQ + Nodemailer/Gmail API + JWT + Passport.

**Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Hook Form + Zod + next-intl (PL default + EN, cookie-based).

**Инфра:** npm workspaces (без Turborepo) + Docker (всё контейнеризовано — api, web, Postgres, Redis в одном compose-стеке) + GitHub Container Registry для образов + GitHub Actions CI/CD + один VPS с **Caddy** как shared reverse-proxy (auto-HTTPS, multi-app роутинг по доменам) + Uptime Kuma для health-check.

Подробности — [10-target-architecture.md](10-target-architecture.md).

## Ключевые принципы

1. Пишем с нуля. `Code.gs`/`index.html` — только справка при сомнениях.
2. Функциональная идентичность с тем, что задумано в legacy — главное, чтобы flow работал.
3. Вертикальные слайсы (роль за ролью), не горизонтальные.
4. `calcKmGwarant` (порт `calcKmGwarantPerMonth`, по неделям ISO) — обязательные тесты на ≥30 краевых случаев.
5. Чат — выпиливается полностью.
6. Никаких миграций данных, никакого parallel-running.
