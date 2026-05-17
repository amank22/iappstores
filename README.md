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
npm run build
npm run typecheck
npm run lint
npm run test
```

The root `rebuild` script cleans and rebuilds packages in dependency order, starting with shared contracts.
