import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDownloadAnalyticsStore,
  readPopularDownloadStats,
  readProblemDownloadLinkStats,
  recordDownloadAttempt
} from "./downloadAnalyticsStore.js";
import { closeRepoCacheStore } from "./repoCacheStore.js";

let tempDir: string;

beforeEach(() => {
  closeDownloadAnalyticsStore();
  closeRepoCacheStore();
  tempDir = mkdtempSync(join(tmpdir(), "iappstores-download-analytics-"));
  process.env.REPO_CACHE_DB_PATH = join(tempDir, "cache.sqlite");
});

afterEach(() => {
  closeDownloadAnalyticsStore();
  closeRepoCacheStore();
  delete process.env.REPO_CACHE_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("downloadAnalyticsStore", () => {
  it("records download attempts and returns popular app rollups", () => {
    recordDownloadAttempt({
      appId: "bundle:com.example.alpha",
      bundleIdentifier: "com.example.alpha",
      appName: "Alpha",
      sourceId: "source-one",
      sourceName: "Source One",
      downloadURL: "https://example.com/alpha.ipa",
      probeStatus: "success",
      probeStatusCode: 200,
      probeError: null,
      createdAt: 1_000
    });
    recordDownloadAttempt({
      appId: "bundle:com.example.alpha",
      bundleIdentifier: "com.example.alpha",
      appName: "Alpha",
      sourceId: "source-two",
      sourceName: "Source Two",
      downloadURL: "https://example.com/alpha-alt.ipa",
      probeStatus: "inconclusive",
      probeStatusCode: null,
      probeError: "Probe timed out.",
      createdAt: 2_000
    });
    recordDownloadAttempt({
      appId: "bundle:com.example.beta",
      bundleIdentifier: "com.example.beta",
      appName: "Beta",
      sourceId: "source-one",
      sourceName: "Source One",
      downloadURL: "https://example.com/beta.ipa",
      probeStatus: "success",
      probeStatusCode: 200,
      probeError: null,
      createdAt: 3_000
    });

    expect(readPopularDownloadStats(10)).toEqual([
      {
        appId: "bundle:com.example.alpha",
        bundleIdentifier: "com.example.alpha",
        appName: "Alpha",
        downloadCount: 2,
        lastDownloadedAt: 2_000
      },
      {
        appId: "bundle:com.example.beta",
        bundleIdentifier: "com.example.beta",
        appName: "Beta",
        downloadCount: 1,
        lastDownloadedAt: 3_000
      }
    ]);
  });

  it("tracks hard-failed links for review", () => {
    recordDownloadAttempt({
      appId: "bundle:com.example.alpha",
      bundleIdentifier: "com.example.alpha",
      appName: "Alpha",
      sourceId: "source-one",
      sourceName: "Source One",
      downloadURL: "https://example.com/missing.ipa",
      probeStatus: "hard_failure",
      probeStatusCode: 404,
      probeError: "Download URL returned HTTP 404.",
      createdAt: 4_000
    });

    expect(readProblemDownloadLinkStats(10)).toEqual([
      {
        appId: "bundle:com.example.alpha",
        bundleIdentifier: "com.example.alpha",
        appName: "Alpha",
        sourceId: "source-one",
        sourceName: "Source One",
        downloadURL: "https://example.com/missing.ipa",
        failureCount: 1,
        lastStatus: "hard_failure",
        lastStatusCode: 404,
        lastFailureAt: 4_000
      }
    ]);
  });
});
