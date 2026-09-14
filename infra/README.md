# `infra/` — Staging & production deployment

Everything needed to run MAGGuarantee in containers, locally or on the VPS.
Builds happen on the host running compose — no registry. Deploys are started
by hand from GitHub Actions and executed by a self-hosted runner on the server
itself (see [CI/CD](#cicd--ручной-выкат)).

## Layout

```
infra/
├── docker-compose.prod.yml       ← PROD app stack: postgres, redis, minio, api, web
├── docker-compose.staging.yml    ← STAGING app stack: + mailhog, loopback ports
├── .env.prod.example             ← template → infra/.env on the prod server
├── .env.staging.example          ← template → infra/.env on staging / locally
├── caddy/                        ← shared reverse proxy, installed as /opt/caddy
│   ├── docker-compose.yml        ← Caddy container (ports, env, log rotation)
│   ├── .env.example              ← → /opt/caddy/.env (UPSTREAM_PROXY_CIDRS)
│   ├── Caddyfile                 ← STAGING: public, own Let's Encrypt cert
│   └── Caddyfile.prod            ← PROD: behind the corporate nginx, no ACME
├── scripts/                      ← run straight from the checkout on the server
│   ├── magguarantee-backup       ← pg_dump + MinIO tar, rotation, offsite, heartbeat
│   ├── magguarantee-restore-test ← SAFE restore drill into a throwaway container
│   ├── magguarantee-restore-db   ← DESTRUCTIVE restore of the live database
│   ├── magguarantee-rollback     ← code rollback to a git SHA (+ deploy history)
│   ├── magguarantee-alert        ← failed-unit alert → Google Chat webhook
│   ├── backup.conf.example       ← → /opt/magguarantee/backup.conf
│   └── alert.conf.example        ← → /opt/magguarantee/alert.conf
├── systemd/                      ← copied to /etc/systemd/system
│   ├── magguarantee-backup.service   ← oneshot, OnFailure → alert
│   ├── magguarantee-backup.timer     ← daily 03:30
│   └── magguarantee-alert@.service   ← OnFailure handler template
└── README.md                     ← this file
```

## Prerequisites

Both locally and on the VPS, one-time:

```bash
docker network create proxy-net
docker network create magtrans-internal   # Google SSO ↔ MAGSpace (docs/24)
```

`proxy-net` lets Caddy reach the app containers without exposing them to the
public internet.

## Local smoke test

```bash
# From repo root.
cp infra/.env.staging.example infra/.env
# Edit infra/.env — fill POSTGRES_PASSWORD, both JWT secrets, set
# NEXT_PUBLIC_API_URL=http://localhost:3001 and WEB_URL=http://localhost:3000.
# The three *_DATA paths are REQUIRED (no default any more). Locally point them
# at the gitignored infra/data/:
#   POSTGRES_DATA=./data/postgres  REDIS_DATA=./data/redis  MINIO_DATA=./data/minio

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
The data lives in the bind-mounted `*_DATA` directories, not in volumes —
delete those directories to wipe it (be careful).

## VPS deployment (first time)

Assumes the VPS is bootstrapped per `Documentation/Deployment Guide/01 -
Первая настройка VPS.md` (Docker installed, proxy-net created, /opt
folders owned by deploy). Production follows
[docs/23-prod-deployment-runbook.md](../docs/23-prod-deployment-runbook.md);
the steps below are the staging flavour.

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

- `POSTGRES_PASSWORD` — `openssl rand -hex 32` (**hex only** — base64 emits `/`
  and `+`, which break the `DATABASE_URL` parse with `P1013: invalid port number`)
- `DATABASE_URL` — paste the same password where `REPLACE_WITH_POSTGRES_PASSWORD` is
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — two different `openssl rand -base64 48`
- `POSTGRES_DATA=/opt/magguarantee/data/postgres`, `REDIS_DATA=/opt/magguarantee/data/redis`,
  `MINIO_DATA=/opt/magguarantee/data/minio` — already the template values;
  **must stay absolute** (compose refuses to start without them)
- `WEB_URL=https://vps-29a0acba.vps.ovh.net`
- `NEXT_PUBLIC_API_URL=https://vps-29a0acba.vps.ovh.net`

**3. Bring up Caddy (one-time per VPS):**

```bash
cp -r src/infra/caddy /opt/caddy
cd /opt/caddy
cp .env.example .env          # staging: leave UPSTREAM_PROXY_CIDRS empty
docker compose pull && docker compose up -d
```

Caddy will start requesting a Let's Encrypt certificate for
`vps-29a0acba.vps.ovh.net` (DNS already points there — managed by OVH).
Watch logs: `docker compose logs -f caddy`. First request takes 10–30s.

NOTE: web AND api share this single domain via path-based routing inside
Caddy (`/health` + `/ready` → api, `/api/*` → api, everything else → web).
Production keeps the same single-origin shape — see `caddy/Caddyfile.prod`.

The above applies to STAGING only. The production server sits inside the
MAGTRANS network behind the corporate nginx, which owns the public `:443`
and holds the certificate for `mymag.magtrans.eu`. There, `/opt/caddy/Caddyfile`
is a copy of `Caddyfile.prod` (automatic HTTPS OFF, `http://` site address) and
`/opt/caddy/.env` MUST set `UPSTREAM_PROXY_CIDRS` to the nginx address — see
[Reverse proxy](#reverse-proxy-caddy). Full procedure:
`docs/23-prod-deployment-runbook.md` §1.1 and §3.3.

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
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://vps-29a0acba.vps.ovh.net/health
# → 200 application/json; charset=utf-8
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://vps-29a0acba.vps.ovh.net/ready
# → 200 application/json; charset=utf-8   (503 = Postgres or Redis unreachable)
curl -fsS https://vps-29a0acba.vps.ovh.net/health
# → {"status":"ok","uptime":…,"timestamp":…}
```

Do NOT add `-L`, and do not trust `curl -f` alone: `-f` fails only on ≥400, so a
`307 → /login` from the web container (what `/health` returned before Caddy
routed it to the api) counts as success and prints nothing. Anything other than
`200` + JSON means the probe is not reaching the api. The same applies to
external uptime monitors: configure them to expect 200 and not to follow
redirects.

Visit `https://vps-29a0acba.vps.ovh.net/login` in a browser.

## Updating (every subsequent deploy)

Normally: GitHub → Actions → **CI / CD** → Run workflow → target — see
[CI/CD](#cicd--ручной-выкат). By hand, on the server:

```bash
ssh deploy@vps
cd /opt/magguarantee/src
git pull
docker compose -f infra/docker-compose.staging.yml build
docker compose -f infra/docker-compose.staging.yml \
  run --rm -T api node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma < /dev/null
docker compose -f infra/docker-compose.staging.yml up -d
```

Build BEFORE migrating — the image bakes `prisma/migrations` in at build time
(incident 2026-05-14). Caddy keeps running, no need to touch it. A manual
deploy does not write the deploy history — prefer the workflow.

## Reverse proxy (Caddy)

### Client IP — `trusted_proxies` (prod)

```
browser ─HTTPS─> corporate nginx ─HTTP:80─> Caddy ─> api (TRUST_PROXY_HOPS=2)
browser ─HTTPS──────────────────────────> Caddy ─> api (TRUST_PROXY_HOPS=1)   staging
```

`Caddyfile.prod` trusts `X-Forwarded-For` only from the CIDRs in
`UPSTREAM_PROXY_CIDRS` (`/opt/caddy/.env`, template `caddy/.env.example`,
passed into the container by `caddy/docker-compose.yml`). Default
`127.0.0.1/32` = trust nothing. Put nginx's exact `/32` there — **never**
`0.0.0.0/0` or `private_ranges`.

Hop math: with nginx trusted, Caddy appends nginx's address, so the api gets
`X-Forwarded-For: <client>, <nginx>` from socket peer Caddy. Express walks
right-to-left: hop 1 Caddy, hop 2 nginx → `<client>`. That is why prod keeps
`TRUST_PROXY_HOPS=2`. Without the CIDR, Caddy **replaces** the header with
`<nginx>` and every user shares nginx's IP (audit log, login rate limit). nginx
must send `X-Forwarded-For` (`$proxy_add_x_forwarded_for` or `$remote_addr`).
Staging Caddy is the edge and has no `trusted_proxies`; hops = 1.

```bash
# set / change the address — env, so recreate, a `caddy reload` is not enough
sudo tcpdump -n -i any 'tcp port 80 and tcp[tcpflags] & tcp-syn != 0'   # nginx source IP
nano /opt/caddy/.env            # UPSTREAM_PROXY_CIDRS=10.x.x.x/32
cd /opt/caddy && docker compose up -d
docker compose exec caddy printenv UPSTREAM_PROXY_CIDRS

# verify: open the site, then the newest access-log line must show YOUR IP
docker compose logs --since 2m caddy | grep -o '"client_ip":"[^"]*"' | tail -3
```

Also check the api side: the newest `audit_log` rows after a login carry your
address, not nginx's.

Once nginx is trusted, Caddy also passes its `X-Forwarded-Proto` /
`X-Forwarded-Host` through (instead of `http` / the Host header). After the
change, verify login, a redirect to `/login` and token refresh by hand.

### Health routing

Both Caddyfiles route `@api_health path /health /ready` to the api **before**
the web catch-all. The api serves these un-prefixed (`main.ts` excludes them
from `/api/v1`); without the block they reached web, whose middleware answered
`307 → /login` — a false green for every external monitor. `/health` = process
alive, `/ready` = Postgres + Redis answer (503 otherwise). Only the exact paths
match; `/health/` still goes to web.

### Access logs

Each site has `log { output stdout; format filter { wrap json … } }` — one JSON
line per request in `docker compose logs caddy` (json-file driver, 50 MB × 3,
compressed). What is in there: time, method, host, path, status, duration,
`remote_ip` (the peer — nginx on prod) and `client_ip` (the real client once
`trusted_proxies` is set; strict right-to-left parsing, so a forged header
does not win), User-Agent, X-Forwarded-For.

What is NOT: request/response bodies (Caddy never logs them), Cookie /
Authorization / Set-Cookie (redacted by Caddy unless `log_credentials` is on —
it is not), the **query string** (replaced by `?REDACTED` — some GETs carry NIP +
bank account numbers) and the Referer. `/health` and `/ready` are skipped
(`log_skip`) — monitor noise. Requires Caddy ≥ 2.8 (`log_skip`,
`trusted_proxies_strict`); `docker compose pull` if the image is old.

```bash
cd /opt/caddy
docker compose logs --since 1h caddy | grep '"status":5'        # 5xx in the last hour
docker compose logs --since 1h caddy | grep '"logger":"http.log.access' | wc -l
```

### Docker и ufw

**Опубликованные Docker-порты обходят ufw.** Docker ставит DNAT в `nat`
PREROUTING и пропускает трафик через свою цепочку `FORWARD` раньше, чем пакет
дойдёт до ufw INPUT. Поэтому `ufw allow from <IP_NGINX> to any port 80` на прод-
сервере **не ограничивает** порт Caddy: `:80` (и `:443`, `443/udp`) открыты всем,
кто достаёт до сервера по сети. Для app-стека это не проблема — postgres, minio,
api, web опубликованы только на `127.0.0.1` или не опубликованы вовсе. Проблема
именно у Caddy.

Ограничивать нужно в цепочке `DOCKER-USER` — Docker её не трогает и проходит её
первой. Порт сравнивается через conntrack (`--ctorigdstport`), потому что в
`FORWARD` адрес назначения уже переписан DNAT'ом. Надёжнее всего положить правила
в `/etc/ufw/after.rules` — тогда они переживают перезагрузку вместе с ufw.
Дописать в **конец** файла (`eth0` — внешний интерфейс, `ip -br a`):

```
# MAGGuarantee: Docker-published Caddy ports — only nginx may reach :80
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -i eth0 -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport 80 ! -s <IP_NGINX> -j DROP
-A DOCKER-USER -i eth0 -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport 443 -j DROP
-A DOCKER-USER -i eth0 -p udp -m conntrack --ctdir ORIGINAL --ctorigdstport 443 -j DROP
COMMIT
```

```bash
sudo ufw reload && sudo iptables -S DOCKER-USER
```

`--ctdir ORIGINAL` важен: без него под DROP попадут ответы на исходящие
соединения контейнеров к чужим `:80`/`:443` (Gmail API, вебхуки Chat). Проверка —
с другой машины в сети, НЕ с nginx: `curl -m 5 http://<IP_сервера>/health`
должен отвалиться по таймауту; с nginx сайт работает; внешняя проверка CI
(`127.0.0.1`, интерфейс `lo`) правилами не затрагивается.

Альтернатива — публиковать порт только на конкретном адресе
(`'<LAN_IP>:80:80'` в `caddy/docker-compose.yml`). Это ограничивает *интерфейс*,
а не *источник*, и ломает проверку CI через `127.0.0.1`, поэтому основной
вариант — `DOCKER-USER`.

## CI/CD — ручной выкат

`.github/workflows/ci.yml`: push и PR только проверяют код (lint, typecheck,
build, test). Выкат — Actions → **CI / CD** → Run workflow → `staging` | `prod`;
job `deploy` уезжает на self-hosted раннер с такой же меткой, прямо на сервер.

GitHub Environment (`staging` / `prod`) → Variables:

| Variable | Обязательна | Значение |
|---|---|---|
| `COMPOSE_FILE` | да | `infra/docker-compose.prod.yml` / `infra/docker-compose.staging.yml` |
| `DEPLOY_PATH` | нет | по умолчанию `/opt/magguarantee/src` |
| `SITE_URL` | нет | метка сайта из Caddyfile; по умолчанию prod `http://mymag.magtrans.eu`, staging `https://vps-29a0acba.vps.ovh.net` |
| `DEPLOY_HISTORY` | нет | по умолчанию `<родитель DEPLOY_PATH>/deploy-history.log` |

Шаги: `git pull origin main` → запись в журнал → `build` → `migrate deploy` →
`up -d` → `/health` изнутри контейнера api → **внешняя проверка через Caddy**:
`/health` и `/ready` запросом на `127.0.0.1` с Host/SNI из `SITE_URL`
(`curl --resolve`), без редиректов, требуется ровно `200` + `application/json`,
повтор каждые 5 с до 120 с → prune образов → запись `ok`.

**Журнал выкатов** — `/opt/magguarantee/deploy-history.log`, по строке (TSV) на
событие; пишут и workflow, и `scripts/magguarantee-rollback`:

```
2026-09-14T08:36:23Z  event=deploy    status=started  target=prod  compose=…  sha=<full>  prev=<full>  run=<id>/<attempt>  actor=<github-login>  url=<run-url>
2026-09-14T08:41:02Z  event=deploy    status=ok       …
2026-09-15T10:02:11Z  event=rollback  status=ok       compose=…  sha=<target>  prev=<was>  actor=<unix-user>
```

`status=failed` пишется при любом падении после `git pull` — рабочая копия уже
может стоять на новом коммите, а контейнеры нет. Что сейчас выкачено = `sha`
последней строки со `status=ok`:

```bash
grep 'status=ok' /opt/magguarantee/deploy-history.log | tail -n 5
```

Файл должен быть доступен на запись пользователю раннера (и `deploy` для
rollback) — иначе выкат падает на первом шаге, ещё до `git pull`. SHA также
печатается в лог job'а и в summary запуска; если `origin/main` ушёл вперёд от
коммита, который проверяла build-джоба, выводится warning.

**Апрув выката в прод** из репозитория не настраивается: GitHub → Settings →
Environments → `prod` → Required reviewers. Пока не включено, прод может
выкатить любой с write-доступом.

## Useful runtime commands

```bash
# Tail logs (one service at a time)
docker compose -f infra/docker-compose.staging.yml logs -f api
docker compose -f infra/docker-compose.staging.yml logs -f web
docker compose -f infra/docker-compose.prod.yml logs --since 1h postgres   # connections, >1s statements

# Status of all containers
docker compose -f infra/docker-compose.staging.yml ps

# Restart only api (no db/redis touch)
docker compose -f infra/docker-compose.staging.yml restart api

# Enter the api container
docker compose -f infra/docker-compose.staging.yml exec api sh

# Connect to Postgres from VPS shell
docker compose -f infra/docker-compose.staging.yml exec postgres \
  psql -U magguarantee magguarantee

# Redis memory (maxmemory 256mb, policy noeviction — BullMQ requires it; a full
# Redis rejects writes with OOM instead of silently evicting queue keys)
docker compose -f infra/docker-compose.prod.yml exec redis redis-cli info memory | grep -E 'used_memory_human|maxmemory_policy'

# View Mailhog UI from your laptop (SSH tunnel)
ssh -L 8025:localhost:8025 deploy@vps
# then open http://localhost:8025 locally
```

All containers log through the json-file driver with `max-size` / `max-file`
rotation and `compress: 'true'` (rotated files are gzipped). Log options apply
when a container is **created** — after changing them run `up -d` (compose
recreates the affected containers).

## Бэкапы

Два артефакта, оба обязательны. Дамп Postgres без архива MinIO — неполный
бэкап: вложения (сканы прав, porozumienia, скриншоты авторизации) лежат в
MinIO, и восстановленная без них база ссылается на несуществующие объекты.

| Файл | Назначение |
|---|---|
| `scripts/magguarantee-backup` | `pg_dump` + tar MinIO, проверка gzip, ротация, offsite, heartbeat |
| `scripts/magguarantee-restore-test` | **безопасно**: заливка дампа в одноразовый контейнер + счётчики строк |
| `scripts/magguarantee-restore-db` | **разрушающе**: восстановление боевой базы из дампа (старая переименовывается, не удаляется) |
| `scripts/magguarantee-rollback` | откат кода на указанный git-коммит с пересборкой, пишет в журнал выкатов |
| `scripts/magguarantee-alert` | пост «юнит упал» + хвост журнала в Google Chat |
| `scripts/backup.conf.example` | все переменные бэкап-скрипта с дефолтами |
| `scripts/alert.conf.example` | webhook для алертов |
| `systemd/magguarantee-backup.{service,timer}` | ежедневный запуск в 03:30 от юзера `deploy`, `OnFailure=` → алерт |
| `systemd/magguarantee-alert@.service` | шаблон-обработчик `OnFailure=` |

Процедуры отката (код / миграции / данные / вложения) расписаны в
[docs/23-prod-deployment-runbook.md](../docs/23-prod-deployment-runbook.md#откат).

Скрипты запускаются **прямо из чекаута**, поэтому `git pull` их обновляет —
второй копии в `/usr/local/bin`, которая разъезжается с исходником, нет. Сами
unit-файлы — копии: если `git pull` их поменял, повторить `cp` + `daemon-reload`.

**Хранение** (единственный источник — дефолты в `scripts/magguarantee-backup`):
на диске VPS **7 дней** (`MAGG_KEEP_DAYS`), в offsite **30 дней**
(`MAGG_REMOTE_KEEP_DAYS`). GFS-схема из docs/18 не реализована.

### Установка

```bash
sudo cp /opt/magguarantee/src/infra/systemd/magguarantee-* /etc/systemd/system/
```

```bash
[ -e /opt/magguarantee/backup.conf ] || sudo install -m 0600 -o root -g root /opt/magguarantee/src/infra/scripts/backup.conf.example /opt/magguarantee/backup.conf
```

```bash
[ -e /opt/magguarantee/alert.conf ] || sudo install -m 0600 -o root -g root /opt/magguarantee/src/infra/scripts/alert.conf.example /opt/magguarantee/alert.conf
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now magguarantee-backup.timer
```

Обе `.conf` читает systemd (root) до переключения на `deploy`, поэтому
`root:root 0600` достаточно. Шаблон `magguarantee-alert@.service` не
включается (`enable`) — его запускает `OnFailure=`.

Прогнать один раз вручную и посмотреть результат:

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 40 --no-pager
```

Сразу после этого — **обязательно** тест восстановления. Бэкап, который ни разу
не восстанавливали, бэкапом не является:

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-test
```

### Настройка

Всё — переменные окружения в `/opt/magguarantee/backup.conf` (юнит подхватывает
его через `EnvironmentFile=-`, отсутствие файла не ошибка). Полный список с
дефолтами и комментариями — `scripts/backup.conf.example`. Главное:

```ini
MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups-prod
#MAGG_KEEP_DAYS=7
#MAGG_REMOTE_KEEP_DAYS=30
#MAGG_HEARTBEAT_URL=https://<monitor-host>/api/push/<token>
```

- **`MAGG_RCLONE_REMOTE`** — пока пуст, бэкапы лежат на том же диске, что и
  данные, то есть от смерти диска не спасают. Скрипт пишет об этом WARNING на
  каждом запуске. Настройка — раздел «Offsite в Google Drive».
- **`MAGG_KEEP_DAYS`** — сколько дней копии живут на VPS (по умолчанию 7).
- **`MAGG_REMOTE_KEEP_DAYS`** — сколько дней копии живут в облаке (по умолчанию
  30). У S3-хранилищ это можно повесить на lifecycle-правило, а у Google Drive
  ничего подобного нет — без ротации папка растёт вечно. `0` отключает.
- **`MAGG_HEARTBEAT_URL`** — пингуется только при полном успехе. Это то, что
  ловит «таймер тихо перестал срабатывать три недели назад»: юнит, который не
  запускается, не падает, и `OnFailure=` про него молчит. URL должен быть
  доступен **с хоста**: Uptime Kuma в контейнере на `proxy-net` без
  опубликованного порта по `http://localhost:…` недоступна — опубликовать ей
  loopback-порт (например `127.0.0.1:3002:3001` → `http://127.0.0.1:3002/api/push/<token>`)
  или взять внешний сервис (Healthchecks.io, Better Stack).

### Алерты о падениях (Google Chat)

`magguarantee-backup.service` несёт `OnFailure=magguarantee-alert@%n.service`.
Любое падение — ненулевой код, таймаут 30 мин, отсутствующий скрипт — запускает
`magguarantee-alert@magguarantee-backup.service.service`, который постит в
Google Chat: хост, имя юнита, результат (systemd ≥ 251), время и последние 20
строк `journalctl -u <юнит>` (обрезано до ~3000 байт). Работает от `deploy` с
группой `systemd-journal` — root не нужен.

1. В Google Chat: отдельное ops-пространство (не «wyjazdy») → Apps &
   integrations → Webhooks → Add webhook → скопировать URL.
2. `sudo nano /opt/magguarantee/alert.conf` → `OPS_ALERT_WEBHOOK_URL=<URL>`.
   URL — секрет (кто им владеет, пишет в пространство).
3. Проверить — придёт реальное сообщение с хвостом журнала бэкапа:

```bash
sudo systemctl start magguarantee-alert@magguarantee-backup.service.service && journalctl -u 'magguarantee-alert@*' -n 10 --no-pager
```

```bash
systemctl show -p OnFailure magguarantee-backup.service
```

Пустой `OPS_ALERT_WEBHOOK_URL` → в журнале WARNING, ничего не отправляется.
Ошибка отправки → алерт-юнит сам уходит в failed (`systemctl --failed`), без
петли: у шаблона нет своего `OnFailure=`. Новому oneshot-юниту достаточно той же
строки `OnFailure=magguarantee-alert@%n.service` в секции `[Unit]`.

### Offsite в Google Drive

Карта не нужна, хватает обычного Workspace-аккаунта.

**1. Поставить rclone на VPS:**

```bash
sudo apt update && sudo apt install -y rclone
```

**2. Запустить мастер настройки** (от пользователя `deploy` — юнит бэкапа
работает от него и читает `~deploy/.config/rclone/rclone.conf`):

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

**3. Указать скрипту адрес** — в `/opt/magguarantee/backup.conf` заменить
пустую строку `MAGG_RCLONE_REMOTE=` на:

```bash
sudo sed -i 's|^MAGG_RCLONE_REMOTE=.*|MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups|' /opt/magguarantee/backup.conf && sudo grep RCLONE /opt/magguarantee/backup.conf
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

- **Offsite для бэкапов.** Скрипты готовы, но `MAGG_RCLONE_REMOTE` пуст — пока
  копии лежат на том же диске, что и данные.
- **Откат подменой тега.** Сборка идёт на сервере, поэтому `magguarantee-rollback`
  пересобирает старый коммит (5–10 мин); мгновенный откат появится вместе с
  переходом на ghcr.
- **Required reviewers на `prod`** — настройка GitHub, не репозитория (см. CI/CD).
- **Bull Board / Uptime Kuma / агрегация логов (Loki)** — в репозитории нет;
  Kuma описана только в docs/23. Внешний uptime-монитор должен ждать `200` на
  `/health` и `/ready` и не следовать редиректам.
