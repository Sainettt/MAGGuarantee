# 18. Launch и deployment

> Так как `Code.gs` + `index.html` никогда не были в проде и содержат фейковые данные, **миграция данных не нужна**. Новое приложение запускается с пустой БД + seed + первый admin. Этот документ описывает что нужно для перехода в prod.

## Цель

Превратить готовое приложение из Фазы 9 (см. [17-migration-roadmap.md](17-migration-roadmap.md)) в работающий prod-сервис, готовый принимать первых реальных пользователей.

## Чек-лист prod-окружения

### Инфраструктура

- [ ] Postgres 16 (managed: Railway, Neon, Supabase, AWS RDS).
  - Минимум: 2 GB RAM, 10 GB SSD на старте.
  - Бэкапы: ежедневные point-in-time recovery (managed обычно включено).
- [ ] Redis 7 (managed: Upstash, Railway, AWS ElastiCache).
  - Достаточно бесплатного тира на старте (256 MB).
- [ ] S3-совместимое хранилище для скриншотов авторизации:
  - Cloudflare R2 (без egress fee) или AWS S3.
  - Bucket: `magtrans-screenshots-prod`.
  - Versioning включён, retention 5 лет.
- [ ] Деплой backend (`apps/api`):
  - **Railway** или **Fly.io** или VPS с PM2.
  - 1 instance на старте, autoscale при нагрузке.
- [ ] Деплой frontend (`apps/web`):
  - **Vercel** (нативно для Next.js).
- [ ] Домены:
  - `app.magtrans.eu` (или другой) — frontend.
  - `api.magtrans.eu` — backend.
  - SSL через Let's Encrypt (обычно автоматически у managed-провайдеров).

### Google Cloud (для Gmail API)

- [ ] Создан Google Cloud Project.
- [ ] Включён Gmail API.
- [ ] Создан service-account с domain-wide delegation.
- [ ] В Workspace Admin → Security → API controls → Manage Domain Wide Delegation:
  - Client ID service-account-а добавлен с scope `https://www.googleapis.com/auth/gmail.send`.
- [ ] Технический email `wnioski@magtrans.eu` создан и доступен service-account-у.
- [ ] (Опц.) Google OAuth credentials для SSO внутренних сотрудников.

### Секреты

- [ ] Все ENV переменные из `apps/api/.env.example` заполнены в prod-deploy.
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — сгенерированы по 32+ байта рандома (`openssl rand -base64 48`), **разные**.
- [ ] `GMAIL_PRIVATE_KEY` — escape `\n` правильно.
- [ ] `S3_ACCESS_KEY`/`S3_SECRET_KEY` — с правами на конкретный bucket, не root.
- [ ] `DATABASE_URL` с `sslmode=require`.

### Мониторинг

- [ ] Sentry проект создан, DSN в env.
- [ ] Логирование настроено (Logtail / Better Stack / CloudWatch).
- [ ] Health-check `/health` подключён к uptime-monitor (UptimeRobot, BetterUptime).
- [ ] Алерты:
  - Error rate > 1% за 5 мин → email/Slack.
  - DB connection errors → immediate.
  - p95 response time > 2с за 10 мин.

### Безопасность

