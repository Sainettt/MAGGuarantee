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
1. [15-auth-strategy.md](15-auth-strategy.md) — JWT + 2FA + Guards.

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
4. `calcKmGwarantPerMonth` — обязательные тесты на ≥30 краевых случаев.
5. Чат — выпиливается полностью.
6. Никаких миграций данных, никакого parallel-running.
