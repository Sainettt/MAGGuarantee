# 18. Launch и deployment

> Так как `Code.gs` + `index.html` никогда не были в проде и содержат фейковые данные, **миграция данных не нужна**. Новое приложение запускается с пустой БД + seed + первый admin. Этот документ описывает что нужно для перехода в prod.

## Текущее состояние (2026-09-14)

> **Пошаговая истина — [23-prod-deployment-runbook.md](23-prod-deployment-runbook.md).** Этот документ концептуальный и местами описывает исходный план, который потом поменялся. Что устарело ниже:
>
> - **Топология.** TLS терминирует **корпоративный nginx MAGTRANS** (vhost `mymag.magtrans.eu`), наш Caddy работает за ним по HTTP без ACME и доверяет nginx через `UPSTREAM_PROXY_CIDRS`. Доменов `app.` / `api.` / `status.magtrans.eu` нет: один домен, `/api/*` → api, `/health` и `/ready` → api, остальное → web.
> - **CI/CD.** Не push-деплой по SSH, а `workflow_dispatch` на self-hosted runner прямо на сервере (метки `staging` / `prod`), сборка на сервере, без ghcr.io. Каждый выкат пишет SHA в `/opt/magguarantee/deploy-history.log`.
> - **Мониторинг.** Сначала внешний монитор на `/health` (без следования редиректам), Uptime Kuma — только на loopback хоста, без публичного домена. Ops-алерты: `OnFailure=` systemd-юнитов → Google Chat (`magguarantee-alert@.service`); провалы писем и chat-уведомлений api шлёт туда же.
> - **Бэкапы.** Реализован один ярус: ежедневный `pg_dump` + архив MinIO, 7 дней локально и 30 дней offsite в Google Drive через rclone. GFS (недели/месяцы), снапшоты хостера и S3-versioning из таблицы «Backup-стратегия» **не реализованы**.
> - **Логи.** json-file с ротацией и `compress` на всех контейнерах; Caddy пишет JSON access-лог; Postgres логирует подключения и запросы > 1 с (без значений параметров). Агрегации (Loki) нет.
>
> Ниже — исторический срез от 2026-05-12.