- [ ] Helmet enabled, CSP настроен.
- [ ] CORS только для `app.magtrans.eu`.
- [ ] Rate-limit на `/auth/login`, `/auth/verify-code`, `/auth/resend-code` (см. [13-api-design.md](13-api-design.md)).
- [ ] HTTPS-only (HSTS).
- [ ] HttpOnly + Secure + SameSite=Strict для всех cookies.
- [ ] Pino redaction для чувствительных полей (см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#логирование)).
- [ ] Sentry beforeSend hook отбрасывает Authorization header.
- [ ] Pen-test или security checklist OWASP Top 10 пройден.

## CI/CD

### Backend (apps/api)

`.github/workflows/api.yml`:

```yaml
name: API CI/CD
on:
  push:
    branches: [main]
    paths: ['magguarantee-app/apps/api/**', 'magguarantee-app/packages/**']
  pull_request:
    paths: ['magguarantee-app/apps/api/**', 'magguarantee-app/packages/**']

jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
        working-directory: magguarantee-app
      - run: pnpm db:generate && pnpm db:migrate:deploy
        working-directory: magguarantee-app
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - run: pnpm --filter api lint
      - run: pnpm --filter api typecheck
      - run: pnpm --filter api test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379
      - run: pnpm --filter api build

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Railway / Fly.io / другой провайдер
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only -c apps/api/fly.toml
        env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
```

### Frontend (apps/web)

Vercel автоматически деплоит при push в `main`. PR-preview включён.

В Vercel project:
- Root directory: `magguarantee-app/apps/web`.
- Build command: `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter web build`.
- Output directory: `.next`.
- Install command: `pnpm install --frozen-lockfile` (в monorepo root).

## Миграции БД

Управляются Prisma. Стратегия:

```bash
# Локально (dev):
pnpm --filter database run migrate:dev --name <descriptive>

# В CI/CD (prod-деплой):
pnpm --filter database run migrate:deploy
```

`migrate:deploy` запускается **до** старта Nest-приложения (через release command в Railway/Fly или start-up hook).

⚠️ Никогда не использовать `prisma db push` в prod — только `migrate deploy`.

## Seed для prod

После применения миграций — `pnpm db:seed`. Создаёт:

1. **14 типов прицепов** (`Firanka`, `Plandeka`, …) — это бизнес-справочник, не "тестовые данные".
2. **Лимиты км/ставки** — заполнить актуальными значениями MagTrans на текущий и следующий год (получить от бизнеса).
3. **App config**:
   - `stawka_eur_default = 0.5`
   - `km_dziennie_default = 540`
   - `auth_threshold_low = 1000`
   - `auth_threshold_high = 5000`
   - `min_days_to_submit = 10`
   - `login_code_ttl = 600`
   - `login_max_attempts = 5`
4. **Один admin-пользователь** — credentials передаются IT-админу безопасным каналом (1Password share / encrypted email).

```ts
// packages/database/prisma/seed.ts
import { PrismaClient } from '../src/generated';
import bcrypt from 'bcrypt';

async function main() {
  const prisma = new PrismaClient();

  // trailer types
  for (const name of ['Firanka','Plandeka','Chłodnia','Wywrotka','Mega','Jumbo','Frigo','Niska','Burtowa','Kontener','Cysterna','HDS','Walking Floor']) {
    await prisma.trailerType.upsert({ where: { name }, create: { name }, update: {} });
  }

  // first admin (creds в env, НЕ в коде)
  if (process.env.SEED_ADMIN_LOGIN && process.env.SEED_ADMIN_PASSWORD) {
    await prisma.user.upsert({
      where: { login: process.env.SEED_ADMIN_LOGIN },
      create: {
        login: process.env.SEED_ADMIN_LOGIN,
        email: process.env.SEED_ADMIN_EMAIL!,
        passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12),
        role: 'admin',
        name: 'Administrator',
      },
      update: {},
    });
  }

  // app_config
  const cfg: [string, string][] = [
    ['stawka_eur_default', '0.5'],
    ['km_dziennie_default', '540'],
    ['auth_threshold_low', '1000'],
    ['auth_threshold_high', '5000'],
    ['min_days_to_submit', '10'],
    ['login_code_ttl', '600'],
    ['login_max_attempts', '5'],
  ];
  for (const [key, value] of cfg) {
    await prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  // monthly_limits — пример на 2026
  for (let m = 1; m <= 12; m++) {
    await prisma.monthlyLimit.upsert({
      where: { year_month: { year: 2026, month: m } },
      create: { year: 2026, month: m, kmPerDay: 540, ratePerKm: 0.5 },
      update: {},
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
```

## Onboarding первых пользователей

Так как мигрировать нечего, после launch:

1. **Admin вводит сотрудников MagTrans** через UI:
   - Pracownik, opiekun, planista, dyspozytor, eksport, weryfikator.
   - Каждый получает приветственный email с login + temp password (см. `account-created` template).
   - При первом логине меняют пароль (опц.).
2. **Opiekun или admin вводит перевозчиков** (przewoznik):
   - Через UI создаёт `users.role=przewoznik` + `Carrier` profile.
   - Каждый получает приветственный email.
3. **Перевозчики или сотрудники добавляют автомобили / водителей / прицепы** через UI.
4. **Перевозчики начинают подавать wnioski** через UI.

Никаких скриптов, никаких CSV-импортов. Если нужно массово добавить, например, 50 перевозчиков сразу — можно подготовить простой одноразовый seed (`prisma/seed-initial-carriers.ts`), но это уже за пределами стандартного launch.

## Что делать с legacy `Code.gs` + `index.html`

Так как они никогда не были в проде, их можно:

**Вариант A (рекомендую):** оставить в репозитории как «исторический референс» в папке `legacy/`:

```bash
mkdir legacy
git mv Code.gs legacy/Code.gs
git mv index.html legacy/index.html
git mv src legacy/src     # бывшая попытка модуляризации
git mv docs/01..09 docs/legacy/      # старые docs остаются в подпапке
```

Зачем: документация (`docs/01-08-...`) ссылается на конкретные строки `Code.gs:5183` — если что-то непонятно или забылся бизнес-flow, можно вернуться и посмотреть.

**Вариант B:** удалить полностью после launch. Все знания зафиксированы в `docs/01-08`, которые остаются.

**Решение принимать после Фазы 4** (когда все основные flow перенесены и протестированы).

## Smoke-тесты после deploy

Запускать после каждого prod-деплоя:

```bash
# health
curl https://api.magtrans.eu/health
# → 200 OK

# ready
curl https://api.magtrans.eu/ready
# → 200 OK + checks

# login flow
curl -X POST https://api.magtrans.eu/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"..."}'
# → 200 + {sessionToken, maskedEmail}

# 2FA email пришёл (Mailhog в staging, реальный mailbox в prod)
```

Лучше — Playwright e2e, запускаемый раз в час против prod:

```ts
// apps/web/tests/smoke.spec.ts
test('login flow works in prod', async ({ page }) => {
  await page.goto('https://app.magtrans.eu/login');
  await page.fill('[name=login]', SMOKE_USER);
  await page.fill('[name=password]', SMOKE_PWD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/login\/verify/);
});
```

Этот test использует выделенный smoke-account, который не делает mutating действий.

## Rollback

Если деплой сломал prod:

1. **Backend (Fly.io):** `flyctl releases list` + `flyctl deploy --image <previous-image>`.
2. **Frontend (Vercel):** dashboard → Deployments → Promote to Production предыдущий.
3. **БД-миграции:** **никогда не откатывать через `prisma migrate reset`** в prod. Если миграция испортила схему — пишем новую миграцию, которая отменяет (forward-only).

## Backup-стратегия

| Что | Частота | Retention | Где |
|---|---|---|---|
| Postgres | ежедневно (managed PITR) | 7 дней | у провайдера |
| Postgres | еженедельно (logical dump) | 4 недели | S3 |
| Postgres | ежемесячно | 12 месяцев | S3 (cold storage) |
| S3 (screenshots) | versioning | 5 лет | сам S3 |
| Application code | unlimited | через git | GitHub |
| Secrets | при изменении | в secret manager (Doppler / Vercel envs) | — |

## Disaster recovery

Сценарий: основной регион Postgres недоступен.

1. Восстановить из последнего daily-backup в alternate регион (~30 мин данных потеряно в худшем случае).
2. Поменять `DATABASE_URL` в env-переменных.
3. Redeploy.
4. Проверить `/ready`.

RTO (recovery time objective): 30 мин.
RPO (recovery point objective): 24 часа (или сколько с последнего snapshot-а).

Можно сократить RPO до 5 мин с PITR (point-in-time recovery), включается у managed-провайдера за доплату.

## Чек-лист перед прод-launch (D-Day)

### За неделю
- [ ] Все 9 фаз из [17-migration-roadmap.md](17-migration-roadmap.md) завершены.
- [ ] UAT с реальным admin + 2-3 будущими пользователями (carrier, opiekun) пройден на staging.
- [ ] Все km-calc fixtures зелёные.
- [ ] Sentry подключён, тестовая ошибка ловится.
- [ ] Бэкап-стратегия работает (тестово восстановили dump).

### За день
- [ ] Деплой на prod (без публичной видимости — closed beta).
- [ ] Seed admin + начальные limits/configs.
- [ ] DNS настроен (готов к переключению или уже указывает).
- [ ] Smoke-тесты против prod зелёные.
- [ ] Communication plan: кто кому что пишет в день launch.

### D-Day
- [ ] Final smoke test.
- [ ] DNS публично активен (или приглашены первые пользователи).
- [ ] Мониторинг включён, на дежурстве.
- [ ] Onboarding-документ для перевозчиков отправлен.

### Через неделю
- [ ] Retro: что пошло хорошо, что плохо.
- [ ] Список багов, найденных в prod → backlog.
- [ ] Решение по `legacy/` папке (Вариант A или B).
