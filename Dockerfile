# Debian-based (glibc) to match the distroless runtime below, so any native module
# binaries installed here are the ones that run there.
FROM oven/bun:1.4.4-slim AS build

WORKDIR /app

ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=$SITE_URL
# next.config.mjs's rewrites() (and headers()/redirects()) run during `next build` and
# get baked into .next/routes-manifest.json -- the server serves from that manifest
# without re-invoking next.config.mjs, so API_INTERNAL_URL must be present here, at
# build time, not just as a runtime ENV in the runner stage below (a same-value runtime
# ENV there is a no-op for this specific variable).
ARG API_INTERNAL_URL=http://iappstores-api-go:4000
ENV SITE_URL=$SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL
# Emit .next/standalone: a minimal server.js plus only the node_modules files it needs.
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

# Distroless Bun: the Bun runtime and CA certificates, with no shell, package manager or
# curl. Only the standalone server, static assets and public files are copied in, instead
# of the whole workspace with every dev dependency.
FROM oven/bun:1.4.4-distroless AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=$SITE_URL
# Points at the standalone Go API service (apps/api-go), reachable on the shared Coolify
# Docker network by its custom_network_aliases hostname. The value that actually matters
# for /api rewrites is the one set at build time above (see comment there); this one is
# read by server-side fetches in src/lib/api.ts.
ARG API_INTERNAL_URL=http://iappstores-api-go:4000
ENV SITE_URL=$SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL

# Owned by the distroless "nonroot" user so Next can write its .next/cache at runtime.
COPY --from=build --chown=65532:65532 /app/apps/web/.next/standalone ./
COPY --from=build --chown=65532:65532 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=65532:65532 /app/apps/web/public ./apps/web/public

USER 65532:65532

EXPOSE 3000

# No curl in distroless: probe /health with Bun's built-in fetch.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# The image's entrypoint is bun; --smol trades a little throughput for a smaller heap.
CMD ["--smol", "apps/web/server.js"]
