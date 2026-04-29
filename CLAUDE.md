# MAGGuarantee — context for Claude

> This file is auto-loaded by Claude Code on session start. Keep it short — point to docs, don't duplicate them.

## What this project is

**MAGGuarantee** — internal system for managing kilometer-guarantee claims for the **MAGTRANS** logistics company. The product is named MAGGuarantee; MAGTRANS is the customer/company that operates it. Throughout the codebase: code identifiers (npm scope, container names, DB user, systemd units, paths) use `magguarantee`; references to the company itself (`@magtrans.eu` emails, MAGTRANS RED brand color, "сотрудник MagTrans") keep `magtrans`. Carriers submit claims when their vehicle drove fewer kilometers in a period than guaranteed; the system calculates EUR compensation.

**Current state:** legacy `Code.gs` + `index.html` is an unfinished GAS app, **never in production**, all data in Google Sheets is **fake**. They serve only as a **functional reference** — what to build, how it should look. Do not port their code verbatim.

**Goal:** build a fresh app on a modern stack (NestJS + PostgreSQL + Next.js + Tailwind) inside `magguarantee-app/`. Start with empty DB + seed. No data migration. No chat feature.

## Where to look

| Need | File |
|---|---|
| Business processes & km-calc formula | [`docs/01-overview.md`](docs/01-overview.md) |
| 8 roles + access matrix | [`docs/03-roles.md`](docs/03-roles.md) |
| Entities & relationships | [`docs/04-data-model.md`](docs/04-data-model.md) |
| Target architecture & stack | [`docs/10-target-architecture.md`](docs/10-target-architecture.md) |
| Monorepo structure | [`docs/11-folder-structure.md`](docs/11-folder-structure.md) |
| Prisma schema | [`docs/12-database-schema.md`](docs/12-database-schema.md) |
| REST API endpoints | [`docs/13-api-design.md`](docs/13-api-design.md) |
| Design system (tokens, Tailwind, components) | [`docs/14-design-system.md`](docs/14-design-system.md) |
| Auth (JWT, 2FA, guards) | [`docs/15-auth-strategy.md`](docs/15-auth-strategy.md) |
| Cron, email, integrations | [`docs/16-jobs-and-integrations.md`](docs/16-jobs-and-integrations.md) |
| Phased development plan | [`docs/17-migration-roadmap.md`](docs/17-migration-roadmap.md) |
| Production launch checklist | [`docs/18-launch-and-deployment.md`](docs/18-launch-and-deployment.md) |
| Full doc index | [`docs/INDEX.md`](docs/INDEX.md) |
| Legacy UI screenshots | `docs/screenshots/` |

## Sub-agents

Defined in `.claude/agents/`. Always invoke `orchestrator-agent` first for any new task — it returns a routing plan. Never spawn specialists directly without routing.

| Agent | Owns |
|---|---|
| `orchestrator-agent` | Routing decisions (analysis only, no code) |
| `db-agent` | `magguarantee-app/packages/database/` (Prisma + migrations) |
| `api-agent` | `magguarantee-app/apps/api/` (NestJS) |
| `web-agent` | `magguarantee-app/apps/web/` (Next.js + Tailwind + shadcn) |
| `uiux-agent` | `docs/14-design-system.md` + screenshots analysis |

## Key principles

1. **Build from scratch.** `Code.gs` / `index.html` are reference only.
2. **Functional identity** with the legacy intent — the flow must work, byte-perfect copy is not required.
3. **Vertical slices** by role: foundation → auth → carrier → pracownik+admin → opiekun → planista+dyspozytor → eksport+weryfikator → audit → launch.
4. **`calcKmGwarantPerMonth` requires ≥30 fixture tests** (no real data exists, write them by hand).
5. **No chat feature** — explicitly removed.
6. **No data migration** — empty DB + seed.
7. **No parallel-running** — legacy isn't deployed, just sitting in the repo as reference.

## Stack (short version)

- **Backend:** Node 20 + TypeScript + NestJS + Prisma + PostgreSQL + Redis + BullMQ + Gmail API + JWT.
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query + RHF + Zod.
- **Infra:** npm workspaces (без Turborepo — `concurrently` для параллельного dev, `npm run X --workspaces --if-present` для остального) + Docker + GitHub Actions + single VPS (nginx + systemd, всё на одном сервере) + Caddy/certbot для SSL.

Full details: [`docs/10-target-architecture.md`](docs/10-target-architecture.md).

## Repository layout

```
MAGGuarantee/
├── CLAUDE.md                 ← you're here
├── README.md                 ← (when created) public-facing for GitHub
├── Code.gs                   ← legacy reference (do not modify, do not port verbatim)
├── index.html                ← legacy reference (CSS at lines 8–502)
├── docs/                     ← all project documentation
│   ├── INDEX.md              ← human-readable docs index
│   ├── 01-…18-*.md           ← topic docs
│   └── screenshots/          ← legacy UI screenshots
├── .claude/
│   └── agents/               ← sub-agent definitions
└── magguarantee-app/         ← the new app (monorepo)
    ├── apps/
    │   ├── api/              ← api-agent owns
    │   └── web/              ← web-agent owns
    └── packages/
        ├── database/         ← db-agent owns
        └── shared/           ← types, validators, domain logic
```
