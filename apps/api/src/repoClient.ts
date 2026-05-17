import type { AppDto } from "@iappstores/contracts";
import { normalizeAltStoreRepo } from "./normalizer.js";
import {
  readSourceCache,
  writeSourceCache,
  writeSourceCacheError,
  type SourceCacheEntry
} from "./repoCacheStore.js";
import type { SourceDefinition } from "./sources.js";

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

type CachedRepo = {
  expiresAt: number;
  apps: AppDto[];
  raw: unknown;
};

const repoCache = new Map<string, CachedRepo>();
const refreshes = new Map<string, Promise<AppDto[]>>();

function getCacheTtlMs(): number {
  const configuredHours = Number(process.env.REPO_CACHE_TTL_HOURS);
  return Number.isFinite(configuredHours) && configuredHours > 0
    ? Math.trunc(configuredHours * 60 * 60 * 1000)
    : DEFAULT_CACHE_TTL_MS;
}

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

function writeMemoryCache(sourceId: string, apps: AppDto[], expiresAt: number, raw?: unknown): void {
  repoCache.set(sourceId, {
    expiresAt,
    apps,
    raw
  });
}

function hydrateMemoryFromSqlite(entry: SourceCacheEntry): void {
  writeMemoryCache(entry.sourceId, entry.apps, entry.expiresAt);
}

async function fetchAndPersistSourceApps(source: SourceDefinition, ttlMs: number): Promise<AppDto[]> {
  try {
    const raw = await fetchJson(source.url);
    const apps = normalizeAltStoreRepo(raw, source);
    writeSourceCache(source, apps, ttlMs);
    writeMemoryCache(source.id, apps, Date.now() + ttlMs, raw);

    return apps;
  } catch (error) {
    writeSourceCacheError(source, error);
    throw error;
  }
}

export function refreshSourceApps(source: SourceDefinition, ttlMs = getCacheTtlMs()): Promise<AppDto[]> {
  const currentRefresh = refreshes.get(source.id);
  if (currentRefresh) {
    return currentRefresh;
  }

  const refresh = fetchAndPersistSourceApps(source, ttlMs).finally(() => {
    refreshes.delete(source.id);
  });
  refreshes.set(source.id, refresh);

  return refresh;
}

export async function getSourceApps(source: SourceDefinition, ttlMs = getCacheTtlMs()): Promise<AppDto[]> {
  const cached = repoCache.get(source.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.apps;
  }

  const sqliteCache = readSourceCache(source);
  if (sqliteCache) {
    hydrateMemoryFromSqlite(sqliteCache);

    if (sqliteCache.isExpired) {
      void refreshSourceApps(source, ttlMs).catch(() => undefined);
    }

    return sqliteCache.apps;
  }

  return refreshSourceApps(source, ttlMs);
}

export function clearRepoCache(): void {
  repoCache.clear();
}

export function getCachedRawRepo(sourceId: string): unknown {
  return repoCache.get(sourceId)?.raw;
}
