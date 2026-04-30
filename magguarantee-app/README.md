# MAGGuarantee — monorepo

Internal kilometer-guarantee claim management system. Replacement for the legacy GAS prototype (see `../Code.gs`, `../docs/`).

## Stack

- **API:** Node 20 + NestJS + Prisma + Postgres + Redis
- **Web:** Next.js 15 (App Router) + Tailwind + TypeScript
- **Monorepo:** npm workspaces + `concurrently` (для параллельного dev)
- **Hosting:** single VPS, всё в Docker — Caddy (shared reverse-proxy + auto-HTTPS) + compose-стек (api, web, Postgres, Redis). См. `../docs/18-launch-and-deployment.md`.

## Quick start

Prerequisites: Node 20+ (`nvm use`), Docker, npm 10+.

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres + Redis + Mailhog
docker compose up -d

# 3. Run dev servers (api + web in parallel via concurrently)
npm run dev
```

Open:
- Web: http://localhost:3000
- API: http://localhost:3001
- API health: http://localhost:3001/health
- Mailhog UI: http://localhost:8025

## Workspaces

| Workspace | Purpose |
|---|---|
| `apps/api` | NestJS backend |
| `apps/web` | Next.js frontend |
| `packages/database` | Prisma schema + client |
| `packages/shared` | Zod schemas, domain logic, types |

## Common commands

```bash
npm run dev                    # all workspaces in parallel
npm run dev:api                # api only
npm run dev:web                # web only

npm run build                  # build all
npm run lint                   # lint all
npm run typecheck              # tsc --noEmit on all

npm run db:generate            # prisma generate
npm run db:migrate:dev         # create + apply migration in dev
npm run db:seed                # seed reference data

npm run docker:up              # start postgres+redis+mailhog
npm run docker:down            # stop them
```

See `../docs/INDEX.md` for project documentation.
