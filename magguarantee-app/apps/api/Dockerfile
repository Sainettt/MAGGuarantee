# syntax=docker/dockerfile:1.7
#
# MAGGuarantee API — production image.
#
# Build context MUST be the monorepo root (magguarantee-app/), not the
# repository root and not apps/api/. All COPY paths below are relative to
# magguarantee-app/.
#
#   docker build -f apps/api/Dockerfile -t magguarantee-api .
#
# The api workspace depends on the local workspaces @magguarantee/shared and
# @magguarantee/database (the latter ships the Prisma client). We build all
# of those in stage 2 and copy only the runtime artefacts into stage 3.
#
# Migrations are NOT applied here — run them at deploy time via:
#   docker compose run --rm api node node_modules/.bin/prisma \
#     migrate deploy --schema=prisma/schema.prisma
# See docs/18-launch-and-deployment.md.

# ─── Stage 1: deps ──────────────────────────────────────────────────────────
# Install all workspace dependencies. Manifests are copied first so this
# layer caches across source-only changes.
#
# The Prisma schema is copied BEFORE `npm ci` because the
# @magguarantee/database package has a `postinstall: prisma generate` hook
# that needs the schema to exist. openssl + libc6-compat are required by
# Prisma's linux-musl engine (see binaryTargets in prisma/schema.prisma).
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

# Root + workspace manifests.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Prisma schema must be present before `npm ci` triggers postinstall.
COPY packages/database/prisma ./packages/database/prisma

RUN npm ci --no-audit --no-fund

# ─── Stage 2: build ─────────────────────────────────────────────────────────
# Compile @magguarantee/shared, then @magguarantee/database (which also
# copies the Prisma client into dist/generated/), then the NestJS api.
# Order matters: api imports the two packages as ordinary node_modules,
# resolving to their built ./dist/index.js.
FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/api ./apps/api

# Prisma client → packages/database/src/generated/ (per the `output` in
# prisma/schema.prisma). The `postinstall` hook in stage 1 already ran
# `prisma generate`, but we re-run it here to be deterministic against the
# now-present full source tree.
RUN npm run db:generate

# Builds @magguarantee/shared, @magguarantee/database (tsc +
# copy-generated.cjs), then the api workspace. Output: apps/api/dist/main.js.
RUN npm run build:packages \
 && npm run build -w api

# Strip dev dependencies. This mutates /app/node_modules in place so the
# next stage can copy a lean tree.
RUN npm prune --omit=dev

# ─── Stage 3: prod ──────────────────────────────────────────────────────────
# Minimal runtime. openssl is required by the Prisma query engine; wget is
# required by the HEALTHCHECK. Run as a dedicated non-root user.
FROM node:20-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

RUN apk add --no-cache openssl wget \
 && addgroup -S nodejs \
 && adduser -S nestjs -G nodejs

# Compiled api bundle.
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./dist

# Workspace symlinks resolve through node_modules, so we copy the entire
# pruned tree. This includes the @magguarantee/database and
# @magguarantee/shared workspace links (which now point at their built dist/
# directories).
COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules

# Workspace package dist outputs — required because node_modules entries
# for the local workspaces are symlinks back into /app/packages/*/dist.
COPY --from=build --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/package.json
COPY --from=build --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json

# Surface api's package.json at /app so `prisma db seed` finds the
# `"prisma": { "seed": "tsx prisma/seed.ts" }` config. Prisma resolves the
# seed command relative to the cwd's package.json; without this file the
# seed errors out with "you need to add a 'prisma.seed' property".
# Dependency metadata in this file is informational only — node_modules is
# already populated by the workspace copy above and is not re-installed.
COPY --from=build --chown=nestjs:nodejs /app/apps/api/package.json ./package.json

# Prisma schema + migrations at the conventional `./prisma` path so that
# `prisma migrate deploy --schema=prisma/schema.prisma` works at runtime.
COPY --from=build --chown=nestjs:nodejs /app/packages/database/prisma ./prisma

# Generated Prisma client sibling to ./prisma. The seed script (prisma/seed.ts)
# uses `import { PrismaClient } from '../src/generated'`, so we mirror the
# packages/database/{prisma,src/generated} layout at the image root. This is
# only used by the seed; runtime queries from api go through the @magguarantee/
# database workspace module under node_modules.
COPY --from=build --chown=nestjs:nodejs /app/packages/database/src/generated ./src/generated

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider --tries=1 "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "dist/main.js"]
