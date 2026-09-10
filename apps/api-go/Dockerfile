FROM golang:1.23-alpine AS build

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 gives a fully static binary (modernc.org/sqlite is pure Go, no cgo
# needed) so the runtime stage can be minimal Alpine without a C toolchain/libc match.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.20 AS runner

WORKDIR /app

# Minimal Alpine (not distroless) intentionally, for parity with the current shell-based
# HEALTHCHECK tooling (`curl`) used by the root Dockerfile today.
RUN apk add --no-cache curl ca-certificates && mkdir -p /data

ENV API_PORT=4000
ENV DATA_DIR=/data
ENV CORS_ORIGIN=http://localhost:3000
ENV REPO_CACHE_TTL_HOURS=24
ENV REPO_REFRESH_CONCURRENCY=3
ENV REPO_TREE_FETCH_CONCURRENCY=4
ENV APP_STORE_COUNTRY=us
ENV APP_STORE_LOOKUP_DELAY_MS=3500
ENV APP_STORE_CACHE_TTL_DAYS=30
ENV APP_STORE_NEGATIVE_CACHE_TTL_DAYS=7

COPY --from=build /out/api /app/api

EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null || exit 1

CMD ["/app/api"]
