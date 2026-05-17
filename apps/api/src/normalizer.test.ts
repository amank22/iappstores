import { SearchAppsQuerySchema } from "@iappstores/contracts";
import { describe, expect, it } from "vitest";
import { normalizeAltStoreRepo, searchApps } from "./normalizer.js";
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
});

describe("SearchAppsQuerySchema", () => {
  it("trims query params and keeps optional source ids", () => {
    expect(SearchAppsQuerySchema.parse({ q: "  delta  ", sourceId: " fastsign-altstore " })).toEqual({
      q: "delta",
      sourceId: "fastsign-altstore"
    });
  });

  it("rejects missing search text", () => {
    expect(() => SearchAppsQuerySchema.parse({ q: "   " })).toThrow();
  });
});
