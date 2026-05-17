import { readSourceCache } from "./repoCacheStore.js";
import { DEFAULT_CACHE_TTL_MS, refreshSourceApps } from "./repoClient.js";
import type { SourceDefinition } from "./sources.js";

const DEFAULT_REFRESH_CONCURRENCY = 6;
const DEFAULT_REFRESH_JITTER_MS = 90 * 60 * 1000;

type RefreshWorkerOptions = {
  ttlMs?: number;
  concurrency?: number;
  jitterMs?: number;
};

function getPositiveNumberEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function getRefreshOptions(options: RefreshWorkerOptions = {}): Required<RefreshWorkerOptions> {
  const configuredTtlHours = Number(process.env.REPO_CACHE_TTL_HOURS);
  const ttlMs =
    options.ttlMs ??
    (Number.isFinite(configuredTtlHours) && configuredTtlHours > 0
      ? Math.trunc(configuredTtlHours * 60 * 60 * 1000)
      : DEFAULT_CACHE_TTL_MS);

  return {
    ttlMs,
    concurrency: options.concurrency ?? getPositiveNumberEnv("REPO_REFRESH_CONCURRENCY", DEFAULT_REFRESH_CONCURRENCY),
    jitterMs: options.jitterMs ?? getPositiveNumberEnv("REPO_REFRESH_JITTER_MINUTES", DEFAULT_REFRESH_JITTER_MS / 60_000) * 60_000
  };
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

function shouldRefreshSource(source: SourceDefinition): boolean {
  const cache = readSourceCache(source);
  return !cache || cache.isExpired;
}

export async function refreshDueSources(
  sources: SourceDefinition[],
  options: RefreshWorkerOptions = {}
): Promise<void> {
  const resolvedOptions = getRefreshOptions(options);
  const dueSources = sources.filter(shouldRefreshSource);

  if (dueSources.length === 0) {
    return;
  }

  console.log(`Refreshing ${dueSources.length} source cache entr${dueSources.length === 1 ? "y" : "ies"}...`);

  await mapWithConcurrency(dueSources, resolvedOptions.concurrency, async (source) => {
    try {
      await refreshSourceApps(source, resolvedOptions.ttlMs);
      console.log(`Refreshed source cache: ${source.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not refresh source cache ${source.id}: ${message}`);
    }
  });
}

export function startRepoRefreshWorker(sources: SourceDefinition[], options: RefreshWorkerOptions = {}): void {
  if (process.env.REPO_REFRESH_DISABLED === "true") {
    return;
  }

  const resolvedOptions = getRefreshOptions(options);

  function scheduleNextRun(): void {
    const jitter = Math.floor(Math.random() * resolvedOptions.jitterMs);
    const timer = setTimeout(() => {
      void refreshDueSources(sources, resolvedOptions).finally(scheduleNextRun);
    }, resolvedOptions.ttlMs + jitter);

    timer.unref();
  }

  void refreshDueSources(sources, resolvedOptions).finally(scheduleNextRun);
}
