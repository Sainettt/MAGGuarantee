# `infra/` — Staging & production deployment

Everything needed to run MAGGuarantee in containers, locally or on the VPS.
Builds happen on the host running compose — no registry, no CI required.

## Layout

```
infra/
├── docker-compose.staging.yml    ← app stack: postgres, redis, mailhog, api, web
├── .env.staging.example          ← template; copy to .env and fill in secrets
├── caddy/
│   ├── docker-compose.yml        ← shared reverse-proxy stack
│   └── Caddyfile                 ← TLS + routing config
└── README.md                     ← this file
```

## Prerequisites

Both locally and on the VPS, one-time:

```bash
docker network create proxy-net
```

This shared network lets Caddy reach the app containers without exposing
them to the public internet.

## Local smoke test

```bash
# From repo root.
cp infra/.env.staging.example infra/.env
# Edit infra/.env — fill POSTGRES_PASSWORD, both JWT secrets, set
# NEXT_PUBLIC_API_URL=http://localhost:3001 and WEB_URL=http://localhost:3000.

docker compose -f infra/docker-compose.staging.yml up -d --build
```

First run takes 3–5 min (image builds). Subsequent runs after code changes
are 30–60 sec thanks to layer caching.

Run migrations + seed on first launch:

```bash
docker compose -f infra/docker-compose.staging.yml \
  run --rm api node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

docker compose -f infra/docker-compose.staging.yml \
  run --rm api node_modules/.bin/tsx prisma/seed.ts
```

Then:

- Web → http://localhost:3000
- API health → http://localhost:3001/health
- Mailhog UI → http://localhost:8025

To tear down: `docker compose -f infra/docker-compose.staging.yml down`.
Add `-v` to also wipe the postgres/redis data volumes (be careful).

## VPS deployment (first time)

Assumes the VPS is bootstrapped per `Documentation/Deployment Guide/01 -
Первая настройка VPS.md` (Docker installed, proxy-net created, /opt
folders owned by deploy).

**1. Clone the repo into `/opt/magguarantee/src/`:**

```bash
ssh deploy@vps
cd /opt/magguarantee
git clone https://github.com/<owner>/MAGGuarantee.git src
```

**2. Create `infra/.env` from the template:**

```bash
cd /opt/magguarantee/src
cp infra/.env.staging.example infra/.env
chmod 0600 infra/.env
nano infra/.env
```

`infra/.env` is the single source of truth for the stack — `docker compose`
auto-loads it both for `${...}` interpolation in the compose file and for
the per-service `env_file:` directives. The file is gitignored, so it
survives `git pull` but NOT `rm -rf src` — back it up alongside
`/opt/magguarantee/data/` when snapshotting state.

Generate real secrets and set production URLs:

- `POSTGRES_PASSWORD` — `openssl rand -base64 32`
- `DATABASE_URL` — paste the same password where `REPLACE_WITH_POSTGRES_PASSWORD` is
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — two different `openssl rand -base64 48`
- `POSTGRES_DATA=/opt/magguarantee/data/postgres`
- `REDIS_DATA=/opt/magguarantee/data/redis`
- `WEB_URL=https://vps-29a0acba.vps.ovh.net`
- `NEXT_PUBLIC_API_URL=https://vps-29a0acba.vps.ovh.net`

**3. Bring up Caddy (one-time per VPS):**

```bash
cp -r src/infra/caddy /opt/caddy
cd /opt/caddy
docker compose up -d
```

Caddy will start requesting a Let's Encrypt certificate for
`vps-29a0acba.vps.ovh.net` (DNS already points there — managed by OVH).
Watch logs: `docker compose logs -f caddy`. First request takes 10–30s.

NOTE: web AND api share this single domain via path-based routing inside
Caddy (`/api/*` → api container, everything else → web). When a real
domain is registered (e.g. `*.magtrans.eu`), split the Caddyfile back
into two `domain.com { ... }` blocks for cleaner URLs.

**4. Bring up the app stack:**

```bash
cd /opt/magguarantee/src
docker compose -f infra/docker-compose.staging.yml up -d --build
```

**5. Migrate + seed (first time only):**

```bash
docker compose -f infra/docker-compose.staging.yml \
  run --rm api node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

docker compose -f infra/docker-compose.staging.yml \
  run --rm api node_modules/.bin/tsx prisma/seed.ts
```

**6. Smoke test:**

```bash
curl https://vps-29a0acba.vps.ovh.net/health
# → 200 OK
```

Visit `https://vps-29a0acba.vps.ovh.net/login` in a browser.

## Updating staging (every subsequent deploy)

```bash
ssh deploy@vps
cd /opt/magguarantee/src
git pull
docker compose -f infra/docker-compose.staging.yml up -d --build
```

Caddy keeps running, no need to touch it. If a migration is included in
the pull, run migrate before `up -d`:

```bash
docker compose -f infra/docker-compose.staging.yml \
  run --rm api node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma
```

## Useful runtime commands

```bash
# Tail logs (one service at a time)
docker compose -f infra/docker-compose.staging.yml logs -f api
docker compose -f infra/docker-compose.staging.yml logs -f web

# Status of all containers
docker compose -f infra/docker-compose.staging.yml ps

# Restart only api (no db/redis touch)
docker compose -f infra/docker-compose.staging.yml restart api

# Enter the api container
docker compose -f infra/docker-compose.staging.yml exec api sh

# Connect to Postgres from VPS shell
docker compose -f infra/docker-compose.staging.yml exec postgres \
  psql -U magguarantee magguarantee

# View Mailhog UI from your laptop (SSH tunnel)
ssh -L 8025:localhost:8025 deploy@vps
# then open http://localhost:8025 locally
```

