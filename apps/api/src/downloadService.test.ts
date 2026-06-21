import type { AppDto } from "@iappstores/contracts";
import { describe, expect, it } from "vitest";
import { decideDownloadRedirect, resolveDownloadTarget } from "./downloadService.js";

const appWithDownload: AppDto = {
  id: "bundle:com.example.app",
  sourceId: "multiple",
  sourceName: "2 sources",
  name: "Example App",
  bundleIdentifier: "com.example.app",
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
      sourceId: "source-one",
      sourceName: "Source One",
      latestVersion: "1.0.0",
      versionDate: "2026-01-01",
      downloadURL: "https://example.com/app.ipa",
      size: 1234,
      minOSVersion: "15.0"
    },
    {
      sourceId: "source-two",
      sourceName: "Source Two",
      latestVersion: "1.0.0",
      versionDate: "2026-01-01",
      downloadURL: null,
      size: null,
      minOSVersion: null
    }
  ]
};

describe("downloadService", () => {
  it("resolves a valid app/source pair to the original download URL", () => {
    const target = resolveDownloadTarget([appWithDownload], "bundle:com.example.app", "source-one");

    expect(target).toMatchObject({
      ok: true,
      option: {
        downloadURL: "https://example.com/app.ipa"
      }
    });
  });

  it("matches bundle identifiers as app ids", () => {
    const target = resolveDownloadTarget([appWithDownload], "com.example.app", "source-one");

    expect(target).toMatchObject({
      ok: true,
      app: {
        id: "bundle:com.example.app"
      }
    });
  });

  it("rejects unknown apps", () => {
    expect(resolveDownloadTarget([appWithDownload], "missing", "source-one")).toMatchObject({
      ok: false,
      status: 404,
      code: "app_not_found"
    });
  });

  it("rejects unknown sources for a valid app", () => {
    expect(resolveDownloadTarget([appWithDownload], "bundle:com.example.app", "missing-source")).toMatchObject({
      ok: false,
      status: 404,
      code: "download_source_not_found"
    });
  });

  it("rejects source options that do not have a download URL", () => {
    expect(resolveDownloadTarget([appWithDownload], "bundle:com.example.app", "source-two")).toMatchObject({
      ok: false,
      status: 404,
      code: "download_url_missing"
    });
  });

  it("redirects when a probe succeeds", () => {
    expect(
      decideDownloadRedirect("https://example.com/app.ipa", {
        status: "success",
        statusCode: 200,
        error: null
      })
    ).toEqual({
      shouldRedirect: true,
      downloadURL: "https://example.com/app.ipa"
    });
  });

  it("redirects when a probe is inconclusive", () => {
    expect(
      decideDownloadRedirect("https://example.com/app.ipa", {
        status: "inconclusive",
        statusCode: null,
        error: "Probe timed out."
      })
    ).toEqual({
      shouldRedirect: true,
      downloadURL: "https://example.com/app.ipa"
    });
  });

  it("does not redirect when a probe finds a hard failure", () => {
    expect(
      decideDownloadRedirect("https://example.com/app.ipa", {
        status: "hard_failure",
        statusCode: 404,
        error: "Download URL returned HTTP 404."
      })
    ).toMatchObject({
      shouldRedirect: false,
      status: 502,
      code: "download_link_broken"
    });
  });
});
