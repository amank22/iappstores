import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeRepoCacheStore, readSourceCache } from "./repoCacheStore.js";
import { clearRepoCache, refreshSourceApps } from "./repoClient.js";
import type { SourceDefinition } from "./sources.js";

const treeSource: SourceDefinition = {
  id: "json-ipa-repos",
  name: "JSON IPA Repos",
  subtitle: "Aggregated AltStore-compatible JSON repositories",
  url: "https://api.github.com/repos/j3qq4h7h2v/json-ipa-repos/git/trees/main",
  website: "https://github.com/j3qq4h7h2v/json-ipa-repos",
  kind: "github-tree"
};

const localTreeSource: SourceDefinition = {
  ...treeSource,
  id: "json-ipa-repos-local",
  treeFile: "json-ipa-repos.json"
};

let tempDir: string;
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Failed",
    headers: {
      "content-type": "application/json"
    }
  });
}

beforeEach(() => {
  closeRepoCacheStore();
  clearRepoCache();
  tempDir = mkdtempSync(join(tmpdir(), "iappstores-repo-client-"));
  process.env.REPO_CACHE_DB_PATH = join(tempDir, "cache.sqlite");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  closeRepoCacheStore();
  clearRepoCache();
  delete process.env.REPO_CACHE_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("repoClient", () => {
  it("expands GitHub tree JSON blobs into normalized child repo apps and caches them", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "https://api.github.com/repos/j3qq4h7h2v/json-ipa-repos/git/trees/main?recursive=1") {
        return jsonResponse({
          tree: [
            { path: "Example_Repo_apps.json", type: "blob" },
            { path: "README.md", type: "blob" },
            { path: "nested", type: "tree" }
          ]
        });
      }

      if (url === "https://raw.githubusercontent.com/j3qq4h7h2v/json-ipa-repos/main/Example_Repo_apps.json") {
        return jsonResponse({
          name: "Example Repo",
          subtitle: "A mirrored source",
          website: "https://example.com",
          apps: [
            {
              name: "Example App",
              bundleIdentifier: "com.example.app",
              versions: [
                {
                  version: "1.0.0",
                  date: "2026-01-01",
                  downloadURL: "https://example.com/app.ipa"
                }
              ]
            }
          ]
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const apps = await refreshSourceApps(treeSource, 60_000);
    const cached = readSourceCache(treeSource);

    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: "json-ipa-repos:example-repo-apps:com.example.app",
      sourceId: "json-ipa-repos:example-repo-apps",
      sourceName: "Example Repo",
      name: "Example App",
      latestVersion: "1.0.0",
      downloadURL: "https://example.com/app.ipa",
      downloadOptions: [
        expect.objectContaining({
          sourceId: "json-ipa-repos:example-repo-apps",
          sourceName: "Example Repo"
        })
      ]
    });
    expect(cached?.appCount).toBe(1);
    expect(cached?.apps).toEqual(apps);
  });

  it("uses a local GitHub tree manifest when configured", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "https://raw.githubusercontent.com/j3qq4h7h2v/json-ipa-repos/main/4PERTURE_DirtyRepo_DirtyRepo.json") {
        return jsonResponse({
          name: "DirtyRepo",
          apps: [
            {
              name: "Local Manifest App",
              bundleIdentifier: "com.example.local",
              versions: [{ version: "1.0.0", downloadURL: "https://example.com/local.ipa" }]
            }
          ]
        });
      }

      if (url.startsWith("https://raw.githubusercontent.com/j3qq4h7h2v/json-ipa-repos/main/")) {
        return jsonResponse({ apps: [] });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const apps = await refreshSourceApps(localTreeSource, 60_000);
    const calledApiGithub = fetchMock.mock.calls.some(([url]) => String(url).includes("api.github.com"));

    expect(calledApiGithub).toBe(false);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: "json-ipa-repos-local:4perture-dirtyrepo-dirtyrepo:com.example.local",
      sourceId: "json-ipa-repos-local:4perture-dirtyrepo-dirtyrepo",
      sourceName: "DirtyRepo",
      name: "Local Manifest App"
    });
  });
});
