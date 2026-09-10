# iappstores

`iappstores` is a Next.js frontend backed by a standalone Go API for browsing iOS app store repository sources.

The v1 source list is defined in code and starts with the full FastSign AltStore/SideStore-compatible repository:

- `https://fastsign.dev/repo.json`

## Workspace

- `apps/api-go` - Go API: repo fetching, normalization, SQLite (with FTS5 search) caching, App Store enrichment. Deploys as its own service.
- `apps/web` - Next.js App Router UI with Tailwind and shadcn-style components. Deploys as its own service and talks to `apps/api-go` over the network.
- `packages/contracts` - shared zod schemas and inferred TypeScript types describing the API's wire format (consumed by the web app; the Go API is a hand-maintained mirror of the same shapes).

`apps/api` (the original Node/Express/Bun implementation) has been retired in favor of `apps/api-go` — the Go rewrite fixed a persistent OOM issue by eliminating an in-memory full-catalog cache and moving to a much lower-footprint runtime. See `apps/api-go/README.md` (if present) or its package comments for details.

## Scripts (web + contracts)

```sh
bun install
bun run dev
bun run rebuild
bun run build
bun run typecheck
bun run lint
bun run test
```

These scripts now only cover `apps/web` and `packages/contracts`. `apps/api-go` is a separate Go module with its own toolchain:

```sh
cd apps/api-go
go build ./...
go vet ./...
go test -race ./...
```

## Deployment

`apps/web` and `apps/api-go` deploy as **two separate services** (e.g. two Coolify applications on the same Docker network), not one combined container. This lets each service's memory be limited and monitored independently.

### apps/web

```sh
docker build -t iappstores-web .
docker run --rm -p 3000:3000 -e API_INTERNAL_URL=http://iappstores-api-go:4000 iappstores-web
```

The frontend is served on port `3000`. `API_INTERNAL_URL` must point at the `apps/api-go` service's reachable address (e.g. its Docker network alias) so Next.js can proxy `/api/*` requests to it.

```txt
SITE_URL=https://your-domain.example
NEXT_PUBLIC_SITE_URL=https://your-domain.example
API_INTERNAL_URL=http://iappstores-api-go:4000
```

### apps/api-go

```sh
docker build -t iappstores-api-go apps/api-go
docker run --rm -p 4000:4000 -v iappstores-data:/data iappstores-api-go
```

The Go API keeps a persistent SQLite cache (with FTS5 search) for normalized repository data. Mount a volume to `/data` so the cache survives deploys and restarts — without it, every restart re-fetches all sources from scratch.

Optional cache settings (env vars, same names as the original API):

```txt
DATA_DIR=/data
REPO_CACHE_TTL_HOURS=24
REPO_REFRESH_CONCURRENCY=3
REPO_TREE_FETCH_CONCURRENCY=4
APP_STORE_COUNTRY=us
APP_STORE_FALLBACK_COUNTRIES=in,gb,ca
APP_STORE_LOOKUP_DELAY_MS=3500
APP_STORE_CACHE_TTL_DAYS=30
APP_STORE_NEGATIVE_CACHE_TTL_DAYS=7
GOMEMLIMIT=180MiB
GOGC=50
```

`GOMEMLIMIT`/`GOGC` bound Go's garbage collector so steady-state memory stays well under typical small-VPS container limits — verified to hold a full 56-source cold refresh under ~180MB inside a 256MB container. Tune `GOMEMLIMIT` to roughly 35-40% of whatever memory limit you set on the container if that limit changes.

App Store enrichment uses Apple's public lookup API by bundle ID. It serves cached metadata immediately and refreshes missing or expired entries slowly in the background to avoid rate limits. Repository text remains visible as IPA source notes because it often explains patched or unlocked builds.

Unlike the original API, `apps/api-go` does **not** materialize the whole catalog into memory. Every request hydrates only the rows it needs from SQLite (with FTS5 for search and indexed columns for category/developer filtering), so there is no full-catalog object graph resident in the process at any time — this was the actual root cause of the original OOM issues, independent of runtime language.

Translation support (`/api/translate`, backed by an unofficial Google Translate scrape) was dropped in the Go rewrite. The frontend now links out to Google Translate directly instead of proxying through the API.

For Coolify health checks:

```txt
apps/web:     Port 3000, Path /health
apps/api-go:  Port 4000, Path /health
```

## CI and Publishing

GitHub Actions uses separate workflows for verification and publishing. `Verify` runs on pull requests and pushes to `main` — it checks `apps/web`/`packages/contracts` (Bun) and `apps/api-go` (Go) independently. `Publish Docker image` runs after `Verify` succeeds on `main` and publishes the web image to GitHub Container Registry as:

```txt
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
```

`apps/api-go` currently deploys by building its Dockerfile directly from the git repository (not via a published registry image).

No repository secrets are required for the default GHCR publishing flow; it uses `GITHUB_TOKEN`.

To auto-deploy the published image in Coolify, add these optional GitHub repository secrets:

```txt
COOLIFY_WEBHOOK_URL=<Coolify deploy webhook URL>
COOLIFY_API_TOKEN=<Coolify API token with deploy permission>
```

When both secrets are present, the Docker publishing workflow triggers the Coolify deploy webhook after pushing the GHCR image.

## License

MIT
