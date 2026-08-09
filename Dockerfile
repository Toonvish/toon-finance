# syntax=docker/dockerfile:1.7
# =============================================================================
# toon-finance — one image, one origin, one port.
#
# The API serves the built PWA from its own port (see
# apps/api/src/middleware/staticWeb.ts), so a deployment needs no second web
# server, no CORS entry and no API URL baked into the bundle. That is the whole
# reason this is a single container and not two.
#
# BUILT FOR A SMALL 64-BIT LINUX SERVER:
#
#  1. TARGETS ARE linux/amd64 AND linux/arm64, 64-bit only. There is no Bun
#     build for 32-bit anything.
#  2. Debian, not Alpine — the plain `oven/bun` base image, no native
#     dependencies to worry about (no sharp, no tesseract): this app has no
#     image processing and no OCR.
#  3. THE WEB BUNDLE IS BUILT ON THE BUILD PLATFORM ($BUILDPLATFORM), not the
#     target. Its output is architecture-independent JavaScript, so building it
#     natively on the amd64 CI runner instead of under QEMU emulation is the
#     difference between a few minutes and tens of minutes.
# =============================================================================

ARG BUN_VERSION=1.3.14

# -----------------------------------------------------------------------------
# manifests — the workspace manifests and the lockfile, shared by every stage
# below. Copying only these first means a source-only change does not
# invalidate the (slow) dependency install.
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS manifests
WORKDIR /app
COPY package.json bun.lock ./
# The ROOT tsconfig.json is not optional for the web build: vite resolves it for
# the `@toon/shared` path mapping, and its absence fails the build with
# "Tsconfig not found" rather than anything about paths.
COPY tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# -----------------------------------------------------------------------------
# web-build — vite build, ALWAYS on the build platform (output is portable JS).
#
# PUBLIC_API_URL is deliberately EMPTY: it makes lib/api.ts emit relative URLs
# ("/api/…"), which is what lets one image work behind any hostname. Baking an
# absolute URL in here would hard-code one deployment's address into the bundle
# and break the moment it is reached by a different name.
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-debian AS web-build
WORKDIR /app
COPY --from=manifests /app/ ./
RUN bun install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ENV PUBLIC_API_URL=""
ENV NODE_ENV=production
RUN bun --filter @toon/web build && test -f apps/web/dist/index.html && test -f apps/web/dist/sw.js

# -----------------------------------------------------------------------------
# deps — production node_modules FOR THE TARGET ARCHITECTURE.
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS deps
WORKDIR /app
COPY --from=manifests /app/ ./
RUN bun install --frozen-lockfile --production

# -----------------------------------------------------------------------------
# runtime
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-debian AS runtime
WORKDIR /app

# tini reaps zombies and forwards signals; it is PID 1 for the whole container.
RUN apt-get update \
 && apt-get install --no-install-recommends -y tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    API_PORT=3001 \
    # The API serves the PWA itself — this is what makes it one origin.
    WEB_DIST_DIR=/app/apps/web/dist \
    DATABASE_URL="file:/app/data/local.db"

COPY --from=manifests /app/package.json ./package.json
COPY --from=manifests /app/apps/api/package.json ./apps/api/package.json
COPY --from=manifests /app/apps/web/package.json ./apps/web/package.json
COPY --from=manifests /app/packages/shared/package.json ./packages/shared/package.json
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY --from=web-build /app/apps/web/dist ./apps/web/dist

# --- node_modules: THREE directories, not one -------------------------------
# Bun 1.3 uses the ISOLATED linker for workspaces. The real packages live in the
# store at `node_modules/.bun/<pkg>@<version>/`, and each workspace gets its OWN
# `node_modules` full of symlinks into it — `/app/node_modules` itself contains
# nothing but `.bun`.
#
# Copying only the root therefore produces an image that builds, starts, and dies
# on the first request with "Cannot find module '@libsql/client'". All three
# paths have to come across for the symlinks to resolve. apps/web is absent on
# purpose: its bundle is already built.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# `bun` is the unprivileged user the oven/bun images ship with (uid 1000).
RUN mkdir -p /app/data && chown -R bun:bun /app/data
USER bun

VOLUME ["/app/data"]
EXPOSE 3001

# Uses the API's own health endpoint, so "healthy" means Hono is answering and
# the env validated — not merely that the process exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:'+(process.env.API_PORT??3001)+'/api/health'); process.exit(r.ok ? 0 : 1)"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["bun", "apps/api/src/index.ts"]
