import { readFile } from "node:fs/promises";
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
const DEFAULT_TREE_FETCH_CONCURRENCY = 8;

type CachedRepo = {
  expiresAt: number;
  apps: AppDto[];
  raw: unknown;
};

const repoCache = new Map<string, CachedRepo>();
const refreshes = new Map<string, Promise<AppDto[]>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

function getCacheTtlMs(): number {
  const configuredHours = Number(process.env.REPO_CACHE_TTL_HOURS);
  return Number.isFinite(configuredHours) && configuredHours > 0
    ? Math.trunc(configuredHours * 60 * 60 * 1000)
    : DEFAULT_CACHE_TTL_MS;
}

function getTreeFetchConcurrency(): number {
  const configured = Number(process.env.REPO_TREE_FETCH_CONCURRENCY);
  return Number.isFinite(configured) && configured > 0 ? Math.trunc(configured) : DEFAULT_TREE_FETCH_CONCURRENCY;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json, application/json",
        "user-agent": "iappstores-api/0.1"
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

function slugifySourcePart(value: string): string {
  return (
    value
      .replace(/\.json$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 96) || "repo"
  );
}

function fallbackSourceName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return (
    filename
      .replace(/\.json$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim() || path
  );
}

function getGithubTreeFetchUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("recursive", "1");
  return parsed.toString();
}

async function readGithubTreeFile(treeFile: string): Promise<unknown> {
  const treeFileUrl = new URL(`../sources/${treeFile}`, import.meta.url);
  return JSON.parse(await readFile(treeFileUrl, "utf8")) as unknown;
}

function getGithubRawUrlFromTreeUrl(treeUrl: string, path: string): string {
  const parsed = new URL(treeUrl);
  const match = parsed.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/(.+)$/);

  if (parsed.hostname !== "api.github.com" || !match) {
    throw new Error(`Unsupported GitHub tree URL: ${treeUrl}`);
  }

  const [, owner, repo, ref] = match;
  const encodedOwner = encodeURIComponent(decodeURIComponent(owner));
  const encodedRepo = encodeURIComponent(decodeURIComponent(repo));
  const encodedRef = decodeURIComponent(ref)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `https://raw.githubusercontent.com/${encodedOwner}/${encodedRepo}/${encodedRef}/${encodedPath}`;
}

function extractJsonBlobPaths(treeJson: unknown): string[] {
  const tree = isRecord(treeJson) ? treeJson.tree : undefined;
  if (!Array.isArray(tree)) {
    throw new Error("GitHub tree response did not include tree[].");
  }

  return tree.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const path = asString(entry.path);
    const type = asString(entry.type);
    return path && type === "blob" && path.toLowerCase().endsWith(".json") ? [path] : [];
  });
}

function sourceFromGithubJsonPath(
  parent: SourceDefinition,
  path: string,
  url: string,
  repoJson: unknown
): SourceDefinition {
  const repo = isRecord(repoJson) ? repoJson : {};

  return {
    id: `${parent.id}:${slugifySourcePart(path)}`,
    name: asString(repo.name) ?? fallbackSourceName(path),
    subtitle: asString(repo.subtitle ?? repo.description) ?? parent.subtitle,
    url,
    website: asUrl(repo.website) ?? parent.website
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function fetchGithubTreeSourceApps(source: SourceDefinition): Promise<{ apps: AppDto[]; raw: unknown }> {
  const treeJson = source.treeFile
    ? await readGithubTreeFile(source.treeFile)
    : await fetchJson(getGithubTreeFetchUrl(source.url));
  const paths = extractJsonBlobPaths(treeJson);

  if (paths.length === 0) {
    throw new Error("GitHub tree response did not include any JSON blob paths.");
  }

  const results = await mapWithConcurrency(paths, getTreeFetchConcurrency(), async (path) => {
    const url = getGithubRawUrlFromTreeUrl(source.url, path);

    try {
      const raw = await fetchJson(url);
      const childSource = sourceFromGithubJsonPath(source, path, url, raw);
      return {
        apps: normalizeAltStoreRepo(raw, childSource),
        error: null
      };
    } catch (error) {
      return {
        apps: [],
        error
      };
    }
  });

  const apps = results.flatMap((result) => result.apps);
  const firstError = results.find((result) => result.error)?.error;

  if (apps.length === 0 && firstError) {
    throw new Error(
      `Could not fetch any JSON repos from GitHub tree: ${firstError instanceof Error ? firstError.message : String(firstError)}`
    );
  }

  return {
    apps,
    raw: treeJson
  };
}

async function fetchAltStoreSourceApps(source: SourceDefinition): Promise<{ apps: AppDto[]; raw: unknown }> {
  const raw = await fetchJson(source.url);
  return {
    apps: normalizeAltStoreRepo(raw, source),
    raw
  };
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
    const fetched =
      source.kind === "github-tree"
        ? await fetchGithubTreeSourceApps(source)
        : await fetchAltStoreSourceApps(source);
    const apps = fetched.apps;
    writeSourceCache(source, apps, ttlMs);
    writeMemoryCache(source.id, apps, Date.now() + ttlMs, fetched.raw);

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
