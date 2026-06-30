# syntax=docker/dockerfile:1.7
# Build context: magguarantee-app/ (monorepo root). All COPY paths are relative
# to that. Produces a Next.js 15 standalone image (output: 'standalone' in
# apps/web/next.config.mjs).

# ── Stage 1: deps ──────────────────────────────────────────────
# Install all workspace deps. Copy only manifests first so the npm-ci layer
# stays cached when source code (but not dependencies) changes.
#
# openssl + libc6-compat are required by @magguarantee/database's postinstall
# hook (prisma generate). `npm ci` walks every workspace and runs each one's
# postinstall — even though web doesn't depend on database, the hook still
# fires, so Prisma's schema must be present before `npm ci`.
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Prisma schema must exist before postinstall (`prisma generate`) runs.
COPY packages/database/prisma ./packages/database/prisma

RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────
# Build @magguarantee/shared first (web imports it as a workspace dep and
# resolves to its dist/ output), then build the Next.js app.
FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# NEXT_PUBLIC_* env vars are baked into the client bundle at build time
# (Next.js requirement). Compose passes the real value as a build arg.
# Default points at localhost so an isolated `docker build` still produces
# a working image (useful for smoke-testing the build itself).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Testing/e2e-only: flip to `true` to allow registering backdated wyjazdy in
# the UI. Baked into the client bundle at build time like NEXT_PUBLIC_API_URL.
ARG NEXT_PUBLIC_ALLOW_PAST_DEPARTURE=false
ENV NEXT_PUBLIC_ALLOW_PAST_DEPARTURE=$NEXT_PUBLIC_ALLOW_PAST_DEPARTURE

RUN npm run build -w @magguarantee/shared && \
    npm run build -w web

# ── Stage 3: prod (Next.js standalone) ─────────────────────────
# Minimal runtime: only the standalone bundle, static assets, and public/.
# No source, no dev deps. NEXT_PUBLIC_* env vars are baked at build time
# (Next.js requirement) — staging compose passes them as build args.
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone server includes a minimal node_modules tree at the repo root.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget is preinstalled in node:20-alpine — used by the compose healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000 >/dev/null 2>&1 || exit 1

CMD ["node", "apps/web/server.js"]
