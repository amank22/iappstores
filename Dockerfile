FROM oven/bun:1.4.0-alpine AS build

WORKDIR /app

ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=$SITE_URL
ENV SITE_URL=$SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1.4.0-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV WEB_PORT=3000
# Points at the standalone Go API service (apps/api-go), reachable on the shared Coolify
# Docker network by its custom_network_aliases hostname -- not a same-container process
# anymore, so the API's own memory usage/limits are managed independently of this image.
ENV API_INTERNAL_URL=http://iappstores-api-go:4000
ARG SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=$SITE_URL
ENV SITE_URL=$SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY --from=build /app ./

RUN apk add --no-cache curl

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${WEB_PORT:-3000}/health" >/dev/null || exit 1

CMD ["bun", "run", "start"]
