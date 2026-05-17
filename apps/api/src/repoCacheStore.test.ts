import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDto } from "@iappstores/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeRepoCacheStore,
  readSourceCache,
  writeSourceCache,
  writeSourceCacheError
} from "./repoCacheStore.js";
import type { SourceDefinition } from "./sources.js";

const source: SourceDefinition = {
  id: "test-source",
  name: "Test Source",
  subtitle: "Test source",
  url: "https://example.com/repo.json",
  website: "https://example.com"
};

const app: AppDto = {
  id: "test-source:com.example.app",
  sourceId: source.id,
  sourceName: source.name,
  name: "Example App",
  bundleIdentifier: "com.example.app",
  developerName: "Example Dev",
  subtitle: "Example",
  description: "Example app",
  category: "tools",
  iconUrl: null,
  appStoreUrl: "https://apps.apple.com/us/app/example-app/id123456789",
  screenshots: [],
  latestVersion: "1.0.0",
  versionDate: "2026-01-01",
  versionDescription: "Initial",
  downloadURL: "https://example.com/app.ipa",
  size: 1234,
  minOSVersion: "15.0",
  downloadOptions: [
    {
      sourceId: source.id,
      sourceName: source.name,
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
  closeRepoCacheStore();
  tempDir = mkdtempSync(join(tmpdir(), "iappstores-cache-"));
  process.env.REPO_CACHE_DB_PATH = join(tempDir, "cache.sqlite");
});

afterEach(() => {
  closeRepoCacheStore();
  delete process.env.REPO_CACHE_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("repoCacheStore", () => {
  it("persists and reads normalized source apps", () => {
    writeSourceCache(source, [app], 60_000);

    const cached = readSourceCache(source);

    expect(cached).toMatchObject({
      sourceId: source.id,
      sourceUrl: source.url,
      appCount: 1,
      isExpired: false
    });
    expect(cached?.expiresAt).toBeGreaterThan(Date.now());
    expect(cached?.apps).toEqual([app]);
  });

  it("marks expired rows and preserves stale data", () => {
    writeSourceCache(source, [app], 1, 1);

    const cached = readSourceCache(source);

    expect(cached?.isExpired).toBe(true);
    expect(cached?.apps).toEqual([app]);
  });

  it("ignores rows when the source URL changes", () => {
    writeSourceCache(source, [app], 60_000, 1_000);

    expect(readSourceCache({ ...source, url: "https://example.com/other.json" })).toBeNull();
  });

  it("records refresh errors without deleting cached apps", () => {
    writeSourceCache(source, [app], 60_000, 1_000);
    writeSourceCacheError(source, new Error("upstream failed"), 2_000);

    const cached = readSourceCache(source);

    expect(cached?.lastError).toBe("upstream failed");
    expect(cached?.lastErrorAt).toBe(2_000);
    expect(cached?.apps).toEqual([app]);
  });
});
