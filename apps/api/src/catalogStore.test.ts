import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDto } from "@iappstores/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeCatalogStore, isSearchIndexAvailable, searchCatalogIds, syncSourceCatalog } from "./catalogStore.js";

function makeApp(overrides: Partial<AppDto> & Pick<AppDto, "id" | "bundleIdentifier" | "name">): AppDto {
  return {
    sourceId: "test-source",
    sourceName: "Test Source",
    developerName: "Example Dev",
    subtitle: null,
    description: null,
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
    ],
    versions: [],
    firstSeenAt: null,
    lastSeenAt: null,
    metadataUpdatedAt: null,
    lastUpdatedAt: null,
    canonicalId: null,
    canonicalStatus: "active",
    ...overrides
  };
}

let tempDir: string;

beforeEach(() => {
  closeCatalogStore();
  tempDir = mkdtempSync(join(tmpdir(), "iappstores-catalog-store-"));
  process.env.REPO_CACHE_DB_PATH = join(tempDir, "cache.sqlite");
});

afterEach(() => {
  closeCatalogStore();
  delete process.env.REPO_CACHE_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("catalogStore full-text search", () => {
  it("reports the search index as available in this environment", () => {
    expect(isSearchIndexAvailable()).toBe(true);
  });

  it("finds apps by name and ranks a name match above a description-only match", () => {
    const deltaByName = makeApp({
      id: "test-source:com.example.delta",
      bundleIdentifier: "com.example.delta",
      name: "Delta Emulator",
      description: "A general purpose retro gaming tool."
    });
    const deltaByDescription = makeApp({
      id: "test-source:com.example.other",
      bundleIdentifier: "com.example.other",
      name: "Utility Tool",
      description: "Not related to delta wave audio processing at all, just mentions it once."
    });

    syncSourceCatalog("test-source", [deltaByName, deltaByDescription]);

    const ids = searchCatalogIds("delta");

    expect(ids).toContain("com.example.delta");
    expect(ids).toContain("com.example.other");
    expect(ids.indexOf("com.example.delta")).toBeLessThan(ids.indexOf("com.example.other"));
  });

  it("supports prefix matching", () => {
    const app = makeApp({
      id: "test-source:com.example.provenance",
      bundleIdentifier: "com.example.provenance",
      name: "Provenance"
    });

    syncSourceCatalog("test-source", [app]);

    expect(searchCatalogIds("prov")).toContain("com.example.provenance");
  });

  it("does not throw on adversarial query input", () => {
    const app = makeApp({
      id: "test-source:com.example.safe",
      bundleIdentifier: "com.example.safe",
      name: "Safe App"
    });
    syncSourceCatalog("test-source", [app]);

    expect(() => searchCatalogIds('"weird* (query)) OR 1=1')).not.toThrow();
  });

  it("returns nothing for a blank query", () => {
    expect(searchCatalogIds("   ")).toEqual([]);
  });

  it("keeps a missing app searchable", () => {
    const app = makeApp({
      id: "test-source:com.example.fading",
      bundleIdentifier: "com.example.fading",
      name: "Fading App"
    });

    syncSourceCatalog("test-source", [app], 0);
    expect(searchCatalogIds("fading")).toContain("com.example.fading");

    // The app disappears from its only source. rebuildCanonical's "no snapshots left"
    // branch runs once, bumping missing_count to 1, which stays below the
    // missingCount >= 2 threshold, so status stays "active" (not yet "missing") and
    // the app is still searchable -- consistent with browse routes, which never
    // filter out "missing" apps either.
    syncSourceCatalog("test-source", [], 1);
    expect(searchCatalogIds("fading")).toContain("com.example.fading");
  });
});
