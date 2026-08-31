import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDto } from "@iappstores/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureMaterializedCatalog, getMaterializedCatalog, requestMaterialization, resetMaterializerForTests } from "./catalogMaterializer.js";
import { closeCatalogStore } from "./catalogStore.js";
import { writeSourceCache } from "./repoCacheStore.js";
import { clearRepoCache } from "./repoClient.js";
import type { SourceDefinition } from "./sources.js";

const source: SourceDefinition = {
  id: "test-source",
  name: "Test Source",
  subtitle: "Test source",
  url: "https://example.com/repo.json",
  website: "https://example.com"
};

function makeApp(overrides: Partial<AppDto> & Pick<AppDto, "id" | "bundleIdentifier" | "name">): AppDto {
  return {
    sourceId: source.id,
    sourceName: source.name,
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
        sourceId: source.id,
        sourceName: source.name,
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
  vi.useFakeTimers();
  closeCatalogStore();
  clearRepoCache();
  resetMaterializerForTests();
  tempDir = mkdtempSync(join(tmpdir(), "iappstores-materializer-"));
  process.env.REPO_CACHE_DB_PATH = join(tempDir, "cache.sqlite");
});

afterEach(() => {
  vi.useRealTimers();
  closeCatalogStore();
  clearRepoCache();
  resetMaterializerForTests();
  delete process.env.REPO_CACHE_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("catalogMaterializer", () => {
  it("builds a materialized catalog with a byId lookup and category facets", async () => {
    const app = makeApp({ id: "test-source:com.example.app", bundleIdentifier: "com.example.app", name: "Example App" });
    writeSourceCache(source, [app], 60_000);

    const catalog = await ensureMaterializedCatalog([source]);

    expect(catalog.apps).toHaveLength(1);
    expect(catalog.byId.get("com.example.app")).toBeDefined();
    expect(catalog.byId.get(catalog.apps[0]!.id.toLowerCase())).toBeDefined();
    expect(catalog.categoryFacets.find((facet) => facet.id === "all")?.appCount).toBe(1);
  });

  it("coalesces rapid requestMaterialization calls into a single rebuild", async () => {
    const app = makeApp({ id: "test-source:com.example.app", bundleIdentifier: "com.example.app", name: "Example App" });
    writeSourceCache(source, [app], 60_000);

    requestMaterialization([source]);
    requestMaterialization([source]);
    requestMaterialization([source]);

    expect(getMaterializedCatalog()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(5_000);

    const catalog = getMaterializedCatalog();
    expect(catalog).toBeDefined();
    expect(catalog?.apps).toHaveLength(1);
  });

  it("builds synchronously via ensureMaterializedCatalog when nothing is materialized yet", async () => {
    const app = makeApp({ id: "test-source:com.example.app", bundleIdentifier: "com.example.app", name: "Example App" });
    writeSourceCache(source, [app], 60_000);

    expect(getMaterializedCatalog()).toBeUndefined();
    const catalog = await ensureMaterializedCatalog([source]);

    expect(catalog).toBe(getMaterializedCatalog());
  });
});
