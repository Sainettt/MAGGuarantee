# 18. Launch и deployment

> Так как `Code.gs` + `index.html` никогда не были в проде и содержат фейковые данные, **миграция данных не нужна**. Новое приложение запускается с пустой БД + seed + первый admin. Этот документ описывает что нужно для перехода в prod.

## Цель

Превратить готовое приложение из Фазы 9 (см. [17-migration-roadmap.md](17-migration-roadmap.md)) в работающий prod-сервис, готовый принимать первых реальных пользователей.

## Архитектурное решение

**Один VPS, всё в Docker.** На том же VPS планируется размещение нескольких приложений (магенерация — лишь одно из них), поэтому контейнеризация даёт изоляцию данных и зависимостей. Нагрузка в пике — 15–20 одновременных пользователей; managed-сервисы и Vercel избыточны и упираются в ToS Hobby-плана. Single point of failure принят бизнесом осознанно: короткий даунтайм при ребуте/сбое допустим, рабочий день оператора заканчивается в 16:00, после этого деплои с минимальным риском.

### Топология

```
Интернет → :80 / :443 (host)
                │
                ▼
         ┌──────────────┐
         │    Caddy     │  shared reverse-proxy для ВСЕХ приложений на VPS
         │  (Docker)    │  auto-HTTPS via Let's Encrypt
         └──────┬───────┘
                │ proxy-net (external Docker network)
                │
   ┌────────────┼─────────────┐──────────────────┐
   ▼            ▼             ▼                  ▼
┌───────┐   ┌───────┐    ┌──────────┐       ┌───────────┐
│  web  │   │  api  │    │ uptime-  │  ...  │ другие    │
│       │   │       │    │  kuma    │       │ приложения│
└───────┘   └───┬───┘    └──────────┘       └───────────┘
                │
                │ magguarantee-net (internal)
                │
        ┌───────┴────────┐
        ▼                ▼
   ┌──────────┐    ┌──────────┐
   │ postgres │    │  redis   │
   └──────────┘    └──────────┘
        │
        │ ports: 127.0.0.1:5432 (только хост, для databasus через SSH-туннель)
```

Постгрес и Redis — **не доступны из других приложений на VPS** (они в `magguarantee-net`, а не в `proxy-net`). Доступ к Postgres извне — только через SSH-туннель: `ssh -L 5433:127.0.0.1:5432 deploy@vps`.

### Структура VPS

```
/opt/
├── caddy/                           # shared reverse-proxy (один на весь VPS)
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── data/                        # TLS-сертификаты (managed by Caddy)
│
└── magguarantee/                    # наш проект
    ├── docker-compose.yml
    ├── .env                         # prod-секреты (chmod 0600, owner: deploy)
    ├── data/
    │   ├── postgres/                # bind mount, легко бэкапить
    │   └── redis/
    └── backups/                     # локальные дампы перед уходом в S3
```

Каждое следующее приложение на VPS — отдельная папка в `/opt/`, своя `docker-compose.yml`, своя БД, общий Caddy.

## Чек-лист prod-окружения

### Хост (VPS)

- [ ] **VPS** (рекомендую Hetzner CX32 — 4 vCPU / 8 GB RAM / 80 GB NVMe / ~€7/мес, или эквивалент).
  - Ubuntu 24.04 LTS или Debian 12.
  - Базовая защита: `ufw` (открыты только 22, 80, 443), ssh только по ключу, root login отключён, `fail2ban`.
  - `unattended-upgrades` для security-патчей **самой ОС** (Docker-образы обновляются отдельно, см. ниже).
  - `chronyd` (NTP) — критично для JWT и audit-логов.
- [ ] **Docker Engine + Compose plugin** установлены официальным скриптом (`get.docker.com`).
  - Deploy-юзер добавлен в группу `docker` (без sudo для compose-команд).
- [ ] **rclone** установлен и настроен на S3-совместимый bucket (для отправки бэкапов).

### Shared reverse-proxy (Caddy)

