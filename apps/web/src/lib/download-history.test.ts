import { describe, expect, it } from "vitest";
import {
  DOWNLOADED_APPS_STORAGE_KEY,
  readDownloadedAppIds,
  readDownloadedAppRecords,
  recordDownloadedApp
} from "./download-history";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("download-history", () => {
  it("returns empty state for empty or malformed storage", () => {
    const storage = new MemoryStorage();

    expect(readDownloadedAppRecords(storage)).toEqual([]);
    expect(readDownloadedAppIds(storage)).toEqual(new Set());

    storage.setItem(DOWNLOADED_APPS_STORAGE_KEY, "{bad json");

    expect(readDownloadedAppRecords(storage)).toEqual([]);
    expect(readDownloadedAppIds(storage)).toEqual(new Set());
  });

  it("records app-level download state", () => {
    const storage = new MemoryStorage();

    recordDownloadedApp(
      {
        appId: "bundle:com.example.app",
        appName: "Example App",
        sourceId: "source-one",
        sourceName: "Source One",
        downloadedAt: 1_000
      },
      storage
    );

    expect(readDownloadedAppIds(storage)).toEqual(new Set(["bundle:com.example.app"]));
    expect(readDownloadedAppRecords(storage)).toEqual([
      {
        appId: "bundle:com.example.app",
        appName: "Example App",
        sourceId: "source-one",
        sourceName: "Source One",
        downloadedAt: 1_000
      }
    ]);
  });

  it("updates an existing app record without duplicating it", () => {
    const storage = new MemoryStorage();

    recordDownloadedApp(
      {
        appId: "bundle:com.example.app",
        appName: "Example App",
        sourceId: "source-one",
        sourceName: "Source One",
        downloadedAt: 1_000
      },
      storage
    );
    recordDownloadedApp(
      {
        appId: "bundle:com.example.app",
        appName: "Example App",
        sourceId: "source-two",
        sourceName: "Source Two",
        downloadedAt: 2_000
      },
      storage
    );

    expect(readDownloadedAppRecords(storage)).toEqual([
      {
        appId: "bundle:com.example.app",
        appName: "Example App",
        sourceId: "source-two",
        sourceName: "Source Two",
        downloadedAt: 2_000
      }
    ]);
  });
});
