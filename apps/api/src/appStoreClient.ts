import { z } from "zod";
import type { AppDto, AppStoreMetadata } from "@iappstores/contracts";
import {
  readAppStoreCache,
  writeAppStoreCacheError,
  writeAppStoreCacheHit,
  writeAppStoreCacheMiss
} from "./appStoreCacheStore.js";

type AnyRecord = Record<string, unknown>;

type LookupJob = {
  country: string;
  bundleId: string;
};

const DEFAULT_COUNTRY = "us";
const DEFAULT_LOOKUP_DELAY_MS = 3_500;
const DEFAULT_CACHE_TTL_DAYS = 30;
const DEFAULT_NEGATIVE_CACHE_TTL_DAYS = 7;
const FETCH_TIMEOUT_MS = 10_000;

const AppleLookupResponseSchema = z.object({
  resultCount: z.number(),
  results: z.array(z.record(z.unknown()))
});

const lookupQueue: LookupJob[] = [];
const queuedKeys = new Set<string>();
let isProcessingQueue = false;
let lastLookupStartedAt = 0;

function isDisabled(): boolean {
  return process.env.APP_STORE_ENRICHMENT_DISABLED === "true";
}

function getPositiveNumberEnv(name: string, defaultValue: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function getTtlMs(): number {
  return getPositiveNumberEnv("APP_STORE_CACHE_TTL_DAYS", DEFAULT_CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000;
}

function getNegativeTtlMs(): number {
  return getPositiveNumberEnv("APP_STORE_NEGATIVE_CACHE_TTL_DAYS", DEFAULT_NEGATIVE_CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000;
}

function sanitizeCountry(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : DEFAULT_COUNTRY;
}

export function getAppStoreCountry(): string {
  return sanitizeCountry(process.env.APP_STORE_COUNTRY);
}

function getFallbackCountries(primaryCountry: string): string[] {
  return (process.env.APP_STORE_FALLBACK_COUNTRIES ?? "")
    .split(",")
    .map((country) => country.trim().toLowerCase())
    .filter((country) => /^[a-z]{2}$/.test(country))
    .filter((country, index, countries) => country !== primaryCountry && countries.indexOf(country) === index);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonNegativeInteger(value: unknown): number | null {
  const number = asNumber(value);
  return number !== null && number >= 0 ? Math.trunc(number) : null;
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const text = asString(item);
    return text ? [text] : [];
  });
}

function asUrlArray(value: unknown): string[] {
  return asStringArray(value).flatMap((item) => {
    const url = asUrl(item);
    return url ? [url] : [];
  });
}

function toAppStoreMetadata(result: AnyRecord, country: string, now = Date.now()): AppStoreMetadata | null {
  const bundleId = asString(result.bundleId);
  const trackId = asNonNegativeInteger(result.trackId);
  const trackViewUrl = asUrl(result.trackViewUrl);
  const name = asString(result.trackName ?? result.trackCensoredName);

  if (!bundleId || !trackId || !trackViewUrl || !name) {
    return null;
  }

  return {
    country,
    bundleId,
    trackId,
    trackViewUrl,
    name,
    developerName: asString(result.artistName ?? result.sellerName),
    description: asString(result.description),
    artworkUrl60: asUrl(result.artworkUrl60),
    artworkUrl100: asUrl(result.artworkUrl100),
    artworkUrl512: asUrl(result.artworkUrl512),
    screenshotUrls: asUrlArray(result.screenshotUrls),
    ipadScreenshotUrls: asUrlArray(result.ipadScreenshotUrls),
    genres: asStringArray(result.genres),
    primaryGenreName: asString(result.primaryGenreName),
    averageUserRating: asNumber(result.averageUserRating),
    userRatingCount: asNonNegativeInteger(result.userRatingCount),
    formattedPrice: asString(result.formattedPrice),
    price: asNumber(result.price),
    version: asString(result.version),
    minimumOsVersion: asString(result.minimumOsVersion),
    releaseNotes: asString(result.releaseNotes),
    currentVersionReleaseDate: asString(result.currentVersionReleaseDate),
    contentAdvisoryRating: asString(result.contentAdvisoryRating ?? result.trackContentRating),
    fetchedAt: now
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForRateLimit(): Promise<void> {
  const delayMs = getPositiveNumberEnv("APP_STORE_LOOKUP_DELAY_MS", DEFAULT_LOOKUP_DELAY_MS);
  const waitMs = Math.max(0, lastLookupStartedAt + delayMs - Date.now());
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastLookupStartedAt = Date.now();
}

async function fetchAppStoreLookup(bundleId: string, country: string): Promise<AppStoreMetadata | null> {
  await waitForRateLimit();

  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("bundleId", bundleId);
  url.searchParams.set("country", country);

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
      throw new Error(`App Store lookup returned ${response.status} ${response.statusText}`);
    }

    const payload = AppleLookupResponseSchema.parse(await response.json());
    if (payload.resultCount === 0) {
      return null;
    }

    return payload.results.flatMap((result) => toAppStoreMetadata(result, country) ?? [])[0] ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupWithFallbacks(bundleId: string, primaryCountry: string): Promise<AppStoreMetadata | null> {
  for (const country of [primaryCountry, ...getFallbackCountries(primaryCountry)]) {
    const metadata = await fetchAppStoreLookup(bundleId, country);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

async function processLookupQueue(): Promise<void> {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  while (lookupQueue.length > 0) {
    const job = lookupQueue.shift()!;
    const key = `${job.country}:${job.bundleId}`;
    queuedKeys.delete(key);

    const cache = readAppStoreCache(job.country, job.bundleId);
    if (cache && !cache.isExpired) {
      continue;
    }

    try {
      const metadata = await lookupWithFallbacks(job.bundleId, job.country);
      if (metadata) {
        writeAppStoreCacheHit(job.country, job.bundleId, metadata, getTtlMs());
      } else {
        writeAppStoreCacheMiss(job.country, job.bundleId, getNegativeTtlMs());
      }
    } catch (error) {
      writeAppStoreCacheError(job.country, job.bundleId, error, getNegativeTtlMs());
    }
  }

  isProcessingQueue = false;
}

export function queueAppStoreLookup(bundleId: string, country = getAppStoreCountry()): void {
  if (isDisabled()) {
    return;
  }

  const normalizedCountry = sanitizeCountry(country);
  const normalizedBundleId = bundleId.trim();
  if (normalizedBundleId.length === 0) {
    return;
  }

  const key = `${normalizedCountry}:${normalizedBundleId}`;
  if (queuedKeys.has(key)) {
    return;
  }

  queuedKeys.add(key);
  lookupQueue.push({ country: normalizedCountry, bundleId: normalizedBundleId });
  void processLookupQueue();
}

export function enrichAppsWithCachedAppStoreMetadata(apps: AppDto[], country = getAppStoreCountry()): AppDto[] {
  if (isDisabled()) {
    return apps;
  }

  const metadataByBundleId = new Map<string, AppStoreMetadata | null>();

  return apps.map((app) => {
    const bundleId = app.bundleIdentifier?.trim();
    if (!bundleId) {
      return app;
    }

    let metadata = metadataByBundleId.get(bundleId);
    if (metadata === undefined) {
      const cache = readAppStoreCache(country, bundleId);
      metadata = cache?.status === "hit" ? cache.metadata : null;
      metadataByBundleId.set(bundleId, metadata);

      if (!cache || cache.isExpired) {
        queueAppStoreLookup(bundleId, country);
      }
    }

    return metadata ? { ...app, appStore: metadata } : app;
  });
}
