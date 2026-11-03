FROM golang:1.27-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 gives a fully static binary (modernc.org/sqlite is pure Go, no cgo
# needed) so the runtime stage can be minimal Alpine without a C toolchain/libc match.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Distroless static: just CA certificates, tzdata and /etc/passwd, with no shell, package
# manager or curl, so there is far less in the image to exploit or to patch. The binary is
# fully static (CGO_ENABLED=0), which is all this base needs.
#
# This runs as root on purpose: the existing /data volume in production was created by
# root, so the :nonroot variant (uid 65532) could not write the SQLite database without a
# one-time `chown -R 65532:65532` on that volume first.
FROM gcr.io/distroless/static-debian13 AS runner

WORKDIR /app

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

# Go's GC only returns memory to the OS lazily by default, which let steady-state RSS
# drift to ~319MB after a full source-catalog refresh in testing on an unconstrained
# host. GOMEMLIMIT gives the GC a soft ceiling to actively shrink toward; GOGC=50 makes
# it collect more eagerly between refreshes. Verified: full 56-source cold refresh holds
# under 180MB steady-state inside a 256MB container with these set. Tune GOMEMLIMIT to
# ~35-40% of the container's memory limit if that limit changes.
ENV GOMEMLIMIT=180MiB
ENV GOGC=50

COPY --from=build /out/api /app/api

EXPOSE 4000
VOLUME ["/data"]

# No curl in distroless: the binary probes its own /health (see healthcheck() in main.go).
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["/app/api", "healthcheck"]

CMD ["/app/api"]