- **Staging — ✅ работает.** Развёрнут на OVH VPS `vps-29a0acba.vps.ovh.net`. Полный стек (postgres + redis + mailhog + api + web + shared Caddy) поднят. CI/CD через `.github/workflows/ci.yml`: push в `main` автоматически билдит и деплоит через SSH. Seed применён, логин-флоу работает end-to-end. Postgres exposed только на loopback VPS — внешний доступ через SSH-туннель.
- **Prod — ⏳ не развёрнут.** Будет запущен на **отдельном VPS** (не на том же что staging). Шаги для перехода — см. раздел [Переход staging → prod](#переход-staging--prod) ниже.

Большинство ниже описанных файлов и процессов **уже существуют в репо** и используются для staging:
- `apps/api/Dockerfile`, `apps/web/Dockerfile` — multi-stage, готовы для прода без изменений.
- `infra/docker-compose.staging.yml` — почти готов; для прода нужны небольшие правки (см. раздел перехода).
- `infra/caddy/{docker-compose.yml,Caddyfile}` — почти готов; для прода поменять домен и path-routing разделить на subdomain-blocks.
- `infra/.env.staging.example` — шаблон для VPS `.env`.
- `Documentation/Deployment Guide/01 - Первая настройка VPS.md` (в Obsidian) — bootstrap скрипт VPS.

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
        │ ports: 127.0.0.1:5432 (только хост, для GUI-клиента через SSH-туннель)
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

## Переход staging → prod

Prod-VPS — это **другая физическая машина**, не та что staging. Изоляция обязательна: staging падает → prod живёт; никто не дропнет таблицу в проде «думая что в staging»; разные нагрузочные профили; разные регламенты обновлений.

Большая часть инфраструктурных файлов из репо переиспользуется без изменений. Конкретно — что **остаётся**, что **меняется** и что **добавляется**.

### А. Остаётся без изменений (то, что уже работает на staging)

| Артефакт | Где |
|---|---|
| Multi-stage Dockerfile'ы для api и web | `apps/api/Dockerfile`, `apps/web/Dockerfile` |
| `.dockerignore` | `magguarantee-app/.dockerignore` |
| Базовая структура compose | `infra/docker-compose.staging.yml` → копируем в `docker-compose.prod.yml`, правим что нужно (см. ниже) |
| Bootstrap-процедура VPS (Docker, ufw, fail2ban, chrony, unattended-upgrades, deploy-юзер, proxy-net network) | См. `Documentation/Deployment Guide/01 - Первая настройка VPS.md` в Obsidian — те же шаги повторить на новом VPS |
| Shared Caddy паттерн в `/opt/caddy/` | Структура одинаковая, меняется только Caddyfile (см. Б.2) |
| Postgres-loopback exposure для GUI-клиента (DBeaver и т.п.) через SSH-туннель | Аналогично staging |

### Б. Меняется (правки в существующих файлах)

#### Б.1 Compose для прода

Создать `infra/docker-compose.prod.yml` копией staging-варианта, и поменять:

1. **Mailhog убрать** — на проде он не нужен (вместо него Gmail API). Service просто удалить.
2. **Порт api/web наружу** — убрать `ports:` пробросы на `127.0.0.1`. На проде Caddy общается с api/web только через `proxy-net` Docker-сеть. Если нужно отлаживать через SSH-туннель — добавить временно.
3. **Тюнинг postgres** — добавить `shared_buffers=2GB`, `effective_cache_size=4GB` если VPS на 8GB+ RAM (см. пример compose в этом же документе ниже).
4. **`POSTGRES_DATA` / `REDIS_DATA`** в `.env` — абсолютные пути на новом сервере (`/opt/magguarantee/data/...`).

#### Б.2 Caddyfile для прода

Сейчас на staging один блок с path-routing (`/api/*` → api, прочее → web) — потому что OVH-домен один, поддомены создать нельзя. На проде у нас **свои поддомены**, поэтому Caddyfile разбивается обратно на два чистых блока:

```caddy
{
    email admin@magtrans.eu
}

app.magtrans.eu {
    reverse_proxy magguarantee-web:3000
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        ...
    }
}

api.magtrans.eu {
    reverse_proxy magguarantee-api:3001
    ...
}
```

Это даёт более чистые URL и стандартную CORS-модель (web → api как два отдельных origin, но оба с одинаковым parent-доменом `*.magtrans.eu` — cookies с `Domain=.magtrans.eu` будут видны обоим).

#### Б.3 `.env` для прода — ВСЕ секреты новые

Прод-`.env` создаётся в `/opt/magguarantee/.env` (chmod 0600) **с нуля**, секреты **не копируются со staging**. Конкретно:

- `POSTGRES_PASSWORD` — новый через `openssl rand -hex 32` (**только hex**: base64 даёт `/` и `+`, они ломают разбор `DATABASE_URL` — Prisma падает с `P1013: invalid port number`)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — два новых через `openssl rand -base64 48`
- `WEB_URL=https://app.magtrans.eu`
- `NEXT_PUBLIC_API_URL=https://api.magtrans.eu`
- `MAIL_PROVIDER=gmail` (если Gmail API; иначе `smtp` с реальным SMTP-провайдером)
- `S3_*` — bucket для скриншотов (новые ключи)

Резервная копия `.env` — в 1Password (export → encrypted archive offline). Это критично: потеряется VPS, без копии `.env` БД восстановить не сможешь (POSTGRES_PASSWORD не подойдёт к существующим данным дампа).

### В. Добавляется (новые штуки, которых нет на staging)

#### В.1 Реальный домен

- Купить домен (если не куплен). Cloudflare Registrar / Namecheap — ~$10/год.
- A-записи в DNS:
  - ⛔ *Устарело:* `app.` / `api.` / `status.magtrans.eu` не заводятся. Факт — один vhost `mymag.magtrans.eu` на корпоративном nginx MAGTRANS (docs/23 §1.1).
- TTL — `300` пока обкатываем, потом `3600`.

#### В.2 Email — Gmail API (Phase 9)

Mailhog уходит. Заводим:
- Google Cloud Project + Gmail API enabled.
- OAuth consent screen **Internal** + **Publish**, scope `gmail.send`.
- OAuth client ID (Web app) → `client_id` + `client_secret`.
- Refresh token от **личного ящика руководителя** (`npm run gmail:token`) — отдельный технический пользователь Workspace НЕ заводится.
- Google Group `no-reply@magtrans.eu`, подтверждённая как send-as этого ящика; в группе состоит только владелец токена (Owner, доставка «Без писем»), публикация закрыта для всех, кроме менеджеров. Канал односторонний — см. [16 §Односторонний канал](16-jobs-and-integrations.md#односторонний-канал--no-reply-google-group).
- `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`, `GMAIL_FROM` (= адрес группы) в `.env`.

Альтернатива (если Google слишком долго) — Brevo / Resend / SendGrid с обычным SMTP. Менее «нативно» (нет threading через In-Reply-To из коробки), но работает за 15 минут.

Полная инструкция — [16-jobs-and-integrations.md#email-через-gmail-api](16-jobs-and-integrations.md).

#### В.3 S3-bucket'ы

Два разных bucket'а на S3-совместимом хранилище (Cloudflare R2 / Hetzner Object Storage):

- `magguarantee-screenshots-prod` — для скриншотов авторизации (Phase 4+). Versioning ON, retention 5 лет.
- `magguarantee-backups-prod` — для Postgres-дампов. Lifecycle: daily 7 дней, weekly 4 недели, monthly 12 месяцев.

#### В.4 Бэкапы Postgres

✅ **Реализовано.** `infra/scripts/magguarantee-backup` + systemd-таймер (`infra/systemd/`). Делает `pg_dump` через `docker exec` **и** tar каталога MinIO, проверяет целостность, ротирует локально, опционально отправляет в `magguarantee-backups-prod` через `rclone`. Тест восстановления — `infra/scripts/magguarantee-restore-test`. Подробности — раздел [Backup-стратегия](#backup-стратегия), установка — [`infra/README.md`](../infra/README.md#бэкапы).

**Без этого нельзя запускать прод.** Single VPS = один диск, диск умрёт → потеряешь данные. Тест восстановления — раз в квартал минимум.

#### В.5 Мониторинг — Uptime Kuma

⛔ *Устарело.* Факт (docs/23 §«Мониторинг»): внешний монитор на `https://mymag.magtrans.eu/health` без следования редиректам; Kuma — отдельный стек, опубликован только на `127.0.0.1:3001`, панель через SSH-туннель, Push-монитор для heartbeat бэкапа. Публичного `status.magtrans.eu` нет.

#### В.6 Rollback-скрипт

`/usr/local/bin/magguarantee-rollback <sha>` — описан в этом же документе ниже. На прод-VPS обязательно положить, протестировать перед launch.

#### В.7 Отдельный CI/CD workflow

Сейчас `.github/workflows/ci.yml` имеет один deploy-job `deploy-staging` который запускается на **каждый push в main**. Для прода добавляется `deploy-prod` с **другим триггером**:

- Вариант 1 (рекомендую): `workflow_dispatch` — деплой только по ручной кнопке в Actions UI. Никакого автоматизма, осознанное действие.
- Вариант 2: push tag `vX.Y.Z` (`on: push: tags: ['v*']`). Тогда `git tag v1.0.0 && git push origin v1.0.0` запускает прод-деплой.

Новые GitHub Secrets:
- `PROD_DEPLOY_SSH_KEY` — отдельный SSH-ключ от прод-VPS deploy-юзера.
- `PROD_DEPLOY_HOST` — `vps-prod-XXX...` или хостнейм прод-VPS.

Новый Deploy Key в GitHub для прод-VPS (для `git pull` на прод-сервере) — отдельный от staging.

#### В.8 (опц.) Перевод на ghcr.io вместо build-on-server

Сейчас на staging образ собирается прямо на VPS (`docker compose up -d --build`). Для прода может быть лучше:
- В CI билдить образы → пушить в `ghcr.io`.
- На VPS `docker compose pull && up -d --no-deps api web` — без билда на сервере, мгновенный rollback через подмену tag в `.env`.

Это даёт атомарный rollback (поменял `API_TAG=sha-prev` → up -d, секунды). Но усложняет CI workflow + добавляет registry-аутентификацию на VPS. Делать опционально, когда build-on-server станет узким горлышком.

### Г. Sequence — порядок шагов перехода на прод

1. **Купить prod-VPS** (Hetzner CX32 4vCPU/8GB / VPS на OVH с большим планом — не Shared-VM где staging).
2. **Купить домен** + настроить DNS (3 A-записи).
3. **Bootstrap VPS** — повторить шаги из `Documentation/Deployment Guide/01 - Первая настройка VPS.md`.
4. **Поднять Caddy** на новом VPS из `infra/caddy/` с переделанным под subdomain'ы Caddyfile.
5. **Получить Gmail API credentials** (или временно настроить Brevo/Resend как SMTP).
6. **Создать S3 bucket'ы** (screenshots + backups), получить access keys.
7. **Создать prod `.env`** в `/opt/magguarantee/.env` с **новыми** секретами + S3 keys + Gmail keys.
8. **Создать `infra/docker-compose.prod.yml`** — копия staging с правками из Б.1.
9. **Клонировать репо** в `/opt/magguarantee/src/` через Deploy Key (новый SSH-ключ на прод-VPS, добавить в GitHub Deploy Keys).
10. **Поднять стек** + миграции + seed (только admin, без тестовых юзеров).
11. **Smoke-тесты** + DR-тест (попробовать восстановить дамп в чистый контейнер).
12. **Настроить бэкапы** (`magguarantee-pgbackup` + systemd-таймер).
13. **Развернуть Uptime Kuma** + настроить мониторы и алерты.
14. **Добавить prod-job в `.github/workflows/ci.yml`** (workflow_dispatch или tag-trigger) + GitHub Secrets `PROD_DEPLOY_*`.
15. **Admin через UI** создаёт сотрудников MagTrans + перевозчиков. Никаких скриптов-импортеров.

### Д. Чего пока **не**должно быть на проде, даже если соблазнительно

- **Тестовых юзеров из seed** (pracownik1, opiekun1, …). На проде создаём ТОЛЬКО admin'а. Тестовые роли — через UI silently.
- **Mailhog**. Письма должны идти на реальные email-ы.
- **Открытых портов кроме 22/80/443.** Postgres/Redis — только loopback + SSH-туннель.
- **Деплоя на каждый push.** Прод деплоится осознанно — workflow_dispatch или tag.
- **Одного и того же `.env` со staging.** Все секреты новые.

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
  - `127.0.0.1:5432` exposed только на loopback хоста (для GUI-клиента через SSH-туннель).
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
- [ ] OAuth consent screen: User type **Internal**, scope `https://www.googleapis.com/auth/gmail.send`, статус **Publish** (иначе refresh token протухает за 7 дней).
- [ ] Создан OAuth client ID (**Web application**) с redirect `http://localhost:53682/oauth2callback`; получены `client_id` + `client_secret`.
- [ ] Refresh token получен от личного ящика руководителя (`npm run gmail:token`).
- [ ] Группа `no-reply@magtrans.eu` создана, подтверждена как send-as этого ящика; публикация только для менеджеров, архив включён, в составе — один владелец токена с доставкой «Без писем».
- [ ] (Опц.) Google OAuth credentials для SSO внутренних сотрудников.

> Gmail API и все внешние интеграции (VIES, Biała Lista, S3; info-car.pl удалён 2026-10-22) — это **исходящий** HTTPS-трафик из api-контейнера. Caddy в этом не участвует, ничего настраивать не нужно. Контейнер выходит в интернет через Docker bridge → host → NAT.

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

  # Gmail (OAuth 2.0)
  GMAIL_OAUTH_CLIENT_ID=...
  GMAIL_OAUTH_CLIENT_SECRET=...
  GMAIL_OAUTH_REFRESH_TOKEN=...
  GMAIL_FROM=no-reply@magtrans.eu

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
- [ ] `GMAIL_OAUTH_REFRESH_TOKEN` получен от нужного ящика; OAuth-приложение в статусе **Publish** (иначе токен умрёт через 7 дней).

### S3 (отдельно от VPS)

- [ ] **S3-совместимое хранилище** для screenshots — **offsite** (чтобы не потерять при сбое диска):
  - Cloudflare R2 (без egress fee) или Hetzner Object Storage.
  - Bucket: `magguarantee-screenshots-prod`.
  - Versioning включён, retention 5 лет.
- [ ] **Второй bucket** — `magguarantee-backups-prod` для дампов БД (см. [Backup-стратегия](#backup-стратегия)).

### Домены и DNS

- [ ] Vhost `mymag.magtrans.eu` на корпоративном nginx MAGTRANS, проксирующий на `:80` сервера и передающий `X-Forwarded-For` (docs/23 §1.1).
- [ ] IP nginx известен и вписан в `/opt/caddy/.env` → `UPSTREAM_PROXY_CIDRS`; `:80` закрыт для остальных через `DOCKER-USER` (ufw Docker-порты не фильтрует).

### Мониторинг

- [ ] **Внешний монитор** (UptimeRobot / Better Stack) на `https://mymag.magtrans.eu/health`, **не следовать редиректам**, ждать 200.
- [ ] **Uptime Kuma** — отдельный compose-стек в `/opt/uptime-kuma/`, порт только `127.0.0.1:3001`; мониторы `/health`, `/ready`, `/` и Push-heartbeat бэкапа (docs/23).
- [ ] **Ops-алерты** — `alert.conf` с `OPS_ALERT_WEBHOOK_URL`, юниты `magguarantee-alert@.service` установлены, тестовый алерт дошёл; тот же URL в `infra/.env` для api.
- [ ] **Логи** через Pino → stdout контейнера → `docker logs magguarantee-api` / `docker logs magguarantee-web`.
  - В compose уже стоит `json-file` с `max-size`, `max-file` и `compress: 'true'` на всех сервисах.
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
      - "127.0.0.1:5432:5432"   # GUI-клиент через SSH-туннель
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
docker compose -f infra/docker-compose.prod.yml run --rm -T \
  -e SEED_ADMIN_PASSWORD=<initial-from-1password> \
  api node_modules/.bin/tsx prisma/seed.prod.ts < /dev/null
```

> ⚠️ **Не `npm run db:seed`.** Во-первых, `db:seed` запускает `prisma/seed.ts` —
> это ДЕВ-сид с фейковыми пользователями, на проде его гонять нельзя. Во-вторых,
> в прод-образе `/app/package.json` — это манифест api, workspaces там нет, так
> что `-w @magguarantee/database` всё равно не разрешится. Запускать надо
> `prisma/seed.prod.ts` напрямую через `tsx` (он остаётся в образе после
> `npm prune --omit=dev`, так как лежит в `dependencies` пакета database).
>
> `SEED_ADMIN_LOGIN` / `SEED_ADMIN_EMAIL` **не читаются** — логин (`admin`) и
> email захардкожены в `seed.prod.ts`. Отдавая систему заказчику, поменяй их в
> коде или вынеси в env.

Создаёт:

1. **6 типов прицепов** (`STD`, `P-MEGA`, `MEGA`, `IZO`, `CHŁO`, `COIL`) — это бизнес-справочник, не «тестовые данные».
2. **Лимиты км/ставки** — заполнить актуальными значениями MagTrans на текущий и следующий год.
3. **App config**:
   - `stawka_eur_default = 0.5`
   - `km_dziennie_default = 540`
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
| Postgres dump + архив MinIO | ежедневно | 7 дней локально / 30 дней offsite | `/opt/magguarantee/backups` + Google Drive через rclone — ✅ **реализовано** (дефолты `infra/scripts/magguarantee-backup`) |
| Postgres dump | еженедельно | 4 недели | ⏳ план, не реализовано |
| Postgres dump | ежемесячно | 12 месяцев | ⏳ план, не реализовано |
| VPS-снимок хостера | ежедневно | 7 дней | ⏳ зависит от хостера прод-сервера MAGTRANS |
| Вложения (MinIO) | в ежедневном архиве | как dump | ✅ входит в ежедневный бэкап; versioning не настроен |
| Application code | unlimited | через git | GitHub |
| Docker images | по тегам sha | 30 дней | ghcr.io |
| Secrets (`.env`) | при изменении | offline (1Password) | вне VPS |

### Скрипты бэкапа — реализованы

Живут в репозитории и запускаются прямо из чекаута, поэтому `git pull` их
обновляет (второй копии в `/usr/local/bin`, которая разъезжается с исходником,
нет):

| Файл | Что делает |
|---|---|
| [`infra/scripts/magguarantee-backup`](../infra/scripts/magguarantee-backup) | `pg_dump` + tar каталога MinIO, проверка целостности, ротация, опциональный offsite через `rclone`, опциональный heartbeat |
| [`infra/scripts/magguarantee-restore-test`](../infra/scripts/magguarantee-restore-test) | заливает дамп в одноразовый контейнер Postgres и печатает счётчики строк |
| [`infra/systemd/magguarantee-backup.service`](../infra/systemd/magguarantee-backup.service) / [`.timer`](../infra/systemd/magguarantee-backup.timer) | ежедневный запуск в 03:30 от юзера `deploy` |

Установка и настройка — [`infra/README.md`](../infra/README.md#бэкапы).

> ⚠️ **`docker exec` без `-t`.** Псевдо-TTY делает трансляцию LF→CRLF и тихо
> портит gzip-поток: файл нормального размера, `gzip -t` падает только при
> восстановлении. Раньше в этом документе стоял пример с `-t` — он был
> неправильным, в скрипте флага нет.

> ⚠️ **Одного `pg_dump` мало.** Вложения (сканы прав, porozumienia, скриншоты
> авторизации) лежат в MinIO, и база, восстановленная без них, ссылается на
> несуществующие объекты. Скрипт архивирует оба источника.

Запуск через systemd-таймер на хосте (надёжнее cron — есть отчёты, retry, а `Persistent=true` догоняет запуск, пропущенный из-за ребута):

```bash
sudo cp /opt/magguarantee/src/infra/systemd/magguarantee-backup.* /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now magguarantee-backup.timer
```

> systemd используется только для **бэкапов хоста**, само приложение через docker compose. Это один из немногих случаев, где systemd на VPS остаётся полезным.

### Тест восстановления — обязательно

Бэкапы шрёдингера: пока не восстановил, ты не знаешь, рабочие они или нет.
Прогнать **сразу после настройки** и дальше **раз в квартал**:

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-test
```

Скрипт берёт свежий дамп (или переданный аргументом), проверяет gzip, поднимает
одноразовый контейнер Postgres, заливает дамп с `ON_ERROR_STOP=1` и печатает
счётчики строк — число применённых миграций, users, carriers, vehicles,
delegations, claims, справочники. Живой стек не трогается: свой контейнер, без
портов, без общих томов, удаление по `trap EXIT` в любом случае.

MinIO-архив скрипт не проверяет — его достаточно посмотреть глазами:

```bash
tar tzf /opt/magguarantee/backups/minio-<ts>.tar.gz | head -20
```

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

## Подключение GUI-клиента и ad-hoc admin доступ

> **Уточнение (2026-07-28).** Раньше в этом разделе фигурировал «databasus» как
> GUI-клиент — это ошибка. [Databasus](https://databasus.com/) (бывший
> Postgresus) — инструмент **бэкапов** с веб-интерфейсом, а не клиент для
> просмотра таблиц. Для ad-hoc доступа нужен обычный GUI-клиент: DBeaver,
> pgAdmin, TablePlus. Databasus как возможная замена/дополнение нашему
> скрипту бэкапов — см. [Backup-стратегия](#backup-стратегия).

Postgres exposed только на `127.0.0.1:5432` хоста. Снаружи закрыт через `ufw`. Для подключения локального GUI-клиента (DBeaver, pgAdmin, TablePlus) — **SSH-туннель**:

```bash
# с локального ноута
ssh -L 5433:127.0.0.1:5432 deploy@vps.magtrans.eu

# в GUI-клиенте подключение:
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
