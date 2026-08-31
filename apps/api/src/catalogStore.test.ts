import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

  it("backfills the search index from pre-existing catalog rows written before FTS5 existed", () => {
    // Simulate a database that already has catalog_apps rows from before the search
    // index was introduced: write directly to catalog_apps via a raw connection,
    // bypassing syncSourceCatalog/rebuildCanonical (and therefore upsertSearchIndex).
    const app = makeApp({
      id: "test-source:com.example.legacy",
      bundleIdentifier: "com.example.legacy",
      name: "Legacy Holdover App"
    });
    const decorated = { ...app, canonicalId: "com.example.legacy", canonicalStatus: "active" as const };

    const raw = new DatabaseSync(process.env.REPO_CACHE_DB_PATH!);
    raw.exec(`
      CREATE TABLE IF NOT EXISTS catalog_apps (
        canonical_id TEXT PRIMARY KEY,
        app_json TEXT NOT NULL,
        metadata_hash TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        metadata_updated_at INTEGER NOT NULL,
        missing_since INTEGER,
        missing_count INTEGER NOT NULL DEFAULT 0,
        removed_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        replacement_id TEXT
      );
    `);
    raw
      .prepare(
        `INSERT INTO catalog_apps(canonical_id, app_json, metadata_hash, first_seen_at, last_seen_at, metadata_updated_at, status)
         VALUES (?, ?, 'hash', 0, 0, 0, 'active')`
      )
      .run("com.example.legacy", JSON.stringify(decorated));
    raw.close();

    // No syncSourceCatalog call has happened yet in this process, so the search index
    // has never been created or populated -- this is the first thing that touches it.
    expect(isSearchIndexAvailable()).toBe(true);
    expect(searchCatalogIds("legacy")).toContain("com.example.legacy");
  });
});
