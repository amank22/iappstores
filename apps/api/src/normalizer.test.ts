import { SearchAppsQuerySchema } from "@iappstores/contracts";
import { describe, expect, it } from "vitest";
import {
  filterAppsByCategory,
  filterAppsByIosVersion,
  normalizeAltStoreRepo,
  paginateApps,
  searchApps
} from "./normalizer.js";
import type { SourceDefinition } from "./sources.js";

const source: SourceDefinition = {
  id: "fastsign-altstore",
  name: "FastSign Lite",
  subtitle: "AltStore and SideStore compatible FastSign repository",
  url: "https://fastsign.dev/repo.lite.altstore.json",
  website: "https://fastsign.dev"
};

describe("normalizeAltStoreRepo", () => {
  it("normalizes AltStore apps and latest version download links", () => {
    const apps = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "Example App",
            bundleIdentifier: "com.example.app",
            developerName: "Example Dev",
            subtitle: "Useful app",
            localizedDescription: "Long app description",
            iconURL: "https://example.com/icon.png",
            screenshots: ["https://example.com/screen.png"],
            versions: [
              {
                version: "1.0.0",
                date: "2024-01-01",
                localizedDescription: "Initial build",
                downloadURL: "https://example.com/app.ipa",
                size: 1234,
                minOSVersion: "15.0"
              }
            ]
          }
        ]
      },
      source
    );

    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: "fastsign-altstore:com.example.app",
      name: "Example App",
      bundleIdentifier: "com.example.app",
      category: "tools",
      latestVersion: "1.0.0",
      downloadURL: "https://example.com/app.ipa",
      minOSVersion: "15.0"
    });
  });

  it("searches across normalized app metadata", () => {
    const apps = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "Delta",
            bundleIdentifier: "com.rileytestut.Delta",
            developerName: "Riley Testut",
            versions: []
          }
        ]
      },
      source
    );

    expect(searchApps(apps, "riley delta")).toHaveLength(1);
    expect(searchApps(apps, "missing")).toHaveLength(0);
  });

  it("derives categories and paginates app lists", () => {
    const apps = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "Delta Emulator",
            bundleIdentifier: "com.example.delta",
            developerName: "Games Dev",
            versions: []
          },
          {
            name: "Signing Tool",
            bundleIdentifier: "com.example.sign",
            developerName: "Tools Dev",
            versions: []
          }
        ]
      },
      source
    );

    const games = filterAppsByCategory(apps, "games");
    const page = paginateApps(apps, { category: "all", iosVersionOperator: "lte", page: 1, pageSize: 1 });

    expect(games).toHaveLength(1);
    expect(page.apps).toHaveLength(1);
    expect(page.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasNextPage: true
    });
  });

  it("filters apps by minimum iOS version comparisons", () => {
    const apps = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "Older App",
            bundleIdentifier: "com.example.older",
            versions: [{ version: "1.0.0", minOSVersion: "14.0" }]
          },
          {
            name: "Newer App",
            bundleIdentifier: "com.example.newer",
            versions: [{ version: "1.0.0", minOSVersion: "17.2" }]
          },
          {
            name: "Unknown App",
            bundleIdentifier: "com.example.unknown",
            versions: []
          }
        ]
      },
      source
    );

    expect(
      filterAppsByIosVersion(apps, {
        category: "all",
        iosVersion: "16",
        iosVersionOperator: "lte",
        page: 1,
        pageSize: 24
      }).map((app) => app.name)
    ).toEqual(["Older App"]);
    expect(
      filterAppsByIosVersion(apps, {
        category: "all",
        iosVersion: "16",
        iosVersionOperator: "gte",
        page: 1,
        pageSize: 24
      }).map((app) => app.name)
    ).toEqual(["Newer App"]);
  });
});

describe("SearchAppsQuerySchema", () => {
  it("trims query params and keeps optional source ids", () => {
    expect(SearchAppsQuerySchema.parse({ q: "  delta  ", sourceId: " fastsign-altstore " })).toMatchObject({
      q: "delta",
      sourceId: "fastsign-altstore",
      page: 1,
      pageSize: 24,
      category: "all",
      iosVersionOperator: "lte"
    });
  });

  it("rejects missing search text", () => {
    expect(() => SearchAppsQuerySchema.parse({ q: "   " })).toThrow();
  });
});
