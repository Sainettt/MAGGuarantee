# 11. Структура монорепо

## Полное дерево

```
MAGGuarantee/
├── Code.gs                       # функциональный референс (никогда не был в проде)
├── index.html                    # функциональный референс
├── docs/                         # документация миграции
└── magguarantee-app/                 # ★ НОВОЕ ПРИЛОЖЕНИЕ (монорепо)
    │
    ├── apps/
    │   ├── api/                  # NestJS backend
    │   │   ├── src/
    │   │   │   ├── main.ts                     ← bootstrap (Pino, Helmet, CORS)
    │   │   │   ├── app.module.ts               ← корневой модуль
    │   │   │   ├── common/
    │   │   │   │   ├── decorators/
    │   │   │   │   │   ├── current-user.decorator.ts
    │   │   │   │   │   ├── roles.decorator.ts
    │   │   │   │   │   ├── audit.decorator.ts
    │   │   │   │   │   └── public.decorator.ts
    │   │   │   │   ├── guards/
    │   │   │   │   │   ├── jwt-auth.guard.ts
    │   │   │   │   │   ├── roles.guard.ts
    │   │   │   │   │   └── ownership.guard.ts
    │   │   │   │   ├── interceptors/
    │   │   │   │   │   ├── audit.interceptor.ts
    │   │   │   │   │   └── transform.interceptor.ts
    │   │   │   │   ├── filters/
    │   │   │   │   │   └── http-exception.filter.ts  ← RFC 7807
    │   │   │   │   ├── pipes/
    │   │   │   │   │   └── zod-validation.pipe.ts
    │   │   │   │   └── types/
    │   │   │   │       └── express.d.ts        ← Request.user
    │   │   │   │
    │   │   │   ├── config/
    │   │   │   │   ├── env.schema.ts           ← Zod-валидация ENV
    │   │   │   │   ├── database.config.ts
    │   │   │   │   ├── auth.config.ts
    │   │   │   │   └── mail.config.ts
    │   │   │   │
    │   │   │   ├── modules/
    │   │   │   │   │
    │   │   │   │   ├── auth/                   ← login, 2FA, JWT, OAuth
    │   │   │   │   │   ├── auth.module.ts
    │   │   │   │   │   ├── auth.controller.ts
    │   │   │   │   │   ├── auth.service.ts
    │   │   │   │   │   ├── strategies/
    │   │   │   │   │   │   ├── jwt.strategy.ts
    │   │   │   │   │   │   ├── jwt-refresh.strategy.ts
    │   │   │   │   │   │   └── google.strategy.ts (опц.)
    │   │   │   │   │   ├── two-factor.service.ts
    │   │   │   │   │   ├── password.service.ts (bcrypt)
    │   │   │   │   │   └── dto/
    │   │   │   │   │       ├── login.dto.ts
    │   │   │   │   │       ├── verify-code.dto.ts
    │   │   │   │   │       └── refresh.dto.ts
    │   │   │   │   │
    │   │   │   │   ├── users/                  ← все 8 ролей в одной сущности User
    │   │   │   │   │   ├── users.module.ts
    │   │   │   │   │   ├── users.service.ts
    │   │   │   │   │   ├── users.repository.ts
    │   │   │   │   │   └── users.controller.ts (admin: list/get)
    │   │   │   │   │
    │   │   │   │   ├── carriers/               ← UZYTKOWNICY (przewoznik)
    │   │   │   │   │   ├── carriers.module.ts
    │   │   │   │   │   ├── carriers.controller.ts
    │   │   │   │   │   ├── carriers.service.ts
    │   │   │   │   │   ├── carriers.repository.ts
    │   │   │   │   │   └── dto/ ...
    │   │   │   │   │
    │   │   │   │   ├── vehicles/               ← AUTA
    │   │   │   │   ├── drivers/                ← KIEROWCY
    │   │   │   │   ├── trailers/               ← NACZEPY
    │   │   │   │   ├── trailer-types/          ← NACZEPY_TYPY (справочник)
    │   │   │   │   │
    │   │   │   │   ├── claims/                 ← WNIOSEK
    │   │   │   │   │   ├── claims.module.ts
    │   │   │   │   │   ├── claims.controller.ts
    │   │   │   │   │   ├── claims.service.ts
    │   │   │   │   │   ├── claims.repository.ts
    │   │   │   │   │   ├── km-calc.service.ts  ← calcKmGwarantPerMonth
    │   │   │   │   │   ├── eu-calendar.service.ts ← calcEaster, getEUBanDays
    │   │   │   │   │   ├── claim-workflow.service.ts ← submit/update/reklamacja
    │   │   │   │   │   ├── nr-zgl.service.ts   ← генерация GWA/NNN/MM/RR (Redis-lock)
    │   │   │   │   │   └── dto/
    │   │   │   │   │
    │   │   │   │   ├── delegations/            ← DELEGACJE (выезды)
    │   │   │   │   │
    │   │   │   │   ├── audit/                  ← AUDIT_LOG
    │   │   │   │   │   ├── audit.module.ts
    │   │   │   │   │   ├── audit.service.ts
    │   │   │   │   │   └── audit.repository.ts
    │   │   │   │   │
    │   │   │   │   ├── limits/                 ← LIMITY KM
    │   │   │   │   │
    │   │   │   │   ├── app-config/             ← вместо CONFIG-объекта
    │   │   │   │   │
    │   │   │   │   ├── mail/                   ← Gmail API + threading
    │   │   │   │   │   ├── mail.module.ts
    │   │   │   │   │   ├── mail.service.ts
    │   │   │   │   │   ├── templates/
    │   │   │   │   │   │   ├── account-created.tsx (React Email)
    │   │   │   │   │   │   ├── carrier-decision.tsx
    │   │   │   │   │   │   └── ...
    │   │   │   │   │   └── thread-key.util.ts
    │   │   │   │   │
    │   │   │   │   ├── integrations/           ← VIES, Biała Lista, info-car
    │   │   │   │   │   ├── vies/
    │   │   │   │   │   ├── white-list/
    │   │   │   │   │   └── inspection/
    │   │   │   │   │
    │   │   │   │   ├── storage/                ← S3 для скриншотов авторизации
    │   │   │   │   │
    │   │   │   │   ├── jobs/                   ← BullMQ workers
    │   │   │   │   │   ├── jobs.module.ts
    │   │   │   │   │   ├── daily-reminders.processor.ts
    │   │   │   │   │   ├── weekly-report.processor.ts
    │   │   │   │   │   ├── token-cleanup.processor.ts
    │   │   │   │   │   └── email-send.processor.ts
    │   │   │   │   │
    │   │   │   │   └── health/                 ← /health, /ready
    │   │   │   │
    │   │   │   └── prisma/
    │   │   │       ├── prisma.module.ts
    │   │   │       └── prisma.service.ts       ← extended client (soft-delete и пр.)
    │   │   │
    │   │   ├── test/                           ← e2e тесты
    │   │   │   ├── auth.e2e-spec.ts
    │   │   │   ├── claims.e2e-spec.ts
    │   │   │   └── km-calc.e2e-spec.ts
    │   │   ├── nest-cli.json
    │   │   ├── tsconfig.json
    │   │   └── package.json
    │   │
    │   └── web/                                # Next.js frontend
    │       ├── app/
    │       │   ├── (public)/
    │       │   │   ├── login/
    │       │   │   │   ├── page.tsx            ← логин с email/pwd
    │       │   │   │   └── verify/page.tsx     ← ввод 2FA-кода
    │       │   │   └── layout.tsx
    │       │   │
    │       │   ├── (carrier)/                  ← przewoznik
    │       │   │   ├── layout.tsx              ← header + role guard
    │       │   │   ├── page.tsx                ← redirect на /claims
    │       │   │   ├── claims/
    │       │   │   │   ├── page.tsx            ← список своих wniosków
    │       │   │   │   ├── new/page.tsx        ← форма нового wniosku
    │       │   │   │   └── [nrZgl]/page.tsx    ← деталь + рекламация
    │       │   │   ├── fleet/
    │       │   │   │   ├── vehicles/
    │       │   │   │   ├── drivers/
    │       │   │   │   └── trailers/
    │       │   │   └── delegations/
    │       │   │       ├── page.tsx
    │       │   │       └── new/page.tsx
    │       │   │
    │       │   ├── (employee)/                 ← admin / pracownik / opiekun
    │       │   │   ├── layout.tsx
    │       │   │   ├── dashboard/page.tsx      ← KPI + графики
    │       │   │   ├── claims/
    │       │   │   │   ├── page.tsx            ← все wnioski с фильтрами
    │       │   │   │   └── [nrZgl]/page.tsx    ← модал верификации (полноэкранный)
    │       │   │   ├── carriers/
    │       │   │   ├── vehicles/
    │       │   │   ├── drivers/
    │       │   │   ├── trailers/
    │       │   │   ├── trailer-types/
    │       │   │   ├── opieka/                 ← раздел opiekun
    │       │   │   │   ├── page.tsx            ← статы по своим перевозчикам
    │       │   │   │   └── carriers/[login]/   ← детали перевозчика
    │       │   │   ├── limits/
    │       │   │   ├── audit/
    │       │   │   └── diagnostics/            ← admin only
    │       │   │
    │       │   ├── (planista)/
    │       │   │   ├── layout.tsx
    │       │   │   ├── fleet/page.tsx          ← закреплённые авто
    │       │   │   └── drivers/page.tsx
    │       │   │
    │       │   ├── (dyspozytor)/
    │       │   │   ├── layout.tsx
    │       │   │   ├── fleet/page.tsx
    │       │   │   └── delegations/page.tsx
    │       │   │
    │       │   ├── (eksport)/
    │       │   │   ├── layout.tsx
    │       │   │   └── delegations/page.tsx
    │       │   │
    │       │   ├── (weryfikator)/
    │       │   │   ├── layout.tsx
    │       │   │   └── delegations/page.tsx
    │       │   │
    │       │   ├── api/                        ← Next.js Route Handlers (auth proxy, file uploads)
    │       │   │   ├── auth/
    │       │   │   │   ├── refresh/route.ts
    │       │   │   │   └── logout/route.ts
    │       │   │   └── upload/screenshot/route.ts
    │       │   │
    │       │   ├── globals.css                 ← Tailwind + CSS variables
    │       │   ├── layout.tsx                  ← root layout (Theme provider, Toaster)
    │       │   └── not-found.tsx
    │       │
    │       ├── components/
    │       │   ├── ui/                         ← shadcn (button, dialog, input, table, …)
    │       │   ├── layout/
    │       │   │   ├── AppHeader.tsx           ← логотип + user-badge + theme-toggle
    │       │   │   ├── RoleSwitcher.tsx        ← карьер ↔ опекун
    │       │   │   └── ThemeToggle.tsx
    │       │   ├── claims/
    │       │   │   ├── ClaimCard.tsx           ← карточка для timeline
    │       │   │   ├── ClaimsTable.tsx
    │       │   │   ├── NewClaimForm.tsx
    │       │   │   ├── ClaimVerificationModal.tsx ← главный «#statusModal» (~2300 строк сейчас)
    │       │   │   └── ReklamacjaForm.tsx
    │       │   ├── fleet/
    │       │   │   ├── VehicleForm.tsx
    │       │   │   ├── VehicleDetailsDialog.tsx
    │       │   │   └── ...
    │       │   └── common/
    │       │       ├── DataTable.tsx           ← переиспользуемая таблица
    │       │       ├── KpiCard.tsx
    │       │       ├── StatusChip.tsx
    │       │       └── EmptyState.tsx
    │       │
    │       ├── lib/
    │       │   ├── api/                        ← thin fetch wrappers
    │       │   │   ├── client.ts               ← fetch + interceptor refresh
    │       │   │   ├── auth.ts
    │       │   │   ├── claims.ts
    │       │   │   └── ...
    │       │   ├── hooks/
    │       │   │   ├── useAuth.ts
    │       │   │   ├── useClaims.ts            ← TanStack Query
    │       │   │   ├── useCarriers.ts
    │       │   │   └── ...
    │       │   ├── stores/
    │       │   │   ├── theme.store.ts          ← Zustand
    │       │   │   └── ui.store.ts
    │       │   └── utils/
    │       │       ├── format.ts               ← fmtEUR, fmtDate
    │       │       └── chip-color.ts
    │       │
    │       ├── i18n/
    │       │   ├── config.ts                   ← locales: ['pl', 'en'], default 'pl'
    │       │   └── request.ts                  ← getRequestConfig для next-intl (cookie + header)
    │       ├── messages/
    │       │   ├── pl.json                     ← польские переводы (default)
    │       │   └── en.json                     ← английские переводы
    │       │
    │       ├── public/
    │       │   ├── logo.svg
    │       │   └── favicon.ico
    │       │
    │       ├── tailwind.config.ts
    │       ├── postcss.config.js
    │       ├── next.config.ts
    │       ├── middleware.ts                   ← redirect на login если нет cookie
    │       ├── tsconfig.json
    │       └── package.json
    │
    ├── packages/
    │   │
    │   ├── database/                           # Prisma — единственный owner schema
    │   │   ├── prisma/
    │   │   │   ├── schema.prisma
    │   │   │   ├── migrations/
    │   │   │   └── seed.ts                     ← начальные NACZEPY_TYPY, app_config
    │   │   ├── src/
    │   │   │   ├── index.ts                    ← export PrismaClient
    │   │   │   └── enums.ts                    ← Status, Rola, … (re-export)
    │   │   └── package.json
    │   │
    │   ├── shared/                             # типы, валидаторы, бизнес-расчёты — clean TS
    │   │   ├── src/
    │   │   │   ├── domain/
    │   │   │   │   ├── km-calc.ts              ← портированная calcKmGwarantPerMonth
    │   │   │   │   ├── eu-calendar.ts
    │   │   │   │   └── nr-zgl.ts
    │   │   │   ├── schemas/                    ← Zod схемы (DTO)
    │   │   │   │   ├── claim.schema.ts
    │   │   │   │   ├── carrier.schema.ts
    │   │   │   │   └── ...
    │   │   │   ├── enums.ts                    ← Role, ClaimStatus, DelegationStatus
    │   │   │   ├── constants.ts                ← MAGTRANS_RED, статус-цвета (для chip)
    │   │   │   ├── types.ts
    │   │   │   └── index.ts
    │   │   ├── tests/
    │   │   │   └── km-calc.test.ts             ← обязательные fixtures из текущих wniosków
    │   │   └── package.json
    │   │
    │   └── ui/                                 # (опц.) общие React-компоненты, если появятся
    │       └── ...
    │
    ├── docker-compose.yml                      # Postgres + Redis + (опц.) Mailhog
    ├── .env.example
    ├── .gitignore
    ├── .nvmrc                                  # node 20
    ├── package.json                            # с "workspaces": ["apps/*", "packages/*"]
    ├── package-lock.json
    ├── tsconfig.base.json
    ├── .editorconfig
    ├── .prettierrc
    └── eslint.config.mjs
```