## Бэкапы

Два артефакта, оба обязательны. Дамп Postgres без архива MinIO — неполный
бэкап: вложения (сканы прав, porozumienia, скриншоты авторизации) лежат в
MinIO, и восстановленная без них база ссылается на несуществующие объекты.

| Файл | Назначение |
|---|---|
| `scripts/magguarantee-backup` | `pg_dump` + tar MinIO, проверка gzip, ротация, offsite, heartbeat |
| `scripts/magguarantee-restore-test` | **безопасно**: заливка дампа в одноразовый контейнер + счётчики строк |
| `scripts/magguarantee-restore-db` | **разрушающе**: восстановление боевой базы из дампа (старая переименовывается, не удаляется) |
| `scripts/magguarantee-rollback` | откат кода на указанный git-коммит с пересборкой |
| `systemd/magguarantee-backup.{service,timer}` | ежедневный запуск в 03:30 от юзера `deploy` |

Процедуры отката (код / миграции / данные / вложения) расписаны в
[docs/23-prod-deployment-runbook.md](../docs/23-prod-deployment-runbook.md#откат).

Скрипты запускаются **прямо из чекаута**, поэтому `git pull` их обновляет —
второй копии в `/usr/local/bin`, которая разъезжается с исходником, нет.

### Установка

```bash
sudo cp /opt/magguarantee/src/infra/systemd/magguarantee-backup.* /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now magguarantee-backup.timer
```

Прогнать один раз вручную и посмотреть результат:

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 40 --no-pager
```

Сразу после этого — **обязательно** тест восстановления. Бэкап, который ни разу
не восстанавливали, бэкапом не является:

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-test
```

### Настройка (опционально)

Всё конфигурируется переменными окружения через `/opt/magguarantee/backup.conf`
(юнит подхватывает его через `EnvironmentFile=-`, отсутствие файла не ошибка):

```ini
MAGG_RCLONE_REMOTE=r2:magguarantee-backups-prod
MAGG_KEEP_DAYS=7
MAGG_HEARTBEAT_URL=https://status.magtrans.eu/api/push/xxxxx
```

- **`MAGG_RCLONE_REMOTE`** — пока пуст, бэкапы лежат на том же диске, что и
  данные, то есть от смерти диска не спасают. Скрипт пишет об этом WARNING на
  каждом запуске. Настройка — следующий раздел.
- **`MAGG_REMOTE_KEEP_DAYS`** — сколько дней копии живут в облаке (по умолчанию
  30). У S3-хранилищ это можно повесить на lifecycle-правило, а у Google Drive
  ничего подобного нет — без ротации папка растёт вечно. `0` отключает.
- **`MAGG_HEARTBEAT_URL`** — пингуется только при полном успехе. Это то, что
  ловит «бэкап тихо перестал запускаться три недели назад» — сам по себе скрипт
  такое обнаружить не может.

### Offsite в Google Drive

Карта не нужна, хватает обычного Workspace-аккаунта.

**1. Поставить rclone на VPS:**

```bash
sudo apt update && sudo apt install -y rclone
```

**2. Запустить мастер настройки:**

```bash
rclone config
```

Ответы: `n` (new remote) → имя `gdrive` → тип `drive` → `client_id` и
`client_secret` оставить пустыми (Enter) → scope `1` (полный доступ) →
`root_folder_id` и `service_account_file` пустыми → `n` на «Edit advanced
config» → **`n` на «Use auto config?»**.

Последний пункт — ключевой. На сервере нет браузера, поэтому rclone печатает
команду вида `rclone authorize "drive" "..."`. Её нужно выполнить **на своей
машине** (rclone там тоже должен стоять), залогиниться в Google, разрешить
доступ — и вставить обратно в терминал сервера напечатанный токен.

Дальше: `n` на «Configure this as a Shared Drive?» (если бэкапы идут на личный
диск), `y` для подтверждения, `q` для выхода.

**3. Указать скрипту адрес:**

```bash
echo 'MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups' | sudo tee -a /opt/magguarantee/backup.conf
```

Папку `magguarantee-backups` создавать заранее не нужно — rclone сделает её сам
при первой загрузке.

**4. Проверить:**

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 25 --no-pager
```

Вместо `WARNING: MAGG_RCLONE_REMOTE is empty` должны появиться `uploading to
gdrive:...` и `offsite upload ok`. Посмотреть, что реально долетело:

```bash
rclone ls gdrive:magguarantee-backups
```

### Проверка, что таймер жив

```bash
systemctl list-timers magguarantee-backup.timer
```

## What's NOT here (yet)

- **Прод-джоба в CI.** `.github/workflows/ci.yml` содержит только
  `deploy-staging` (на каждый push в main). Для прода нужна отдельная джоба с
  ручным триггером (`workflow_dispatch` или тег) и своими секретами
  `PROD_DEPLOY_SSH_KEY` / `PROD_DEPLOY_HOST`.
  Причём сейчас и staging-джоба не проходит: `npm test` подхватывает
  `apps/api/test/check-constraints.spec.ts`, которому нужен живой Postgres, а
  сервиса postgres в workflow нет. Чинится добавлением сервиса в CI либо
  выносом `test/` в отдельный скрипт.
- **Offsite для бэкапов.** Скрипты готовы, но `MAGG_RCLONE_REMOTE` пуст — пока
  копии лежат на том же диске, что и данные.
- **Rollback-скрипт.** Сборка идёт на сервере, поэтому отката подменой тега нет;
  появится вместе с переходом на ghcr.
- **Bull Board / Uptime Kuma** — observability tooling, not required for
  initial staging.
