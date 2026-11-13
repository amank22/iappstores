# Agent Guide

## Project Overview

`iappstores` is a workspace for browsing iOS app repository metadata, split into two independently deployed services plus a shared contracts package:

- `apps/api-go` - Go API: repository fetching, normalization, SQLite (FTS5) caching, App Store enrichment. Its own Go module, not a Bun/npm workspace member.
- `apps/web` - Next.js App Router UI, Tailwind CSS, shadcn-style local UI components, client-side browsing/search/filtering. Talks to `apps/api-go` over HTTP.
- `packages/contracts` - shared zod schemas and inferred TypeScript types describing the API's wire format, used by the web app for request/response validation. `apps/api-go` is a hand-maintained Go mirror of the same shapes (see its `internal/contracts` package) rather than a consumer of this package directly.

`apps/api` (the original Node/Express, later Bun, implementation) has been retired and removed. It was replaced by `apps/api-go` to fix a persistent OOM issue: the old code kept the entire normalized catalog resident in memory (`catalogMaterializer.ts`) as a redundant duplicate of what was already in SQLite. The Go rewrite eliminates that pattern entirely — every request hydrates only the rows it needs from SQLite — which was the actual root cause, independent of runtime language.

Use Bun workspace commands for `apps/web`/`packages/contracts`. Use the Go toolchain directly for `apps/api-go`.

## Runtime And Environment

