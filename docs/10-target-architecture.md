# 10. Целевая архитектура

> Пишем приложение с нуля на современном стеке в отдельной папке. `Code.gs` + `index.html` — функциональный референс (что делать, как считать, как выглядеть), но не код для портирования. Они никогда не были в проде, данных там нет.

## Решение: монорепо в отдельной папке

```
MagTrans/                              ← корень репозитория
├── Code.gs                            ← функциональный референс (заморожен)
├── index.html                         ← функциональный референс (заморожен)
├── docs/                              ← документация
└── magguarantee-app/                      ← ★ НОВОЕ ПРИЛОЖЕНИЕ
    ├── apps/
    │   ├── api/                       ─── NestJS backend
    │   └── web/                       ─── Next.js frontend
    ├── packages/
    │   ├── database/                  ─── Prisma schema + migrations + client
    │   ├── shared/                    ─── общие типы, валидаторы, бизнес-расчёты
    │   └── ui/                        ─── (опц.) shadcn-компоненты
    ├── docker-compose.yml             ─── Postgres + Redis для dev
    ├── package.json                   ─── корневой, с "workspaces": ["apps/*", "packages/*"]
    └── turbo.json
```

Имя папки `magtrans-app` — рабочее, можно заменить (`v2`, `next`, `app`). Главное — один уровень с `Code.gs`, чтобы было ясно где старое, где новое.

## Стек

### Backend — `apps/api`

| Компонент | Выбор | Зачем |
|---|---|---|
| Runtime | Node.js 20 LTS + TypeScript 5 | Современный, типизированный, долгоживущий LTS |
| Framework | **NestJS 10** | Декораторы, DI, модули, guards/interceptors — 1:1 ложится на наши слои |
| ORM | **Prisma 5** | Типобезопасные запросы, автогенерация миграций, простой DX |
| База | **PostgreSQL 16** | Реляционная целостность, JSON-поля для гибкости, mature |
| Очередь / cache | **Redis 7** + BullMQ | 2FA-коды (TTL), фоновые задачи (email, отчёты) |
| Auth | **Passport** + `@nestjs/jwt` + `passport-google-oauth20` | JWT access/refresh + Google OAuth (опц.) + 2FA по email |
| Email | **Nodemailer + Gmail API** (через service account) | Нативно поддерживает thread (replyTo + In-Reply-To) |
| Валидация | **class-validator** + **class-transformer** + **Zod** (для shared) | DTO + автоматический pipe в Nest |
| Логи | **Pino** + pino-http | Структурные JSON-логи, быстрые |
| Тесты | **Jest** + **Supertest** | Unit + e2e на расчёты |
| Конфигурация | **@nestjs/config** + Zod-схема | Валидация ENV на старте |

### Frontend — `apps/web`

| Компонент | Выбор | Зачем |
|---|---|---|
| Framework | **Next.js 15** (App Router) | RSC, file-based routing, layouts по ролям |
| Стили | **Tailwind CSS 4** + CSS variables | Соответствует текущему подходу (CSS vars), быстрая адаптация дизайна |
| UI-компоненты | **shadcn/ui** + **Radix** | Доступные, без vendor-lock, мы владеем кодом |
| State (server) | **TanStack Query 5** | Кеширование, background refetch, оптимистичные апдейты |
| State (client) | **Zustand** | Только для UI-state (modals, темы); серверные данные — Query |
| Формы | **React Hook Form** + **Zod resolver** | Перформанс, типобезопасность, валидация общая с backend |
| HTTP | **fetch** + thin wrapper (с интерцептором refresh-токена) | Нативно, без axios |
| Иконки | **Lucide React** | Современная замена эмодзи в текущем UI |
| Уведомления | **sonner** | Toast-replacement для `showAlert` |
| Графики | **Recharts** | Замена самописных pie/bar в dashboard |
| Тесты | **Playwright** (e2e) + **Vitest** (unit) | Smoke-тесты ключевых flow |

### Инфра / DevOps