## npm workspaces (в корневом `package.json`)

```jsonc
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

Отдельный `pnpm-workspace.yaml` не нужен — npm читает workspaces прямо из root `package.json`. Lockfile — `package-lock.json` в корне (один на весь монорепо), `node_modules` хостится централизованно с автоматическим hoist-ом общих зависимостей.

## Без Turborepo

Turbo сознательно не используется. На нашем масштабе (4 workspace, 1 разработчик в момент времени, нет горячего CI-кеша между PR-ами) кеш task-графа Turbo не окупает себя — добавляет ещё одну зависимость и ещё один формат конфигурации, при этом по фактическому времени сборки выигрыш на чистом запуске нулевой. Используем штатные средства npm:

- **`npm run X --workspaces --if-present`** — проходит по всем workspace последовательно, пропускает те, где скрипта нет. Подходит для `build`, `lint`, `typecheck`, `test`.
- **`concurrently`** (одна dev-зависимость в корне) — поднимает `api` и `web` параллельно для `npm run dev`, корректно прокидывает SIGINT.
- **`npm run X -w <ws>`** — точечный запуск в одном workspace (`-w` = `--workspace=`).

Если в будущем времени сборки на CI станет действительно больно — вернуться к Turbo проще, чем кажется (turbo.json + замена скриптов), решение полностью обратимо.

## Корневой package.json (скрипты)

```jsonc
{
  "name": "magguarantee-app",
  "private": true,
  "packageManager": "npm@10",
  "engines": {
    "node": ">=20"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,magenta \"npm run dev -w api\" \"npm run dev -w web\"",
    "dev:api": "npm run dev -w api",
    "dev:web": "npm run dev -w web",
    "build": "npm run build --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "db:generate": "npm run generate -w database",
    "db:migrate:dev": "npm run migrate:dev -w database",
    "db:migrate:deploy": "npm run migrate:deploy -w database",
    "db:seed": "npm run seed -w database",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

> Шорткаты для workspace: `-w <name>` эквивалентно `--workspace=<name>`. Прод-установка — `npm ci` (а не `npm install`): использует `package-lock.json` буква-в-букву и быстрее.
>
> ⚠️ Если apps/api зависит от сгенерированного Prisma client из `packages/database`, перед `typecheck`/`build` запускается `npm run db:generate` (либо явно в CI, либо как `pretypecheck` в `apps/api/package.json`). Раньше это разруливал task-граф Turbo (`dependsOn: ["^build"]`), без него — ответственность переезжает на сами workspace-скрипты.

## docker-compose.yml (для локальной разработки)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: magguarantee
      POSTGRES_PASSWORD: magguarantee
      POSTGRES_DB: magguarantee
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "magguarantee"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data

  mailhog:
    image: mailhog/mailhog
    ports: ["1025:1025", "8025:8025"]
    # для локального тестирования email; в проде — Gmail API

volumes:
  pgdata:
  redisdata:
```

## .env.example (api)

```
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://magguarantee:magguarantee@localhost:5432/magguarantee
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=change-me-32-bytes-min
JWT_REFRESH_SECRET=change-me-32-bytes-min
JWT_ACCESS_TTL=900            # 15 min
JWT_REFRESH_TTL=2592000       # 30 days

# 2FA
TWO_FA_CODE_TTL=600
TWO_FA_MAX_ATTEMPTS=5
TWO_FA_LOCKOUT_TTL=300

# Mail (Gmail API)
GMAIL_CLIENT_EMAIL=service-account@magtrans.iam.gserviceaccount.com
GMAIL_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GMAIL_FROM=wnioski@magtrans.eu
GMAIL_DEV_REDIRECT=               # опц. для dev override

# Google OAuth (опц.)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3001/auth/google/callback

# S3 (для скриншотов)
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=magguarantee-screenshots
S3_REGION=auto

# Внешние API
VIES_BASE_URL=https://ec.europa.eu/taxation_customs/vies/rest-api
WHITELIST_BASE_URL=https://wl-api.mf.gov.pl
```

## .env.example (web)

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## TS-проекты (tsconfig.base.json)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@magguarantee/database": ["./packages/database/src"],
      "@magguarantee/shared": ["./packages/shared/src"],
      "@magguarantee/shared/*": ["./packages/shared/src/*"]
    }
  }
}
```

## Импорты — правила

- `apps/api` импортирует из `@magguarantee/database` и `@magguarantee/shared`.
- `apps/web` импортирует из `@magguarantee/shared` (НЕ из `database` — у браузера нет PrismaClient).
- `packages/shared` — pure TypeScript, **без зависимостей от Nest, Next, Prisma**.
- `packages/database` — Prisma client owner; не имеет `@magguarantee/shared` зависимости (избегаем циклов).

Это критично: `packages/shared/domain/km-calc.ts` будет импортироваться и backend-ом (для расчёта при `submitClaim`), и frontend-ом (для live-preview в форме). Один источник истины — нет рассинхрона client/server (которым в legacy `Code.gs` страдал `calcKmPerMonth` на клиенте vs `calcKmGwarantPerMonth` на сервере).
