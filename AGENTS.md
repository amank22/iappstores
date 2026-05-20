# Agent Guide

## Project Overview

`iappstores` is an npm workspace for browsing iOS app repository metadata. It has three main packages:

- `apps/api` - Node 22, Express, repository fetching, normalization, SQLite caching, App Store enrichment, translation, and API routes.
- `apps/web` - Next.js App Router UI, Tailwind CSS, shadcn-style local UI components, and client-side browsing/search/filtering.
- `packages/contracts` - shared zod schemas and inferred TypeScript types used by both the API and web app.

Use npm workspace commands. The repo includes a `pnpm-lock.yaml`, but the Dockerfile, README, and CI use npm with `package-lock.json`.

## Runtime And Environment

- Node 22 is expected. The API uses `node:sqlite`, so older Node versions are not suitable.
- The API defaults to port `4000`; the web app defaults to port `3000`.
- In local development, `npm run dev` builds contracts first, then runs API and web concurrently.
- Next.js rewrites `/api/:path*` to `API_INTERNAL_URL` or `http://127.0.0.1:4000`.
- Persistent cache data defaults to `.data/iappstores.sqlite`; Docker sets `DATA_DIR=/data`.

Useful environment variables:

- `API_PORT`, `WEB_PORT`, `CORS_ORIGIN`, `API_INTERNAL_URL`
- `SITE_URL`, `NEXT_PUBLIC_SITE_URL`
- `DATA_DIR`, `REPO_CACHE_DB_PATH`
- `REPO_CACHE_TTL_HOURS`, `REPO_REFRESH_CONCURRENCY`, `REPO_REFRESH_DISABLED`
- `REPO_TREE_FETCH_CONCURRENCY`
- `APP_STORE_COUNTRY`, `APP_STORE_FALLBACK_COUNTRIES`
- `APP_STORE_LOOKUP_DELAY_MS`, `APP_STORE_CACHE_TTL_DAYS`, `APP_STORE_NEGATIVE_CACHE_TTL_DAYS`
- `APP_STORE_ENRICHMENT_DISABLED`, `TRANSLATION_DISABLED`

## Architecture Notes

- Shared contracts live in `packages/contracts/src/index.ts`. Add or change API shapes there first, then update API/web consumers.
- API request parsing and response validation use zod schemas from `@iappstores/contracts`.
- Repository sources are configured in `apps/api/src/sources.ts`.
- Normalization lives in `apps/api/src/normalizer.ts`. It accepts AltStore-style `apps[]`, derives a stable app id, category, latest version, download option, and searchable text.
- Apps with the same bundle identifier are grouped by `groupAppsByBundleId`; grouped records use ids like `bundle:com.example.app` and keep all source download options.
- Repository data is cached in SQLite by `apps/api/src/repoCacheStore.ts`. Stale cache entries are served while a background refresh is queued.
- App Store metadata is cached separately in the same SQLite database by `apps/api/src/appStoreCacheStore.ts`. `enrichAppsWithCachedAppStoreMetadata` only attaches cached hits immediately; missing or expired lookups are queued and refreshed slowly to avoid Apple lookup rate limits.
- The `json-ipa-repos` source is special: it can expand a GitHub tree into many child JSON repos. The checked-in local tree manifest is `apps/api/sources/json-ipa-repos.json`.
- Translation is exposed via `/api/translate` and uses `@vitalets/google-translate-api`. Keep it optional because deployments may set `TRANSLATION_DISABLED=true`.

## API Surface

Main Express routes in `apps/api/src/index.ts`:

- `GET /health`
- `GET /api/sources`
- `GET /api/apps`
- `GET /api/apps/:appId`
- `GET /api/sources/:sourceId/apps`
- `GET /api/search`
- `GET /api/sitemap/apps`
- `POST /api/translate`

Query behavior is defined in contracts:

- `page` defaults to `1`; `pageSize` defaults to `24` and maxes at `60`.
- `category` is one of `all`, `recent`, `games`, `tools`, `media`, `education`.
- `iosVersion` accepts `1`, `1.2`, or `1.2.3`; `iosVersionOperator` defaults to `lte`.
- `includeAppStore` defaults to `true`.

## Frontend Notes

- The home page (`apps/web/src/app/page.tsx`) is a client component. It keeps search, source, category, and iOS filters in URL query params and uses incremental loading.
- App detail pages live at `apps/web/src/app/apps/[appId]/page.tsx` and fetch from the API server side for metadata and Open Graph output.
- API calls are centralized in `apps/web/src/lib/api.ts`; responses are parsed with shared zod schemas.
- Site URL helpers are in `apps/web/src/lib/site.ts`; keep `SITE_URL` and `NEXT_PUBLIC_SITE_URL` aligned for production metadata, sitemap, and robots output.
- UI components under `apps/web/src/components/ui` are local shadcn-style primitives. Prefer existing components and existing visual density over introducing new design systems.
- Remote repository/App Store images use plain `<img>` intentionally, so avoid adding Next image domain config unless there is a clear reason.

## Adding Or Updating Sources

- Add curated sources in `apps/api/src/sources.ts` with stable lowercase ids.
- Prefer validated AltStore-compatible JSON URLs. Some sources are archived or raw GitHub URLs; keep `website` pointing to the human-facing page when possible.
- For GitHub tree aggregation, use `kind: "github-tree"` and set `treeFile` when a local manifest should avoid fetching the tree listing during runtime/tests.
- If changing source behavior or normalization, update `apps/api/src/normalizer.test.ts` or `apps/api/src/repoClient.test.ts`.
- `npm run validate:sources` performs real network fetches from `repolist.txt`; treat it as a slower, network-dependent verification rather than a normal unit test.

## Verification Commands

Run targeted checks while developing, and run the full CI-equivalent set before handing off broad changes.

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Focused commands:

```sh
npm run build -w @iappstores/contracts
npm run typecheck -w @iappstores/api
npm run test -w @iappstores/api
npm run typecheck -w @iappstores/web
npm run build -w @iappstores/web
npm run validate:sources
```

Notes:

- `npm run typecheck` builds contracts first, then typechecks API and web.
- `npm run lint` is TypeScript `--noEmit` for API and web; there is no ESLint setup currently.
- `npm run test` runs Vitest for `apps/api/src/**/*.test.ts`; there is no frontend test runner currently.
- `npm run build` builds contracts, API, and web in dependency order.
- CI runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` on PRs and pushes to `main`.

## Deployment Notes

- The Docker image builds with Node 22 Alpine and runs API plus web in one container via `npm run start`.
- The container serves the frontend on `3000`; the API listens internally on `4000`.
- Docker sets `API_INTERNAL_URL=http://127.0.0.1:4000` so Next.js can proxy `/api/*`.
- Mount `/data` in production so `iappstores.sqlite` survives deploys and restarts.
- Health checks should use web port `3000` and path `/health`.
- GitHub Actions publishes GHCR images after `Verify` succeeds on `main`, with tags `latest` and `sha-<commit>`.

## Coding Conventions

- Keep TypeScript strict and ESM-compatible. Local imports in API code include `.js` extensions because emitted files run as ESM.
- Prefer shared contract schemas over duplicated request/response types.
- Keep repository notes intact. App Store metadata should augment repository data, not replace the repository title, notes, or download options.
- Avoid blocking user-facing API responses on slow external App Store lookups; use cached metadata and background queueing.
- Use deterministic ids for sources and normalized apps. Existing grouped app URLs rely on bundle identifiers where available.
- Tests that touch SQLite should use temporary `REPO_CACHE_DB_PATH` values and close cache stores in cleanup.