- [ ] **External Docker network** создан один раз: `docker network create proxy-net`.
- [ ] `/opt/caddy/docker-compose.yml`:
  ```yaml
  services:
    caddy:
      image: caddy:2-alpine
      container_name: caddy
      restart: unless-stopped
      ports:
        - "80:80"
        - "443:443"
        - "443:443/udp"   # HTTP/3 (QUIC)
      volumes:
        - ./Caddyfile:/etc/caddy/Caddyfile:ro
        - caddy_data:/data
        - caddy_config:/config
      networks:
        - proxy-net

  volumes:
    caddy_data:        # TLS-сертификаты живут здесь
    caddy_config:

  networks:
    proxy-net:
      external: true
  ```
- [ ] `/opt/caddy/Caddyfile`:
  ```caddy
  {
      email admin@magtrans.eu
  }

  app.magtrans.eu {
      reverse_proxy magguarantee-web:3000
      encode gzip zstd
      header {
          Strict-Transport-Security "max-age=31536000; includeSubDomains"
          X-Content-Type-Options "nosniff"
          X-Frame-Options "DENY"
          Referrer-Policy "strict-origin-when-cross-origin"
          -Server
      }
  }

  api.magtrans.eu {
      reverse_proxy magguarantee-api:3001
      encode gzip zstd
      header {
          Strict-Transport-Security "max-age=31536000; includeSubDomains"
          X-Content-Type-Options "nosniff"
          X-Frame-Options "DENY"
          -Server
      }
  }
  ```
- [ ] Запущен один раз: `cd /opt/caddy && docker compose up -d`. Дальше работает сам, обновляет сертификаты автоматически.

### Magguarantee-стек

- [ ] **Postgres 16** (контейнер):
  - Bind mount `/opt/magguarantee/data/postgres` → `/var/lib/postgresql/data` — бэкапы привычным `pg_dump`.
  - `127.0.0.1:5432` exposed только на loopback хоста (для databasus через SSH-туннель).
  - Тюнинг через CLI-флаги в command (`shared_buffers=2GB` и т.д.).
  - Healthcheck `pg_isready`.
- [ ] **Redis 7** (контейнер):
  - Bind mount `/opt/magguarantee/data/redis`.
  - `--maxmemory 512mb --maxmemory-policy allkeys-lru`.
  - Не exposed на хост.
- [ ] **api** (контейнер из `ghcr.io/<owner>/magguarantee-api:<sha>`):
  - В двух сетях: `magguarantee-net` (видит Postgres/Redis) + `proxy-net` (доступен Caddy).
  - `env_file: .env`.
  - `depends_on` postgres healthy, redis started.
  - Healthcheck `wget http://localhost:3001/health`.
- [ ] **web** (контейнер из `ghcr.io/<owner>/magguarantee-web:<sha>`):
  - Только в `proxy-net`.
  - Не нужен Postgres/Redis (общается с api по HTTP через Caddy или напрямую через `proxy-net`).

