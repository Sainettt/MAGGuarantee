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

## What's NOT here (yet)

- **CI/CD workflow** — first iterations are manual. A `.github/workflows/deploy-staging.yml`
  that SSH'es to the VPS and runs the three update commands above can be
  added once the manual flow is validated.
- **Database backups** — for production. Staging Postgres can be wiped and
  reseeded; backups are added at prod-launch (see `docs/18-launch-and-deployment.md`).
- **Bull Board / Uptime Kuma** — observability tooling, not required for
  initial staging.
