import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDto, AppStoreMetadata } from "@iappstores/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enrichAppsWithCachedAppStoreMetadata } from "./appStoreClient.js";
import {
  closeAppStoreCacheStore,
  readAppStoreCache,
  writeAppStoreCacheError,
  writeAppStoreCacheHit,
  writeAppStoreCacheMiss
} from "./appStoreCacheStore.js";

const metadata: AppStoreMetadata = {
  country: "us",
  bundleId: "com.example.app",
  trackId: 123456789,
  trackViewUrl: "https://apps.apple.com/us/app/example-app/id123456789",
  name: "Example App",
  developerName: "Example Developer",
  description: "Official App Store description",
  artworkUrl60: "https://example.com/icon-60.png",
  artworkUrl100: "https://example.com/icon-100.png",
  artworkUrl512: "https://example.com/icon-512.png",
  screenshotUrls: ["https://example.com/screenshot.png"],
  ipadScreenshotUrls: [],
  genres: ["Utilities"],
  primaryGenreName: "Utilities",
  averageUserRating: 4.8,
  userRatingCount: 42,
  formattedPrice: "Free",
  price: 0,
  version: "2.0.0",
  minimumOsVersion: "16.0",
  releaseNotes: "Bug fixes",
  currentVersionReleaseDate: "2026-01-01T00:00:00Z",
  contentAdvisoryRating: "4+",
  fetchedAt: 1_000
};

const app: AppDto = {
  id: "test-source:com.example.app",
  sourceId: "test-source",
  sourceName: "Test Source",
  name: "Example App++",
  bundleIdentifier: "com.example.app",
  developerName: "Repo Developer",
  subtitle: "Unlocked",
  description: "Repository notes",
  category: "tools",
  iconUrl: null,
  appStoreUrl: null,
  screenshots: [],
  latestVersion: "1.0.0",
  versionDate: "2026-01-01",
  versionDescription: null,
  downloadURL: "https://example.com/app.ipa",
  size: 1234,
  minOSVersion: "15.0",
  downloadOptions: [
    {
      sourceId: "test-source",
      sourceName: "Test Source",
      latestVersion: "1.0.0",
      versionDate: "2026-01-01",
      downloadURL: "https://example.com/app.ipa",
      size: 1234,
      minOSVersion: "15.0"
    }
  ]
};

let tempDir: string;

beforeEach(() => {
  closeAppStoreCacheStore();
  tempDir = mkdtempSync(join(tmpdir(), "iappstores-appstore-cache-"));
  process.env.REPO_CACHE_DB_PATH = join(tempDir, "cache.sqlite");
  process.env.APP_STORE_COUNTRY = "us";
});

afterEach(() => {
  closeAppStoreCacheStore();
  delete process.env.REPO_CACHE_DB_PATH;
  delete process.env.APP_STORE_COUNTRY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("appStoreCacheStore", () => {
  it("persists and reads App Store metadata hits", () => {
    writeAppStoreCacheHit("us", "com.example.app", metadata, 60_000);

    const cached = readAppStoreCache("us", "com.example.app");

    expect(cached).toMatchObject({
      country: "us",
      bundleId: "com.example.app",
      status: "hit",
      isExpired: false
    });
    expect(cached?.metadata).toEqual(metadata);
  });

  it("records expired negative-cache misses", () => {
    writeAppStoreCacheMiss("us", "com.example.missing", 1, 1);

    const cached = readAppStoreCache("us", "com.example.missing");

    expect(cached).toMatchObject({
      status: "miss",
      metadata: null,
      isExpired: true
    });
  });

  it("records lookup errors with a retry TTL", () => {
    writeAppStoreCacheError("us", "com.example.app", new Error("rate limited"), 60_000, 2_000);

    const cached = readAppStoreCache("us", "com.example.app");

    expect(cached).toMatchObject({
      status: "error",
      lastError: "rate limited",
      lastErrorAt: 2_000
    });
  });

  it("attaches cached metadata while keeping repository fields intact", () => {
    writeAppStoreCacheHit("us", "com.example.app", metadata, 60_000);

    const [enriched] = enrichAppsWithCachedAppStoreMetadata([app], "us");

    expect(enriched).toMatchObject({
      name: "Example App++",
      description: "Repository notes",
      appStore: {
        name: "Example App",
        description: "Official App Store description",
        trackViewUrl: "https://apps.apple.com/us/app/example-app/id123456789"
      }
    });
  });
});