Полный пример `docker-compose.yml` см. ниже в [Файлы prod](#файлы-prod).

### Google Cloud (для Gmail API)

- [ ] Создан Google Cloud Project.
- [ ] Включён Gmail API.
- [ ] Создан service-account с domain-wide delegation.
- [ ] В Workspace Admin → Security → API controls → Manage Domain Wide Delegation:
  - Client ID service-account-а добавлен с scope `https://www.googleapis.com/auth/gmail.send`.
- [ ] Технический email `wnioski@magtrans.eu` создан и доступен service-account-у.
- [ ] (Опц.) Google OAuth credentials для SSO внутренних сотрудников.

> Gmail API и все внешние интеграции (VIES, Biała Lista, info-car.pl, S3) — это **исходящий** HTTPS-трафик из api-контейнера. Caddy в этом не участвует, ничего настраивать не нужно. Контейнер выходит в интернет через Docker bridge → host → NAT.

### Секреты

- [ ] `/opt/magguarantee/.env` (`chmod 0600`, `chown deploy:deploy`):
  ```env
  # image tags (обновляются CI/CD при каждом деплое)
  API_TAG=sha-abc123
  WEB_TAG=sha-abc123

  # Postgres
  POSTGRES_PASSWORD=...32+ random...

  # api runtime
  NODE_ENV=production
  PORT=3001
  LOG_LEVEL=info
  DATABASE_URL=postgresql://magguarantee:${POSTGRES_PASSWORD}@postgres:5432/magguarantee
  REDIS_URL=redis://redis:6379
  WEB_URL=https://app.magtrans.eu

  JWT_ACCESS_SECRET=...openssl rand -base64 48...
  JWT_REFRESH_SECRET=...openssl rand -base64 48 (другой)...
  JWT_ACCESS_TTL=15m
  JWT_REFRESH_TTL=30d

  # Gmail
  GMAIL_USER=wnioski@magtrans.eu
  GMAIL_CLIENT_EMAIL=...
  GMAIL_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

  # S3 (Cloudflare R2 или Hetzner Object Storage)
  S3_ENDPOINT=https://...
  S3_BUCKET=magguarantee-screenshots-prod
  S3_ACCESS_KEY=...
  S3_SECRET_KEY=...

  # web runtime
  NEXT_PUBLIC_API_URL=https://api.magtrans.eu
  API_URL=http://magguarantee-api:3001    # серверный — внутри Docker-сети
  ```
- [ ] **`.env` НЕ в репозитории.** Только в `/opt/magguarantee/.env` на VPS. Резервная копия — в 1Password или зашифрованном архиве offline.
- [ ] `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` — **разные**, по 32+ байта.
- [ ] `DATABASE_URL` без `sslmode` — Postgres в той же Docker-сети, плейн-тексту достаточно (трафик не выходит из сервера).
- [ ] `GMAIL_PRIVATE_KEY` — escape `\n` правильно (Gmail API сам это требует).

### S3 (отдельно от VPS)

- [ ] **S3-совместимое хранилище** для screenshots — **offsite** (чтобы не потерять при сбое диска):
  - Cloudflare R2 (без egress fee) или Hetzner Object Storage.
  - Bucket: `magguarantee-screenshots-prod`.
  - Versioning включён, retention 5 лет.
- [ ] **Второй bucket** — `magguarantee-backups-prod` для дампов БД (см. [Backup-стратегия](#backup-стратегия)).

### Домены и DNS

- [ ] `app.magtrans.eu` → IP VPS (A-запись).
- [ ] `api.magtrans.eu` → IP VPS (A-запись).
- [ ] `status.magtrans.eu` → IP VPS (A-запись, для Uptime Kuma).
- [ ] DNS-провайдер на выбор (Cloudflare бесплатно).

### Мониторинг

- [ ] **Uptime Kuma** — отдельный compose-стек в `/opt/uptime-kuma/`, в `proxy-net`. Caddy роутит `status.magtrans.eu` → этот контейнер.
  - Мониторит `https://api.magtrans.eu/health`, `/ready`, `https://app.magtrans.eu/`.
  - Алерты: email + (опц.) Telegram/Discord webhook.
- [ ] **Логи** через Pino → stdout контейнера → `docker logs magguarantee-api` / `docker logs magguarantee-web`.
  - В `docker-compose.yml`: `logging: driver: "json-file" options: max-size: "100m" max-file: "3"` — иначе лог-файлы могут забить диск.
  - При желании — `loki` + `grafana` отдельным compose-стеком, но это уже надстройка.
- [ ] **Метрики хоста** — `htop` или `netdata` (опц., Netdata одной командой ставится).
- [ ] **Disk-space мониторинг** — Uptime Kuma «Push»-monitor + cron на VPS, шлющий heartbeat если `df` < 80%.
- [ ] **Docker volumes мониторинг** — отдельно следить за `/opt/magguarantee/data/postgres` (объём растёт).

### Безопасность

- [ ] Helmet enabled, CSP настроен.
- [ ] CORS только для `https://app.magtrans.eu`.
- [ ] Rate-limit на `/auth/login`, `/auth/verify-code`, `/auth/resend-code` (см. [13-api-design.md](13-api-design.md)).
- [ ] HTTPS-only (HSTS) — Caddy включает по умолчанию.
- [ ] HttpOnly + Secure + SameSite=Strict для всех cookies.
- [ ] Pino redaction для чувствительных полей (см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#логирование)).
- [ ] Postgres и Redis не exposed на public IP (только через `127.0.0.1:5432` для SSH-туннеля).
- [ ] `ufw` — открыты **только** 22, 80, 443. 5432, 6379 — закрыты снаружи.
- [ ] Pen-test или security checklist OWASP Top 10 пройден.

## CI/CD

Pipeline:
1. Test (lint + typecheck + build + jest) на runner-е GitHub Actions.
2. Build Docker images для api и web.
3. Push в **GitHub Container Registry** (`ghcr.io`) — бесплатно для приватных репо, нативная интеграция с GitHub Actions.
4. SSH на VPS → обновить tag в `.env` → `docker compose pull` → `migrate deploy` → `docker compose up -d --no-deps api web`.

Атомарный свич образов, миграции до рестарта, никаких симлинков.

### `.github/workflows/deploy.yml`

```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports: ['6379:6379']
    defaults:
      run:
        working-directory: magguarantee-app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: magguarantee-app/package-lock.json
      - run: npm ci
      - run: npm run db:generate
      - run: npm run db:migrate:deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  build-and-push:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.tag.outputs.tag }}
    steps:
      - uses: actions/checkout@v4

      - id: tag
        run: echo "tag=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push api
        uses: docker/build-push-action@v5
        with:
          context: magguarantee-app
          file: magguarantee-app/apps/api/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/magguarantee-api:${{ steps.tag.outputs.tag }}
            ghcr.io/${{ github.repository_owner }}/magguarantee-api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push web
        uses: docker/build-push-action@v5
        with:
          context: magguarantee-app
          file: magguarantee-app/apps/web/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/magguarantee-web:${{ steps.tag.outputs.tag }}
            ghcr.io/${{ github.repository_owner }}/magguarantee-web:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DEPLOY_SSH_KEY }}

      - name: Deploy to VPS
        env:
          IMAGE_TAG: ${{ needs.build-and-push.outputs.image_tag }}
        run: |
          ssh -o StrictHostKeyChecking=accept-new deploy@${{ secrets.DEPLOY_HOST }} bash -s <<EOF
            set -euo pipefail
            cd /opt/magguarantee

            # обновить tags в .env
            sed -i "s/^API_TAG=.*/API_TAG=${IMAGE_TAG}/" .env
            sed -i "s/^WEB_TAG=.*/WEB_TAG=${IMAGE_TAG}/" .env

            # подтянуть свежие образы
            docker compose pull api web

            # миграции — ДО подмены контейнеров
            docker compose run --rm api node node_modules/.bin/prisma migrate deploy

            # атомарная подмена api/web, БД и Redis не трогаем
            docker compose up -d --no-deps api web

            # дать api 10 секунд встать
            sleep 10
            docker compose exec -T api wget -qO- http://localhost:3001/health

            # удалить unused образы (>30 дней)
            docker image prune -af --filter "until=720h"
          EOF

      - name: Public smoke test
        run: |
          sleep 5
          curl -fsS https://api.magtrans.eu/health
          curl -fsS https://app.magtrans.eu/ > /dev/null
```

### Секреты GitHub Actions

- `DEPLOY_SSH_KEY` — приватный ключ deploy-юзера на VPS (без passphrase).
- `DEPLOY_HOST` — IP или DNS VPS.
- `GITHUB_TOKEN` — авто-токен для push в ghcr.io (выдаётся самим Actions).

Deploy-юзер на VPS — отдельный, не root, в группе `docker` (имеет право на `docker compose` без sudo). Если хочешь дополнительный слой — в `/etc/sudoers.d/magguarantee` ограничить чем именно может управлять.

## Файлы prod

### `/opt/magguarantee/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: magguarantee-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: magguarantee
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: magguarantee
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"   # databasus через SSH-туннель
    networks:
      - magguarantee-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U magguarantee"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: >
      postgres
      -c shared_buffers=2GB
      -c effective_cache_size=4GB
      -c work_mem=16MB
      -c maintenance_work_mem=512MB
      -c max_connections=100
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"

  redis:
    image: redis:7-alpine
    container_name: magguarantee-redis
    restart: unless-stopped
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru --appendonly yes
    volumes:
      - ./data/redis:/data
    networks:
      - magguarantee-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"

  api:
    image: ghcr.io/${GHCR_OWNER}/magguarantee-api:${API_TAG}
    container_name: magguarantee-api
    restart: unless-stopped
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - magguarantee-net
      - proxy-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "5"

  web:
    image: ghcr.io/${GHCR_OWNER}/magguarantee-web:${WEB_TAG}
    container_name: magguarantee-web
    restart: unless-stopped
    env_file: .env
    networks:
      - proxy-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

networks:
  magguarantee-net:
    driver: bridge
  proxy-net:
    external: true
```

### `apps/api/Dockerfile` (multi-stage)

```dockerfile
# ── Stage 1: deps (npm ci с воркспейс-структурой) ─────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run db:generate
RUN npm run build -w api

# ── Stage 3: prod (минимальный образ) ──────────────────────────
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl wget && \
    addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/packages/database/src/generated ./node_modules/@magguarantee/database/src/generated
COPY --from=build --chown=nestjs:nodejs /app/packages/database/prisma ./prisma

USER nestjs
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

### `apps/web/Dockerfile`

Используется Next.js standalone output (см. [next.config.mjs](../magguarantee-app/apps/web/next.config.mjs) — добавить `output: 'standalone'` в Phase 10).

```dockerfile
# ── Stage 1: deps ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build -w web

# ── Stage 3: prod (Next standalone) ────────────────────────────
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget && \
    addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
```

## Миграции БД

Управляются Prisma. Стратегия:

```bash
# Локально (dev):
npm run db:migrate:dev -- --name <descriptive>

# В CI/CD (prod-деплой):
docker compose run --rm api node node_modules/.bin/prisma migrate deploy
```

`migrate deploy` запускается **до** `docker compose up -d api web` (см. workflow выше). Если миграция падает — деплой прерывается, старые контейнеры остаются работать.

⚠️ Никогда не использовать `prisma db push` в prod — только `migrate deploy`.

## Seed для prod

После применения миграций, **один раз при первом деплое**:

```bash
docker compose run --rm \
  -e SEED_ADMIN_LOGIN=admin \
  -e SEED_ADMIN_EMAIL=admin@magtrans.eu \
  -e SEED_ADMIN_PASSWORD=<initial-from-1password> \
  api npm run db:seed -w @magguarantee/database
```

Создаёт:

1. **14 типов прицепов** (`Firanka`, `Plandeka`, …) — это бизнес-справочник, не «тестовые данные».
2. **Лимиты км/ставки** — заполнить актуальными значениями MagTrans на текущий и следующий год.
3. **App config**:
   - `stawka_eur_default = 0.5`
   - `km_dziennie_default = 540`
   - `auth_threshold_low = 1000`
   - `auth_threshold_high = 5000`
   - `min_days_to_submit = 10`
   - `login_code_ttl = 600`
   - `login_max_attempts = 5`
4. **Один admin-пользователь** — credentials передаются IT-админу безопасным каналом (1Password share).

См. [packages/database/prisma/seed.ts](../magguarantee-app/packages/database/prisma/seed.ts) — реализуется в Phase 1+.

## Onboarding первых пользователей

Так как мигрировать нечего, после launch:

1. **Admin вводит сотрудников MagTrans** через UI:
   - Pracownik, opiekun, planista, dyspozytor, eksport, weryfikator.
   - Каждый получает приветственный email с login + temp password (см. `account-created` template).
2. **Opiekun или admin вводит перевозчиков** (przewoznik) через UI.
3. **Перевозчики или сотрудники добавляют автомобили / водителей / прицепы** через UI.
4. **Перевозчики начинают подавать wnioski** через UI.

Никаких скриптов, никаких CSV-импортов.

## Что делать с legacy `Code.gs` + `index.html`

Так как они никогда не были в проде, их можно:

**Вариант A (рекомендую):** оставить в репозитории как «исторический референс» в папке `legacy/`:

```bash
mkdir legacy
git mv Code.gs legacy/Code.gs
git mv index.html legacy/index.html
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
# → 200 OK + checks (db, redis)

# login flow (без actual логина — только что endpoint живой)
curl -X POST https://api.magtrans.eu/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"..."}'
# → 200 + {sessionToken, maskedEmail}
```

Лучше — Playwright e2e, запускаемый раз в час против prod (см. отдельный workflow `.github/workflows/smoke.yml`).

## Rollback

Через **подмену image tag** — самый простой и атомарный способ.

### Откат api/web

```bash
ssh deploy@vps
cd /opt/magguarantee

# посмотреть какие образы есть локально
docker image ls ghcr.io/<owner>/magguarantee-api

# откатить .env на предыдущий sha
sed -i 's/^API_TAG=.*/API_TAG=sha-prev123/' .env
sed -i 's/^WEB_TAG=.*/WEB_TAG=sha-prev123/' .env

# применить
docker compose up -d --no-deps api web

# проверить
docker compose exec api wget -qO- http://localhost:3001/health
```

Полезно положить это в `/usr/local/bin/magguarantee-rollback` — короткий bash-скрипт, принимающий целевой sha:

```bash
#!/usr/bin/env bash
set -euo pipefail
SHA="${1:?usage: magguarantee-rollback <sha>}"
cd /opt/magguarantee
sed -i "s/^API_TAG=.*/API_TAG=${SHA}/" .env
sed -i "s/^WEB_TAG=.*/WEB_TAG=${SHA}/" .env
docker compose pull api web
docker compose up -d --no-deps api web
sleep 5
docker compose exec -T api wget -qO- http://localhost:3001/health
echo "rolled back to ${SHA}"
```

### Откат миграций БД

**Никогда не откатывать через `prisma migrate reset`** в prod. Если миграция испортила схему — пишем новую миграцию, которая отменяет (forward-only).

Помнить: rollback кода без отката миграции допустим только если новая миграция backward-compatible. Чему стоит следовать всегда:
- добавляем колонки nullable,
- удаляем — отдельным релизом после того как код, использующий их, уже не активен.

## Backup-стратегия

Single-VPS — один диск. Без offsite-бэкапов потеря диска = потеря всего. Это критично, не пропускать.

| Что | Частота | Retention | Где |
|---|---|---|---|
| Postgres dump | ежедневно | 7 дней | offsite S3 (R2 / Hetzner Object Storage) |
| Postgres dump | еженедельно | 4 недели | offsite S3 |
| Postgres dump | ежемесячно | 12 месяцев | offsite S3 |
| VPS-снимок (Hetzner snapshot) | ежедневно | 7 дней | у хостера |
| S3 (screenshots) | versioning | 5 лет | сам S3 (offsite by design) |
| Application code | unlimited | через git | GitHub |
| Docker images | по тегам sha | 30 дней | ghcr.io |
| Secrets (`.env`) | при изменении | offline (1Password) | вне VPS |

### Скрипт бэкапа Postgres

`/usr/local/bin/magguarantee-pgbackup`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y-%m-%d-%H%M)
DUMP=/opt/magguarantee/backups/pg-$TS.sql.gz
mkdir -p /opt/magguarantee/backups

# дамп через docker exec — Postgres внутри контейнера
docker exec -t magguarantee-postgres pg_dump -U magguarantee magguarantee | gzip > "$DUMP"

# offsite (rclone настроен на S3)
rclone copy "$DUMP" r2:magguarantee-backups-prod/postgres/

# локальная ротация — держим 7 дней на хосте (S3 хранит дольше)
find /opt/magguarantee/backups -name 'pg-*.sql.gz' -mtime +7 -delete
```

Запуск через systemd-таймер на хосте (надёжнее cron — есть отчёты, retry):

```ini
# /etc/systemd/system/magguarantee-pgbackup.service
[Unit]
Description=MAGGuarantee Postgres backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/magguarantee-pgbackup
User=deploy
StandardOutput=journal
StandardError=journal

# /etc/systemd/system/magguarantee-pgbackup.timer
[Unit]
Description=Daily MAGGuarantee Postgres backup

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
```

> systemd используется только для **бэкапов хоста**, само приложение через docker compose. Это один из немногих случаев, где systemd на VPS остаётся полезным.

### Тест восстановления — обязательно

Бэкапы шрёдингера: пока не восстановил, ты не знаешь, рабочие они или нет. Минимум **раз в квартал**:

1. Скачать последний дамп с S3.
2. Поднять временный контейнер: `docker run --rm -d --name pg-restore-test -e POSTGRES_PASSWORD=test postgres:16-alpine`.
3. Восстановить: `gunzip -c pg-XXX.sql.gz | docker exec -i pg-restore-test psql -U postgres`.
4. Прогнать smoke-проверки (`SELECT count(*) FROM users; SELECT count(*) FROM claims;`).
5. `docker rm -f pg-restore-test`.

## Disaster recovery

### Сценарий 1: VPS лёг (хостер upadl, диск умер, OS не грузится)

1. Создать новый VPS той же спецификации у того же или другого хостера.
2. Bootstrap-скрипт `infra/setup.sh` (хранится в репозитории, поддерживается актуальным):
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   apt update && apt upgrade -y
   apt install -y ufw fail2ban chrony rclone unattended-upgrades

   # Docker
   curl -fsSL https://get.docker.com | sh
   usermod -aG docker deploy

   # firewall
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

   # external network
   docker network create proxy-net

   # каталоги
   mkdir -p /opt/{caddy,magguarantee,uptime-kuma}
   chown -R deploy:deploy /opt
   ```
3. Восстановить `/opt/caddy/`, `/opt/magguarantee/` из git-репо инфраструктуры (отдельный репо `magtrans-infra`) или из бэкапа.
4. Восстановить `.env` из offline-секретов (1Password export).
5. Восстановить Postgres из последнего offsite-дампа:
   ```bash
   cd /opt/magguarantee
   docker compose up -d postgres
   sleep 10
   gunzip -c /tmp/pg-LATEST.sql.gz | docker exec -i magguarantee-postgres psql -U magguarantee magguarantee
   ```
6. `docker compose up -d` — поднимет api, web, redis. Caddy запускается отдельно: `cd /opt/caddy && docker compose up -d`.
7. Поменять DNS A-записи на новый IP (Cloudflare TTL=300 → 5 мин на распространение).

**RTO:** 1–2 часа (если bootstrap-скрипт готов и оттестирован).
**RPO:** 24 часа (или меньше, если уменьшить интервал бэкапа до 6/12 часов).

### Сценарий 2: только Postgres сломался (corrupt data)

```bash
cd /opt/magguarantee
docker compose stop api web   # API не должен писать в битую БД
docker compose stop postgres
mv data/postgres data/postgres.broken-$(date +%F)
mkdir -p data/postgres
docker compose up -d postgres
sleep 10
gunzip -c backups/pg-LATEST.sql.gz | docker exec -i magguarantee-postgres psql -U magguarantee magguarantee
docker compose up -d api web
```

### Чтобы DR работал

- **Bootstrap-скрипт** (`infra/setup.sh` или Ansible playbook) должен быть актуален — каждый раз когда меняем что-то на VPS вручную, обновляем скрипт.
- **Тест DR** — раз в полгода поднять VPS с нуля по скрипту, восстановить дамп, убедиться что всё работает.

## Подключение databasus и ad-hoc admin доступ

Postgres exposed только на `127.0.0.1:5432` хоста. Снаружи закрыт через `ufw`. Для подключения локальной тулы (databasus, DBeaver и т.п.) — **SSH-туннель**:

```bash
# с локального ноута
ssh -L 5433:127.0.0.1:5432 deploy@vps.magtrans.eu

# в databasus (или другом GUI-клиенте) подключение:
#   host: localhost
#   port: 5433
#   user: magguarantee
#   password: <из /opt/magguarantee/.env>
#   database: magguarantee
```

Аналогично для Redis: `ssh -L 6380:magguarantee-redis:6379 deploy@vps` — но Redis обычно отлаживается через `docker compose exec redis redis-cli`.

## Чек-лист перед прод-launch (D-Day)

### За неделю
- [ ] Все 9 фаз из [17-migration-roadmap.md](17-migration-roadmap.md) завершены.
- [ ] UAT с реальным admin + 2-3 будущими пользователями (carrier, opiekun) пройден на staging.
- [ ] Все km-calc fixtures зелёные.
- [ ] Uptime Kuma пингует endpoints, тестовый алерт пришёл на email.
- [ ] Бэкап-стратегия работает (тестово восстановили dump из S3 в локальный контейнер).
- [ ] Bootstrap-скрипт `infra/setup.sh` оттестирован на чистом VPS.

### За день
- [ ] Деплой на prod (без публичной видимости — closed beta).
- [ ] Seed admin + начальные limits/configs.
- [ ] DNS настроен (готов к переключению или уже указывает).
- [ ] TLS-сертификаты получены Caddy (проверить `https://api.magtrans.eu` в браузере).
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
