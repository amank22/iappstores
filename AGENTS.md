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
- There is no in-memory full-catalog object graph anywhere in `apps/api-go` — every read (browse, search, developer pages, facets) queries SQLite directly for just the rows it needs. This is a deliberate architectural change from the original TS code's `catalogMaterializer.ts`, not an oversight; do not reintroduce a full-catalog cache without discussing the memory tradeoff it was removed to fix.

## API Surface

Routes in `apps/api-go` (see `internal/httpapi`):

- `GET /health`
- `GET /api/sources`
- `GET /api/apps`
- `GET /api/apps/:appId`
- `GET /api/sources/:sourceId/apps`
- `GET /api/search`
- `GET /api/sitemap/apps`

(No `POST /api/translate` — dropped, see above.)

Query behavior is defined in contracts:

- `page` defaults to `1`; `pageSize` defaults to `24` and maxes at `60`.
- `category` is one of `all`, `recent`, `games`, `tools`, `media`, `education`.
- `iosVersion` accepts `1`, `1.2`, or `1.2.3`; `iosVersionOperator` defaults to `lte`.
- `includeAppStore` defaults to `true`.

## Frontend Notes

- The home page (`apps/web/src/app/page.tsx`) is a client component. It keeps search, source, category, and iOS filters in URL query params and uses incremental loading.
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
- `apps/api-go`: idiomatic Go, package boundaries mirror the original TS module boundaries (see Architecture Notes above). Keep the "no full-catalog in memory" invariant when adding features.
- Prefer shared contract schemas (`packages/contracts`) over duplicated request/response types on the web side; keep the Go structs in `apps/api-go/internal/contracts` in sync by hand when the wire format changes.
- Keep repository notes intact. App Store metadata should augment repository data, not replace the repository title, notes, or download options.
- Avoid blocking user-facing API responses on slow external App Store lookups; use cached metadata and background queueing.
- Use deterministic ids for sources and normalized apps. Existing grouped app URLs rely on bundle identifiers where available.
- Go tests that touch SQLite should use `t.TempDir()` and an explicitly injected `*sql.DB`/path, with `defer db.Close()` in cleanup.
