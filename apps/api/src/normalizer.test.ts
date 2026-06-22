import { SearchAppsQuerySchema } from "@iappstores/contracts";
import { describe, expect, it } from "vitest";
import {
  filterAppsByCategory,
  filterAppsByIosVersion,
  groupAppsByBundleId,
  normalizeAltStoreRepo,
  paginateApps,
  searchApps,
  sortApps
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
            appStoreURL: "https://apps.apple.com/us/app/example-app/id123456789",
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
      appStoreUrl: "https://apps.apple.com/us/app/example-app/id123456789",
      latestVersion: "1.0.0",
      downloadURL: "https://example.com/app.ipa",
      minOSVersion: "15.0",
      downloadOptions: [
        expect.objectContaining({
          sourceId: "fastsign-altstore",
          sourceName: "FastSign Lite",
          downloadURL: "https://example.com/app.ipa"
        })
      ]
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
            name: "Arcade Game",
            bundleIdentifier: "com.example.arcade",
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
    const page = paginateApps(apps, { category: "all", sort: "recent", iosVersionOperator: "lte", page: 1, pageSize: 1 });

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

  it("derives more specific categories from app metadata", () => {
    const apps = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "RetroArch Emulator",
            bundleIdentifier: "com.example.emulator",
            versions: []
          },
          {
            name: "Chat Messenger",
            bundleIdentifier: "com.example.social",
            versions: []
          },
          {
            name: "Manga Reader",
            bundleIdentifier: "com.example.books",
            versions: []
          }
        ]
      },
      source
    );

    expect(filterAppsByCategory(apps, "emulators").map((app) => app.name)).toEqual(["RetroArch Emulator"]);
    expect(filterAppsByCategory(apps, "social").map((app) => app.name)).toEqual(["Chat Messenger"]);
    expect(filterAppsByCategory(apps, "books").map((app) => app.name)).toEqual(["Manga Reader"]);
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
        sort: "recent",
        iosVersion: "16",
        iosVersionOperator: "lte",
        page: 1,
        pageSize: 24
      }).map((app) => app.name)
    ).toEqual(["Older App"]);
    expect(
      filterAppsByIosVersion(apps, {
        category: "all",
        sort: "recent",
        iosVersion: "16",
        iosVersionOperator: "gte",
        page: 1,
        pageSize: 24
      }).map((app) => app.name)
    ).toEqual(["Newer App"]);
  });

  it("groups matching bundle ids and keeps source download options", () => {
    const secondSource: SourceDefinition = {
      ...source,
      id: "mirror",
      name: "Mirror Source",
      url: "https://mirror.example.com/repo.json"
    };
    const first = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "Shared App",
            bundleIdentifier: "com.example.shared",
            versions: [{ version: "1.0.0", date: "2024-01-01", downloadURL: "https://example.com/one.ipa" }]
          }
        ]
      },
      source
    );
    const second = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "Shared App",
            bundleIdentifier: "com.example.shared",
            versions: [{ version: "2.0.0", date: "2024-02-01", downloadURL: "https://example.com/two.ipa" }]
          }
        ]
      },
      secondSource
    );

    const grouped = groupAppsByBundleId([...first, ...second]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      id: "bundle:com.example.shared",
      sourceId: "multiple",
      sourceName: "2 sources",
      latestVersion: "2.0.0",
      downloadURL: "https://example.com/two.ipa"
    });
    expect(grouped[0]?.downloadOptions.map((option) => option.sourceName)).toEqual(["Mirror Source", "FastSign Lite"]);
  });

  it("sorts grouped apps by recency and name before pagination", () => {
    const apps = normalizeAltStoreRepo(
      {
        apps: [
          {
            name: "beta",
            bundleIdentifier: "com.example.beta",
            versions: [{ version: "1.0.0", date: "2024-01-01" }]
          },
          {
            name: "Alpha",
            bundleIdentifier: "com.example.alpha",
            versions: [{ version: "1.0.0", date: "2024-03-01" }]
          },
          {
            name: "Charlie",
            bundleIdentifier: "com.example.charlie",
            versions: [{ version: "1.0.0", date: "2024-02-01" }]
          }
        ]
      },
      source
    );
    const grouped = groupAppsByBundleId(apps);

    expect(sortApps(grouped, "recent").map((app) => app.name)).toEqual(["Alpha", "Charlie", "beta"]);
    expect(sortApps(grouped, "name-asc").map((app) => app.name)).toEqual(["Alpha", "beta", "Charlie"]);
    expect(sortApps(grouped, "name-desc").map((app) => app.name)).toEqual(["Charlie", "beta", "Alpha"]);

    const sortedPage = paginateApps(sortApps(grouped, "name-asc"), {
      category: "all",
      sort: "name-asc",
      iosVersionOperator: "lte",
      page: 1,
      pageSize: 2
    });

    expect(sortedPage.apps.map((app) => app.name)).toEqual(["Alpha", "beta"]);
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
      sort: "recent",
      iosVersionOperator: "lte"
    });
  });

  it("rejects missing search text", () => {
    expect(() => SearchAppsQuerySchema.parse({ q: "   " })).toThrow();
  });
});