- `apps/api-go` is a standalone Go service; the web app is a separate Bun/Next.js service. They are deployed as two independent containers/services (e.g. two Coolify applications on the same Docker network), not bundled into one image.
- The API defaults to port `4000`; the web app defaults to port `3000`.
- Both runtime images are distroless (`oven/bun:*-distroless` for the web app, `gcr.io/distroless/static-debian13` for the API): no shell, package manager, curl or wget. Health checks are exec-form (`bun -e fetch(...)` and `/app/api healthcheck`), so any platform-level health check that runs a shell command inside the container (e.g. Coolify's built-in one) must stay disabled. Debug with `docker cp`/`docker logs`, not `docker exec sh`.
- Monitoring: `monitoring/gatus` (config in `config.yaml`) runs as its own Coolify app on the same Docker network. It checks the API and web containers by their network aliases (`iappstores-api-go`, `iappstores-web`) plus the public URLs, and serves the status page. Config changes need a redeploy of that Coolify app.
- The web image uses Next's standalone output (enabled by `NEXT_OUTPUT=standalone` in the Dockerfile) and runs as the distroless `nonroot` user (65532). The API image runs as root because the existing `/data` volume is root-owned.
- In local development, `bun run dev` builds contracts first, then runs the web app. Run `apps/api-go` separately (`cd apps/api-go && go run ./cmd/api`).
- Next.js rewrites `/api/:path*` to `API_INTERNAL_URL`, which must point at wherever `apps/api-go` is reachable (its Docker network alias in production, `http://127.0.0.1:4000` for local dev if you're running it there).
- Persistent cache data for `apps/api-go` defaults to `.data/iappstores.sqlite`; Docker sets `DATA_DIR=/data`. Mount a real volume in production — without one, the whole catalog is re-fetched from scratch on every restart.

Useful environment variables (mostly consumed by `apps/api-go` now; `apps/web` only needs `API_INTERNAL_URL`, `SITE_URL`, `NEXT_PUBLIC_SITE_URL`):

- `API_PORT`, `CORS_ORIGIN`, `API_INTERNAL_URL`
- `SITE_URL`, `NEXT_PUBLIC_SITE_URL`
- `DATA_DIR`, `REPO_CACHE_DB_PATH`
- `REPO_CACHE_TTL_HOURS`, `REPO_REFRESH_CONCURRENCY`, `REPO_REFRESH_DISABLED`
- `REPO_TREE_FETCH_CONCURRENCY`
- `APP_STORE_COUNTRY`, `APP_STORE_FALLBACK_COUNTRIES`
- `APP_STORE_LOOKUP_DELAY_MS`, `APP_STORE_CACHE_TTL_DAYS`, `APP_STORE_NEGATIVE_CACHE_TTL_DAYS`
- `APP_STORE_ENRICHMENT_DISABLED`
- `GOMEMLIMIT`, `GOGC` - GC tuning for `apps/api-go`; keep `GOMEMLIMIT` around 35-40% of the container's memory limit.
- Diagnostics (all optional, see "Diagnosing Slow Responses"): `SLOW_REQUEST_MS`, `DIAGNOSTICS_CAPTURE_MS`, `DIAGNOSTICS_INFLIGHT`, `DIAGNOSTICS_COOLDOWN_MINUTES`, `DIAGNOSTICS_DIR`, `STATS_LOG_SECONDS`, `STATS_LOG_DISABLED`, `PPROF_ADDR` (API); `SLOW_API_MS`, `STATS_LOG_SECONDS`, `STATS_LOG_DISABLED` (web).

- Sponsor slots (see "Sponsor Slots"): `SPONSOR_SLOTS`, `SPONSOR_PRICE_USD`, `SPONSOR_AUTO_APPROVE`, `SPONSOR_ADMIN_TOKEN`, `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `DODO_PAYMENTS_ENVIRONMENT`, `DODO_SPONSOR_PRODUCT_ID`, and `SITE_URL` (API, for the checkout return link).

Translation (`/api/translate`, `TRANSLATION_DISABLED`) no longer exists — it was dropped in the Go rewrite since its dependency (`@vitalets/google-translate-api`, an unofficial scrape) had no Go equivalent. The frontend links out to Google Translate directly instead.

## Architecture Notes

- Shared contracts live in `packages/contracts/src/index.ts`. Add or change API shapes there first (for the web app's consumption), then update the equivalent Go struct in `apps/api-go/internal/contracts` and the web app's consumers. There's no automated sync between the two — keep them in lockstep by hand.
- `apps/api-go` request parsing/response validation replicates the zod schemas' coercion rules by hand (numeric clamping, boolean string parsing, etc.) rather than sharing code with `packages/contracts`.
- Repository sources are configured in `apps/api-go/internal/sources/sources.go`.
- Normalization lives in `apps/api-go/internal/normalizer`. It accepts AltStore-style `apps[]`, derives a stable app id, category, latest version, download option, and searchable text — ported faithfully from the original TypeScript, including locale-aware name sorting (`golang.org/x/text/collate`, not a naive byte compare).
- Apps with the same bundle identifier are grouped; grouped records use ids like `bundle:com.example.app` and keep all source download options.
- All persistence lives in one shared SQLite database (`apps/api-go/internal/dbconn`) accessed through a single `*sql.DB` connection pool — not four separate handles like the original TS code. `apps/api-go/internal/catalog` owns the catalog schema (with FTS5 search and missing/removed lifecycle rules), `internal/repo` owns the raw per-source cache, `internal/appstore` owns App Store metadata caching, `internal/downloads` owns download analytics.
- App Store metadata is cached in the same SQLite database. Cached hits attach immediately; missing or expired lookups are queued and refreshed slowly in the background (goroutine + channel) to avoid Apple lookup rate limits.
- The `json-ipa-repos` source is special: it can expand a GitHub tree into many child JSON repos. The checked-in local tree manifest is `apps/api-go/internal/sources/data/json-ipa-repos.json`.
- SQLite is the source of truth; most reads (app detail, developer pages, facets, source-filtered lists) query just the rows they need. The one exception is `catalog.Store`'s active-app snapshot (`ActiveSnapshot`, since #24): an immutable in-memory list of all active apps (~15MB of JSON for ~5k apps) plus, computed once per snapshot, the index order for each browse sort (`recent`, `name-asc`, `name-desc`; a few KB each) and the whole-catalog category facets. Unfiltered `/api/apps` and empty-query `/api/search` walk a precomputed order, filter, and copy out one page (`ActiveApps.Browse`), so they never sort or query SQLite; they take well under a millisecond. Only the first read loads the snapshot in a request; after that `SyncSourceCatalog` rebuilds it in the background refresh goroutine and swaps it in, so requests never wait on a reload. Rebuilds are serialized, so at most one extra copy exists at a time. Don't add further full-catalog caches without weighing memory: the original TS `catalogMaterializer.ts` OOMed by keeping several.
- Don't compute whole-catalog aggregates in SQL per request. `SELECT category, COUNT(*) ... WHERE status = 'active' GROUP BY category` can't be answered from an index, so it read every active row, `app_json` included (~15MB), on every `/api/apps` call; that was the main cost behind 1-8s homepage responses. Precompute such values in the snapshot instead.
- Recommendations (`/api/apps/{appId}/recommendations`, `httpapi/recommendations.go`) score every app against the target from a `recommendationIndex`: token ids, developer names and identity lookups built once per catalog snapshot (and every 30 minutes, for new App Store metadata) in a background goroutine, so a request is a few integer set intersections (~1-2ms). The old version tokenized both apps' descriptions inside the sort comparator and enriched the whole catalog per request: 1-4s each when idle, and minutes each once crawlers ran 30+ app pages at once, which filled the API's 2GB memory limit and stalled every other endpoint (Nov 2026 alerts). Keep per-request work proportional to the result, not the catalog.
- The web app caps server-side API calls (`lib/api.ts`): 30s by default, 3s for recommendations, which app pages render without. A slow API call must never hold a server-rendered page indefinitely.
- Sorting (`normalizer.SortApps`/`SortOrder`) precomputes each app's parsed date and collation key, then compares integers and bytes. Don't call `parseLenientDate`, `BaseCompare` or `DefaultCompare` inside a sort comparator; that made each 5k-app sort ~10x slower. Collators come from a `sync.Pool` (a `collate.Collator` isn't safe for concurrent use); a single collator behind a mutex serialized every concurrent request's sort.
- The SQLite pool (`internal/dbconn`) has 8 connections. A source refresh holds several in write transactions; with 4, user reads queued behind it for seconds. Per-connection pragmas belong in the DSN, since `db.Exec("PRAGMA ...")` only reaches one pooled connection.

## Sponsor Slots

The home page sells a fixed number of sponsor slots (`SPONSOR_SLOTS`, default 4) as a monthly Dodo Payments subscription. `apps/api-go/internal/sponsors` owns the data (tables in `migrations/0003_sponsors.sql`) and the Dodo client; `internal/httpapi/sponsors.go` has the routes; the web side is `components/sponsor-strip.tsx`, `/sponsor` (buy or join the waitlist), `/sponsor/thanks` (Dodo's return URL) and `/sponsor/admin`.

- A listing moves through `checkout` (slot held for 30 minutes while the buyer pays) -> `pending_review` -> `live`, and ends as `ended` or `rejected`. `paused` is a failed renewal: hidden, slot kept. Nothing is shown until an admin approves it, unless `SPONSOR_AUTO_APPROVE=true`.
- Slots are counted in the same transaction that takes one, so two buyers can't get the last slot. When all are taken, checkout answers 409 and the page offers the waitlist. A payment that lands after its hold expired and the slot was sold becomes `queued` (logged as `sponsors: OVERSOLD`); it gets the next free slot, or end it and refund.
- `POST /api/sponsors/webhook` is the only thing that marks a listing paid. It verifies the Standard Webhooks signature, ignores events for any product other than `DODO_SPONSOR_PRODUCT_ID` (the Dodo account sells other things), and acts on the subscription's `status` field rather than the event name. A cancelled subscription stays live until the period already paid for ends.
- Checkout is off (`checkoutEnabled: false`, waitlist only) until the API key, product id and webhook secret are all set. `DODO_PAYMENTS_ENVIRONMENT` must be `live_mode` to take real payments; anything else uses Dodo's test API.
- Admin endpoints (`/api/sponsors/admin...`) need `Authorization: Bearer $SPONSOR_ADMIN_TOKEN` and answer 404 when the token is unset. Rejecting or ending a listing cancels its Dodo subscription; refunds are manual in the Dodo dashboard.
- Tiles link through `GET /api/sponsors/{id}/go`, which counts the click and redirects. Sponsor links carry `rel="sponsored nofollow"`. The strip's order is reshuffled per page render because every slot costs the same.
- Unsold slots show the CorrectMyPaper house ad and a "Your app here" tile (`layoutSponsorStrip` in `apps/web/src/lib/sponsors.ts`).

## Diagnosing Slow Responses

When Gatus alerts on response time (`[RESPONSE_TIME]` emails), read the container logs for the alert's time window (Coolify app logs, or `docker logs`). Both services log enough to tell a slow API, a slow web process, and a busy or starved machine apart:

- API (`apps/api-go/internal/diagnostics`):
  - `stats:` line every minute: request count, 4xx/5xx, p50/p95/p99/max latency and the slowest request, max concurrent requests, the three routes with the most total time; then process CPU (% of one core), host CPU, `steal` (time the VPS's hypervisor gave our vCPUs to other tenants), `iowait`, load average, container CPU throttling (only when it happened), RSS, heap, goroutines, GC cycles and pause.
  - `slow request:` line for each request over `SLOW_REQUEST_MS` (default 1000), with status, size, concurrency and user agent; at most 30 per minute (`slow_logs_suppressed=` in the stats line counts the rest).
  - `diagnostics:` lines for an incident capture, triggered by a request over `DIAGNOSTICS_CAPTURE_MS` (default 3000) or `DIAGNOSTICS_INFLIGHT` (default 32) concurrent requests, at most once per `DIAGNOSTICS_COOLDOWN_MINUTES` (default 15). It samples goroutine stacks for ~10s and logs where request goroutines are (running, waiting on a lock, waiting on a DB connection, ...) plus a system sample, and writes `cpu.pprof`, `heap.pprof`, `goroutines.txt` and `summary.json` (recent slow requests included) to `DIAGNOSTICS_DIR` (default `/data/diagnostics/<UTC time>/`, last 10 kept). Fetch them with `docker cp` and read profiles with `go tool pprof -top <api binary> cpu.pprof`.
  - `Finished refreshing N source cache entries in ...`, to line slow spells up with source refreshes; `Rebuilt active-app cache ...` when a rebuild takes over a second.
  - `PPROF_ADDR` (e.g. `:6060`) serves `net/http/pprof` on a separate listener for live profiling from inside the Docker network. Off by default; never route it publicly.
- Web (`apps/web/src/lib/server-diagnostics.ts`, started from `src/instrumentation.ts`):
  - `[slow-api]` / `[api-error]` for server-side API calls over `SLOW_API_MS` (default 1000) or failing.
  - `[web-stats]` every minute: API call count, failures, p50/p95/max, event-loop lag (a blocked render shows up here), RSS, heap, load average.

Reading them: high `steal` or host CPU with low `cpu_proc` means the machine (or a neighbour) is the problem, not the app; high `cpu_proc` with high p95 points at the API's own work (see the capture's goroutines and `cpu.pprof`); `[slow-api]` lines in the web log without matching `slow request:` lines in the API log point at the network between the containers or at the web process (check `event_loop_lag_max`).

## API Surface

Routes in `apps/api-go` (see `internal/httpapi`):

- `GET /health`
- `GET /api/sources`
- `GET /api/apps`
- `GET /api/apps/:appId`
- `GET /api/sources/:sourceId/apps`
- `GET /api/search`
- `GET /api/sitemap/apps`
- `GET /api/sponsors`, `POST /api/sponsors/checkout`, `POST /api/sponsors/waitlist`, `POST /api/sponsors/webhook`, `GET /api/sponsors/{id}/go`, `GET /api/sponsors/admin`, `POST /api/sponsors/admin/{id}/{approve|reject|end}`

(No `POST /api/translate` — dropped, see above.)

Query behavior is defined in contracts:

- `page` defaults to `1`; `pageSize` defaults to `24` and maxes at `60`.
- `category` is one of `all`, `recent`, `games`, `tools`, `media`, `education`.
- `iosVersion` accepts `1`, `1.2`, or `1.2.3`; `iosVersionOperator` defaults to `lte`.
- `includeAppStore` defaults to `true`.

## Frontend Notes

- The home page (`apps/web/src/app/page.tsx`) loads its first page on the server and hands it to `components/home-client.tsx`. It keeps search, source, category, and iOS filters in URL query params and uses incremental loading.
- Keep the home page's first screen short: heading, search, one row of categories, the sponsor strip, then apps. Source, sort and iOS version live behind the "Filters" button in `components/app-browser.tsx` (shared with the category, repository and developer pages).
- App detail pages live at `apps/web/src/app/apps/[appId]/page.tsx` and fetch from the API server side for metadata and Open Graph output.
- API calls are centralized in `apps/web/src/lib/api.ts`; responses are parsed with shared zod schemas from `packages/contracts`.
- Site URL helpers are in `apps/web/src/lib/site.ts`; keep `SITE_URL` and `NEXT_PUBLIC_SITE_URL` aligned for production metadata, sitemap, and robots output.
- UI components under `apps/web/src/components/ui` are local shadcn-style primitives. Prefer existing components and existing visual density over introducing new design systems.
- Remote repository/App Store images use plain `<img>` intentionally, so avoid adding Next image domain config unless there is a clear reason.
- `app-card.tsx`'s translation affordance is now a plain external link to Google Translate (`getTranslateUrl`) — there is no in-app translation call anymore.

## Adding Or Updating Sources

- Add curated sources in `apps/api-go/internal/sources/sources.go` with stable lowercase ids.
- Prefer validated AltStore-compatible JSON URLs. Some sources are archived or raw GitHub URLs; keep `website` pointing to the human-facing page when possible.
- For GitHub tree aggregation, use the `github-tree` kind and set a local tree manifest when one should avoid fetching the tree listing during runtime/tests.
- If changing source behavior or normalization, update the corresponding Go test in `apps/api-go/internal/normalizer` or `apps/api-go/internal/repo`.

## Verification Commands

Run targeted checks while developing, and run the full CI-equivalent set before handing off broad changes.

```sh
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

```sh
cd apps/api-go
go build ./...
go vet ./...
go test -race ./...
```

Notes:

- `bun run typecheck`/`lint`/`test`/`build` now only cover `packages/contracts` and `apps/web` — `apps/api-go` is verified separately with the Go toolchain (also wired into CI as a separate job).
- `bun run test` runs Vitest for `apps/web/src/**/*.test.ts`.
- CI (`.github/workflows/verify.yml`) runs both the Bun-based `verify` job and the Go-based `verify-api-go` job on PRs and pushes to `main`.

## Deployment Notes

- `apps/web` and `apps/api-go` are two separate deployable images/services, each with its own memory limit — not one combined container. This was a deliberate change from the original single-container design specifically so a memory issue in one service can't take down the other and can be capped/monitored independently.
- `apps/web`'s Dockerfile builds and runs only the Next.js app; it no longer bundles or starts the API.
- `apps/web` needs `API_INTERNAL_URL` pointing at wherever `apps/api-go` is reachable (its Docker network alias in production).
- `apps/api-go` needs a persistent volume mounted at `/data` (`DATA_DIR`) so `iappstores.sqlite` survives deploys and restarts; without one, every deploy wipes the catalog and forces a full re-fetch of all sources.
- `apps/api-go` should run with `GOMEMLIMIT`/`GOGC` set (see above) — validated to keep steady-state memory well under typical container limits.
- Health checks: `apps/web` on port `3000` at `/health`; `apps/api-go` on port `4000` at `/health`.
- GitHub Actions publishes the web app's GHCR image after `Verify` succeeds on `main`, with tags `latest` and `sha-<commit>`. `apps/api-go` currently deploys by building its Dockerfile directly from git rather than via a published registry image.

## Coding Conventions

- `apps/web`/`packages/contracts`: keep TypeScript strict and ESM-compatible.
- `apps/api-go`: idiomatic Go, package boundaries mirror the original TS module boundaries (see Architecture Notes above). Avoid adding new full-catalog in-memory caches (see Architecture Notes).
- Prefer shared contract schemas (`packages/contracts`) over duplicated request/response types on the web side; keep the Go structs in `apps/api-go/internal/contracts` in sync by hand when the wire format changes.
- Keep repository notes intact. App Store metadata should augment repository data, not replace the repository title, notes, or download options.
- Avoid blocking user-facing API responses on slow external App Store lookups; use cached metadata and background queueing.
- Use deterministic ids for sources and normalized apps. Existing grouped app URLs rely on bundle identifiers where available.
- Go tests that touch SQLite should use `t.TempDir()` and an explicitly injected `*sql.DB`/path, with `defer db.Close()` in cleanup.
