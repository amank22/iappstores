import type { AppDto } from "@iappstores/contracts";
import { normalizeAltStoreRepo } from "./normalizer.js";
import type { SourceDefinition } from "./sources.js";

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

type CachedRepo = {
  expiresAt: number;
  apps: AppDto[];
  raw: unknown;
};

const repoCache = new Map<string, CachedRepo>();

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Repository returned ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSourceApps(source: SourceDefinition, ttlMs = DEFAULT_CACHE_TTL_MS): Promise<AppDto[]> {
  const cached = repoCache.get(source.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.apps;
  }

  const raw = await fetchJson(source.url);
  const apps = normalizeAltStoreRepo(raw, source);
  repoCache.set(source.id, {
    expiresAt: Date.now() + ttlMs,
    apps,
    raw
  });

  return apps;
}

export function clearRepoCache(): void {
  repoCache.clear();
}

export function getCachedRawRepo(sourceId: string): unknown {
  return repoCache.get(sourceId)?.raw;
}