| Компонент | Выбор |
|---|---|
| Менеджер монорепо | **npm workspaces** + **Turborepo** (build cache, task graph). npm выбран намеренно вместо pnpm — проще работа с Docker (нет content-addressable store / симлинков, образ собирается без `pnpm install` бинарника, `npm ci` встроен в Node) |
| CI | GitHub Actions (lint + test + typecheck + build на PR) |
| Контейнеризация | Docker (multi-stage), `docker-compose.yml` для локалки |
| Деплой | Один VPS (Hetzner CX32 ≈ €7/мес или аналог): nginx (reverse-proxy) + systemd для api и web + Postgres + Redis на той же машине. Single point of failure осознанно — нагрузка 15–20 одновременных пользователей в пике, бизнес принял риск. |
| Reverse-proxy / SSL | nginx (или Caddy для авто-Let's Encrypt) + certbot. Сертификаты обновляются systemd-таймером. |
| Хранилище файлов | S3-совместимое (для `uploadAuthScreenshot`) — Cloudflare R2 / Hetzner Object Storage. Локально на диске VPS не храним — нужен offsite-бэкап. |
| Мониторинг | Self-hosted на том же VPS: Uptime Kuma (uptime + алерты в email/Telegram) + journalctl + logrotate. Pino пишет в stdout, systemd собирает. Прометей/Графана — позже, если понадобится. |

## Слои backend (Nest)

```
┌─────────────────────────────────────────────────────────────┐
│                Browser (Next.js apps/web)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / fetch (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   apps/api (NestJS)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Controllers (REST endpoints)                        │   │
│  │   @Controller('claims') @UseGuards(JwtGuard,RoleGuard)   │
│  │   @Get(), @Post(), @Patch() — тонкие обёртки         │   │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guards / Interceptors                               │   │
│  │   JwtGuard, RolesGuard, OwnershipGuard, AuditInterc. │   │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Services (business logic)                           │   │
│  │   ClaimsService, KmCalcService, CarriersService,     │   │
│  │   WorkflowService — 1:1 с GAS-services               │   │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Repositories (Prisma)                               │   │
│  │   carriersRepository.findByLogin(), и т.д.           │   │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Infrastructure                                      │   │
│  │   MailModule (Gmail API), QueueModule (BullMQ),      │   │
│  │   IntegrationsModule (VIES, Biała Lista),            │   │
│  │   StorageModule (S3 для screenshots)                 │   │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────────┐
       ▼                   ▼                       ▼
┌──────────────┐    ┌──────────────┐      ┌────────────────┐
│  PostgreSQL  │    │ Redis        │      │ Внешние REST   │
│  (Prisma)    │    │ (BullMQ,2FA) │      │  • VIES        │
└──────────────┘    └──────────────┘      │  • Biała Lista │
                                          │  • Gmail API   │
                                          │  • S3          │
                                          └────────────────┘
```

## Маппинг слоёв GAS → Nest

| GAS (текущее) | Nest (новое) |
|---|---|
| `validateCaller`, `requireAdmin` | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin')` |
| `_requireOpiekun`, `_opiekunOwnsCarrier` | `OwnershipGuard` + декоратор `@OpiekunOwns('carrierLogin')` |
| `_parseCarrierRow`, `_parseAutoRow` | Prisma model + автомаппинг |
| `_writeAuditLog` | `AuditInterceptor` (декларативный через `@Audit('createCarrier')`) |
| `_sendThreadedEmail` | `MailService.sendThreaded({ to, subject, html, threadKey })` |
| `LockService` | `pg_advisory_lock` или Redis-лок (Redlock) |
| `CacheService` (login codes) | Redis с TTL |
| `submitNewClaim` (291 строк) | `ClaimsService.submit()` + разбит на private методы (validate, calc, persist, notify) |
| `updateClaimFull` (462 строки) | Аналогично |
| `setupTriggers` + `sendDailyReminders` | BullMQ scheduled jobs |
| Магические индексы `row[18]` | Prisma — поля по имени |

## Маппинг слоёв `index.html` → Next.js

| `index.html` (текущее) | Next.js (новое) |
|---|---|
| `#loginScreen` | `app/(public)/login/page.tsx` |
| `#carrierScreen` | `app/(carrier)/page.tsx` + табы как сегменты |
| `#planistaScreen` | `app/(planista)/page.tsx` |
| `#dyspozytorScreen` | `app/(dyspozytor)/page.tsx` |
| `#employeeScreen` (admin/pracownik) | `app/(employee)/...` секция |
| `#weryfikatorScreen` | `app/(weryfikator)/page.tsx` |
| `#eksportScreen` | `app/(eksport)/page.tsx` |
| 18 модалов | shadcn `<Dialog>` + локальный state per route |
| `currentUser` глобал | `useAuth()` hook + cookie session |
| `google.script.run.X` | TanStack Query: `useQuery` / `useMutation` |
| 1 375 inline `style=` | Tailwind utility classes |
| 300+ `onclick=` | React event handlers |
| Глобальные `var` | React state / Zustand |
| `escHtml` | Реакт сам экранирует, не нужно |
| 150 строк dark-mode override | `class="dark"` + Tailwind `dark:` или CSS-vars (см. `14-design-system.md`) |

## Что повторяем, что выкидываем

### Повторяем (функциональная идентичность)
- Все бизнес-расчёты: `calcKmGwarantPerMonth`, `calcEasterGS`, `getEUBanDaysGS`, `calcBusinessDays`.
- Все публичные API-функции (см. `13-api-design.md`).
- Все email-шаблоны (HTML переписать на React Email).
- Внешние интеграции: VIES, Biała Lista MF, info-car.pl.
- Дизайн (цвета, типографика, компоненты — см. `14-design-system.md`).
- Бизнес-правила доступа по ролям (`03-roles.md` остаётся актуален).

### Выкидываем (даже если есть в `Code.gs`)
- **Чат на каждое заявление** (`#chatFloatingPopup`, `sendChatMessage` и связанные) — функция не нужна.
- Дубли `addX` / `addXByOpiekun` — единый сервис + guard на ownership.
- Plain-text пароли — bcrypt + bonus: переход на email-only login (только 2FA код).
- Hardcoded constants — в `app_config` таблицу + `.env`.
- Inline стили / onclick — Tailwind + React.
- Дублирование расчётов client/server — общий пакет `packages/shared`.
- Лист `OPIEKUNOWIE` (legacy дубль `OPIEKUN`) — одна модель `User` с `role=opiekun`.
- Лист `GWARANCJA` (legacy) — не реализуем.
- Различные форматы ответов (`{error}`, `{success}`, `{ok}`) — единый: статус-код + JSON `{data}` или RFC 7807 problem-details для ошибок.

## Принципы

1. **Функциональная идентичность, а не побитовая** — должно делать то же, что задумано в `Code.gs`, но не обязано повторять кодовые баги.
2. **Контракт-first** — сначала Zod-схема DTO в `packages/shared`, потом backend (использует ту же схему через `ZodValidationPipe`), потом frontend (тот же `infer` из Zod). Один источник правды, без OpenAPI-промежутки.
3. **One feature, one PR** — разработка вертикальными слайсами (auth → carrier → claims → ...). См. `17-migration-roadmap.md`.
4. **Никакого parallel-running.** Старый GAS-код не работает в проде, не имеет реальных данных — нет dual-write, нет feature flags для постепенного rollout.
5. **Тесты на расчёты обязательны** — `calcKmGwarantPerMonth` тестируется на ≥30 fixtures (написанных вручную, т.к. реальных wniosков нет). См. `17-migration-roadmap.md#тестирование-km-calc`.

## Не-цели на этом этапе

- Не делаем чат (см. выше).
- Не делаем мобильное приложение.
- Не делаем real-time (WebSockets) — нет необходимости.
- Не делаем мультитенантность — один MagTrans, один namespace.
- Не делаем i18n инфраструктуру с переключателем языков (UI остаётся на польском). Тексты выносим в один файл `pl.json`, чтобы потом было легко добавить — но переключатель не делаем.
- Не делаем SSR-рендеринг таблиц с данными (всё CSR через TanStack Query). SSR оставляем для public страниц (login).

## Связь с остальными документами

| Документ | Что описывает |
|---|---|
| [11-folder-structure.md](11-folder-structure.md) | Полное дерево монорепо |
| [12-database-schema.md](12-database-schema.md) | Prisma schema + маппинг с Google Sheets |
| [13-api-design.md](13-api-design.md) | REST endpoints, маппинг с GAS-функциями |
| [14-design-system.md](14-design-system.md) | Дизайн-токены, Tailwind config, компоненты |
| [15-auth-strategy.md](15-auth-strategy.md) | JWT + 2FA + OAuth + RBAC |
| [16-jobs-and-integrations.md](16-jobs-and-integrations.md) | Cron, email, внешние API |
| [17-migration-roadmap.md](17-migration-roadmap.md) | Поэтапный план разработки |
| [18-launch-and-deployment.md](18-launch-and-deployment.md) | Launch: prod-окружение, CI/CD, seed, мониторинг |
