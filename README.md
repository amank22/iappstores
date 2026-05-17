# iappstores

`iappstores` is a small npm workspace with a Node/Express API and a Next.js frontend for browsing iOS app store repository sources.

The v1 source list is defined in code and starts with the FastSign AltStore/SideStore-compatible lite repository:

- `https://fastsign.dev/repo.lite.altstore.json`

## Workspace

- `apps/api` - Express API, repo fetching, caching, and normalization.
- `apps/web` - Next.js App Router UI with Tailwind and shadcn-style components.
- `packages/contracts` - shared zod schemas and inferred TypeScript types.

## Scripts

```sh
npm install
npm run dev
npm run rebuild
npm run build
npm run typecheck
npm run lint
npm run test
npm run validate:sources
```

The root `rebuild` script cleans and rebuilds packages in dependency order, starting with shared contracts.

`validate:sources` reads `repolist.txt`, fetches each unique URL, checks whether it returns compatible AltStore-style JSON, and prints working/failing sources with app counts and sample apps.

## Docker

The Docker image runs both the Express API and the Next.js frontend in one container for simple Coolify deployment.

```sh
docker build -t iappstores .
docker run --rm -p 3000:3000 iappstores
```

The frontend is served on port `3000`. The API runs inside the same container on port `4000`, and Next.js proxies `/api/*` requests to it.

The API keeps a persistent SQLite cache for normalized repository data. In Docker, the cache lives at `/data/iappstores.sqlite`; mount a Coolify volume to `/data` so the cache survives deploys and restarts.

Optional cache settings:

```txt
DATA_DIR=/data
REPO_CACHE_TTL_HOURS=24
REPO_REFRESH_CONCURRENCY=6
```

For Coolify health checks, use:

```txt
Port: 3000
Path: /health
Expected status: 200
```

## CI and Publishing

GitHub Actions uses separate workflows for verification and publishing. `Verify` runs on pull requests and pushes to `main`; `Publish Docker image` runs after `Verify` succeeds on `main` and publishes to GitHub Container Registry as:

```txt
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
```

No repository secrets are required for the default GHCR publishing flow; it uses `GITHUB_TOKEN`.

## License

MIT
