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
```

The root `rebuild` script cleans and rebuilds packages in dependency order, starting with shared contracts.

## Docker

The Docker image runs both the Express API and the Next.js frontend in one container for simple Coolify deployment.

```sh
docker build -t iappstores .
docker run --rm -p 3000:3000 iappstores
```

The frontend is served on port `3000`. The API runs inside the same container on port `4000`, and Next.js proxies `/api/*` requests to it.

## Publishing

GitHub Actions verifies pull requests and pushes to `main`. On each `main` push, it builds and publishes the Docker image to GitHub Container Registry as:

```txt
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
```

No repository secrets are required for the default GHCR publishing flow; it uses `GITHUB_TOKEN`.

## License

MIT
