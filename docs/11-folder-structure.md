# 11. Структура монорепо

## Полное дерево

```
MagTrans/
├── Code.gs                       # функциональный референс (никогда не был в проде)
├── index.html                    # функциональный референс
├── docs/                         # документация миграции
└── magguarantee-app/                 # ★ НОВОЕ ПРИЛОЖЕНИЕ (монорепо)
    │
    ├── apps/
    │   ├── api/                  # NestJS backend
    │   │   ├── src/
    │   │   │   ├── main.ts                     ← bootstrap (Pino, Helmet, CORS, OpenAPI)
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
    │       │   └── pl.json                     ← все строки UI (без переключателя пока)
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
    ├── package.json
    ├── pnpm-workspace.yaml
    ├── turbo.json
    ├── tsconfig.base.json
    ├── .editorconfig
    ├── .prettierrc
    └── eslint.config.mjs
```

## pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## turbo.json

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false,
      "outputs": ["packages/database/src/generated/**"]
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

## Корневой package.json (скрипты)

```jsonc
{
  "name": "magguarantee-app",
  "private": true,
  "packageManager": "pnpm@9.x",
  "scripts": {
    "dev": "turbo run dev",
    "dev:api": "turbo run dev --filter=api",
    "dev:web": "turbo run dev --filter=web",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:generate": "pnpm --filter=database run generate",
    "db:migrate:dev": "pnpm --filter=database run migrate:dev",
    "db:migrate:deploy": "pnpm --filter=database run migrate:deploy",
    "db:seed": "pnpm --filter=database run seed",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  }
}
```

## docker-compose.yml (для локальной разработки)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: magtrans
      POSTGRES_PASSWORD: magtrans
      POSTGRES_DB: magtrans
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "magtrans"]

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
DATABASE_URL=postgresql://magtrans:magtrans@localhost:5432/magtrans
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
S3_BUCKET=magtrans-screenshots
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
      "@magtrans/database": ["./packages/database/src"],
      "@magtrans/shared": ["./packages/shared/src"],
      "@magtrans/shared/*": ["./packages/shared/src/*"]
    }
  }
}
```

## Импорты — правила

- `apps/api` импортирует из `@magtrans/database` и `@magtrans/shared`.
- `apps/web` импортирует из `@magtrans/shared` (НЕ из `database` — у браузера нет PrismaClient).
- `packages/shared` — pure TypeScript, **без зависимостей от Nest, Next, Prisma**.
- `packages/database` — Prisma client owner; не имеет `@magtrans/shared` зависимости (избегаем циклов).

Это критично: `packages/shared/domain/km-calc.ts` будет импортироваться и backend-ом (для расчёта при `submitClaim`), и frontend-ом (для live-preview в форме). Один источник истины — нет рассинхрона client/server (которым в legacy `Code.gs` страдал `calcKmPerMonth` на клиенте vs `calcKmGwarantPerMonth` на сервере).
