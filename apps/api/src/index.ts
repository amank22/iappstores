import cors from "cors";
import express from "express";
import { createHmac } from "node:crypto";
import {
  AppIdParamSchema,
  BrowseAppsQuerySchema,
  DeveloperSlugParamSchema,
  DownloadQuerySchema,
  DownloadStatsQuerySchema,
  SearchAppsQuerySchema,
  SourceIdParamSchema,
  TranslationRequestSchema,
  UpdatesQuerySchema,
  CollectionSlugSchema,
  type AppDto,
  type AppResponse,
  type AppListResponse,
  type AppsResponse,
  type DevelopersResponse,
  type DownloadStatsResponse,
  type SearchResponse,
  type SitemapAppsResponse,
  type SourcesResponse,
  type TranslationResponse
  ,type UpdatesResponse
  ,type ArchivesResponse
  ,type VersionsResponse
  ,type VersionResponse
  ,type RecommendationsResponse
  ,type CollectionResponse
} from "@iappstores/contracts";
import { enrichAppsWithCachedAppStoreMetadata } from "./appStoreClient.js";
import { closeAppStoreCacheStore, initAppStoreCacheStore } from "./appStoreCacheStore.js";
import {
  appIdentity,
  ensureMaterializedCatalog,
  findAppById,
  getMaterializedCatalog,
  searchMaterializedCatalog,
  type MaterializedCatalog
} from "./catalogMaterializer.js";
import {
  closeDownloadAnalyticsStore,
  initDownloadAnalyticsStore,
  readPopularDownloadStats,
  readProblemDownloadLinkStats,
  recordDownloadAttempt,
  readDownloadCounts,
  readAlsoDownloaded
} from "./downloadAnalyticsStore.js";
import { probeDownloadUrl } from "./downloadProbe.js";
import { decideDownloadRedirect, resolveDownloadTarget } from "./downloadService.js";
import { sendError } from "./http.js";
import {
  filterAppsByCategory,
  filterAppsByIosVersion,
  getCategoryFacets,
  groupAppsByBundleId,
  paginateApps,
  searchApps,
  sortApps
} from "./normalizer.js";
import { closeRepoCacheStore, initRepoCacheStore } from "./repoCacheStore.js";
import { getSourceApps } from "./repoClient.js";
import { startRepoRefreshWorker } from "./repoRefreshWorker.js";
import { findSource, sourceToDto, SOURCES } from "./sources.js";
import { translateText } from "./translateClient.js";
import {
  closeCatalogStore,
  readAppStatus,
  readAppVersions,
  readArchives,
  readUpdateEvents
} from "./catalogStore.js";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const frontendOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

initRepoCacheStore();
initAppStoreCacheStore();
initDownloadAnalyticsStore();
startRepoRefreshWorker(SOURCES);
process.on("exit", () => {
  closeRepoCacheStore();
  closeAppStoreCacheStore();
  closeDownloadAnalyticsStore();
  closeCatalogStore();
});

async function getAppsForSources(sources: typeof SOURCES) {
  const results = await Promise.allSettled(sources.map((source) => getSourceApps(source)));

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function getCatalog(): Promise<MaterializedCatalog> {
  return getMaterializedCatalog() ?? ensureMaterializedCatalog(SOURCES);
}

function sessionHash(sessionId: string | undefined): string | null {
  const secret = process.env.ANALYTICS_SESSION_SECRET;
  if (!secret || !sessionId || sessionId.length < 16 || sessionId.length > 128) return null;
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

function attachAppStoreMetadata(apps: AppDto[], includeAppStore: boolean): AppDto[] {
  return includeAppStore ? enrichAppsWithCachedAppStoreMetadata(apps) : apps;
}

app.use(
  cors({
    origin: frontendOrigin
  })
);
app.use(express.json({ limit: "16kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, follow");
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "iappstores-api"
  });
});

app.get("/api/sources", async (_req, res) => {
  const body: SourcesResponse = {
    sources: SOURCES.map((source) => sourceToDto(source))
  };
  res.json(body);
});

app.get("/api/developers", async (_req, res) => {
  try {
    const catalog = await getCatalog();
    const body: DevelopersResponse = {
      developers: catalog.developers
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "developers_fetch_failed", "Could not build developer list.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/translate", async (req, res) => {
  const parsedBody = TranslationRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendError(res, 400, "invalid_translation_request", "Translation request body is invalid.", parsedBody.error.flatten());
    return;
  }

  if (process.env.TRANSLATION_DISABLED === "true") {
    sendError(res, 503, "translation_disabled", "Translation is disabled for this deployment.");
    return;
  }

  try {
    const body: TranslationResponse = await translateText(parsedBody.data);
    res.json(body);
  } catch (error) {
    sendError(res, 502, "translation_failed", "Could not translate this text.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/download", async (req, res) => {
  const parsedQuery = DownloadQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_download_query", "Download query parameters are invalid.", parsedQuery.error.flatten());
    return;
  }

  try {
    const catalog = await getCatalog();
    const target = resolveDownloadTarget(catalog.apps, parsedQuery.data.appId, parsedQuery.data.sourceId);
    if (!target.ok) {
      sendError(res, target.status, target.code, target.message);
      return;
    }

    const probe = await probeDownloadUrl(target.option.downloadURL);

    try {
      recordDownloadAttempt({
        appId: target.app.id,
        bundleIdentifier: target.app.bundleIdentifier,
        appName: target.app.appStore?.name ?? target.app.name,
        sourceId: target.option.sourceId,
        sourceName: target.option.sourceName,
        downloadURL: target.option.downloadURL,
        probeStatus: probe.status,
        probeStatusCode: probe.statusCode,
        probeError: probe.error,
        sessionHash: sessionHash(parsedQuery.data.sessionId)
      });
    } catch (error) {
      console.error("Could not record download analytics.", error);
    }

    const decision = decideDownloadRedirect(target.option.downloadURL, probe);
    if (!decision.shouldRedirect) {
      sendError(res, decision.status, decision.code, decision.message, decision.details);
      return;
    }

    res.redirect(302, decision.downloadURL);
  } catch (error) {
    sendError(res, 502, "download_failed", "Could not prepare this download.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/downloads/stats", (req, res) => {
  const parsedQuery = DownloadStatsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_download_stats_query", "Download stats query parameters are invalid.", parsedQuery.error.flatten());
    return;
  }

  const body: DownloadStatsResponse =
    parsedQuery.data.type === "popular"
      ? {
          type: "popular",
          items: readPopularDownloadStats(parsedQuery.data.limit)
        }
      : {
          type: "problem-links",
          items: readProblemDownloadLinkStats(parsedQuery.data.limit)
        };

  res.json(body);
});

app.get("/api/sitemap/apps", async (_req, res) => {
  try {
    const catalog = await getCatalog();
    const body: SitemapAppsResponse = {
      apps: catalog.apps.map((app) => ({
        id: app.id,
        bundleIdentifier: app.bundleIdentifier,
        versionDate: app.versionDate,
        metadataUpdatedAt: app.metadataUpdatedAt,
        versions: [...new Set(app.versions.map((version) => version.version))]
      }))
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "sitemap_apps_failed", "Could not build sitemap app list.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

function pagination(page: number, pageSize: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / pageSize);
  return { page, pageSize, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

function parseBoundary(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

app.get("/api/updates", async (req, res) => {
  const parsed = UpdatesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "invalid_updates_query", "Update query parameters are invalid.", parsed.error.flatten());
    return;
  }
  try {
    const events = readUpdateEvents(parseBoundary(parsed.data.from), parseBoundary(parsed.data.to), parsed.data.type, 20_000);
    const start = (parsed.data.page - 1) * parsed.data.pageSize;
    const body: UpdatesResponse = {
      events: events.slice(start, start + parsed.data.pageSize),
      pagination: pagination(parsed.data.page, parsed.data.pageSize, events.length)
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "updates_fetch_failed", "Could not build the update timeline.", { message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/updates/archives", async (_req, res) => {
  try {
    const body: ArchivesResponse = readArchives();
    res.json(body);
  } catch (error) {
    sendError(res, 502, "archives_fetch_failed", "Could not build update archives.", { message: error instanceof Error ? error.message : String(error) });
  }
});

function metadataCompleteness(app: AppDto): number {
  const values = [app.description, app.iconUrl, app.developerName ?? app.appStore?.developerName, app.latestVersion, app.versionDate, app.minOSVersion, app.screenshots.length > 0 ? "yes" : null, app.downloadURL];
  return values.filter(Boolean).length / values.length;
}

function freshness(app: AppDto, now = Date.now()): number {
  const time = Date.parse(app.lastUpdatedAt ?? app.versionDate ?? "");
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, 1 - (now - time) / (365 * 24 * 60 * 60 * 1000));
}

function downloadCountFor(app: AppDto, counts: Map<string, number>): number {
  return Math.max(...appIdentity(app).map((id) => counts.get(id) ?? 0), 0);
}

function qualityScore(app: AppDto, counts: Map<string, number>, maxDemand: number): number {
  const demand = maxDemand > 0 ? downloadCountFor(app, counts) / maxDemand : 0;
  const availability = app.downloadURL ? 1 : 0;
  return demand * 0.35 + freshness(app) * 0.25 + availability * 0.2 + metadataCompleteness(app) * 0.2;
}

const COLLECTIONS = {
  "best-emulator-apps": { title: "Best Emulator Apps", description: "Top emulator IPA listings ranked by quality, freshness, availability, and demand.", category: "emulators" },
  "best-music-apps": { title: "Best Music Apps", description: "Top music IPA listings ranked by quality, freshness, availability, and demand.", category: "music" },
  "best-productivity-apps": { title: "Best Productivity Apps", description: "Top productivity IPA listings ranked by quality, freshness, availability, and demand.", category: "productivity" },
  "trending-apps": { title: "Trending Apps", description: "Apps receiving the most recent non-failing download activity.", category: null },
  "new-apps": { title: "New Apps", description: "Apps recently observed by iappstores for the first time.", category: null },
  "most-downloaded": { title: "Most Downloaded Apps", description: "Apps with the most recorded non-failing download attempts.", category: null },
  "ios-26-compatible": { title: "iOS 26 Compatible Apps", description: "Metadata-based listings whose stated minimum iOS version is 26.0 or earlier; compatibility is not device-tested.", category: null }
} as const;

app.get("/api/collections/:slug", async (req, res) => {
  const slug = CollectionSlugSchema.safeParse(req.params.slug);
  if (!slug.success) {
    sendError(res, 404, "collection_not_found", "Unknown collection.");
    return;
  }
  try {
    const catalog = await getCatalog();
    let apps = enrichAppsWithCachedAppStoreMetadata(catalog.apps);
    const definition = COLLECTIONS[slug.data];
    if (definition.category) apps = apps.filter((app) => app.category === definition.category);
    if (slug.data === "ios-26-compatible") {
      apps = apps.filter((app) => {
        const value = Number.parseFloat(app.minOSVersion ?? "");
        return Number.isFinite(value) && value <= 26;
      });
    }
    const lifetime = readDownloadCounts();
    const recent = readDownloadCounts(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const counts = slug.data === "trending-apps" ? recent : lifetime;
    const maxDemand = Math.max(...apps.map((app) => downloadCountFor(app, counts)), 1);
    apps.sort((a, b) => {
      if (slug.data === "new-apps") return Date.parse(b.firstSeenAt ?? "") - Date.parse(a.firstSeenAt ?? "");
      if (slug.data === "most-downloaded" || slug.data === "trending-apps") return downloadCountFor(b, counts) - downloadCountFor(a, counts) || freshness(b) - freshness(a);
      return qualityScore(b, counts, maxDemand) - qualityScore(a, counts, maxDemand);
    });
    const body: CollectionResponse = {
      slug: slug.data,
      title: definition.title,
      description: definition.description,
      methodology: slug.data.startsWith("best-") ? "35% demand, 25% freshness, 20% download availability, and 20% metadata completeness." : definition.description,
      apps: apps.slice(0, 60)
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "collection_fetch_failed", "Could not build this collection.", { message: error instanceof Error ? error.message : String(error) });
  }
});

function textTokens(app: AppDto): Set<string> {
  return new Set([app.name, app.subtitle, app.description, app.developerName, ...(app.appStore?.genres ?? [])].filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
}

function similarity(a: AppDto, b: AppDto): number {
  const left = textTokens(a); const right = textTokens(b);
  let shared = 0; for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(new Set([...left, ...right]).size, 1) + (a.category === b.category ? 0.35 : 0) + ((a.developerName ?? a.appStore?.developerName) === (b.developerName ?? b.appStore?.developerName) ? 0.25 : 0);
}

app.get("/api/apps/:appId/recommendations", async (req, res) => {
  try {
    const catalog = await getCatalog();
    const apps = enrichAppsWithCachedAppStoreMetadata(catalog.apps);
    const target = apps.find((app) => appIdentity(app).some((id) => id.toLowerCase() === req.params.appId.toLowerCase()));
    if (!target) { sendError(res, 404, "app_not_found", "Unknown app."); return; }
    const others = apps.filter((app) => app.id !== target.id);
    const ranked = [...others].sort((a, b) => similarity(target, b) - similarity(target, a));
    const developer = target.appStore?.developerName ?? target.developerName;
    const sourceIds = new Set(target.downloadOptions.map((option) => option.sourceId));
    const coIds = readAlsoDownloaded(target.id, Date.now() - 90 * 24 * 60 * 60 * 1000);
    const othersById = new Map(others.flatMap((app) => appIdentity(app).map((id) => [id.toLowerCase(), app] as const)));
    const coDownloaded = coIds.flatMap((id) => othersById.get(id.toLowerCase()) ?? []).slice(0, 6);
    const sections: RecommendationsResponse["sections"] = [
      { id: "related", title: "Related Apps", apps: ranked.filter((app) => app.category === target.category).slice(0, 6) },
      { id: "similar", title: "Similar Apps", apps: ranked.slice(0, 6) },
      { id: "also-downloaded", title: "Users also downloaded", apps: coDownloaded.length >= 3 ? coDownloaded : ranked.slice(0, 6) },
      { id: "same-developer", title: "More from the same developer", apps: developer ? others.filter((app) => (app.appStore?.developerName ?? app.developerName) === developer).slice(0, 6) : [] },
      { id: "same-repository", title: "More from the same repository", apps: others.filter((app) => app.downloadOptions.some((option) => sourceIds.has(option.sourceId))).slice(0, 6) }
    ];
    res.json({ sections } satisfies RecommendationsResponse);
  } catch (error) {
    sendError(res, 502, "recommendations_fetch_failed", "Could not build recommendations.", { message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/apps/:appId/versions", async (req, res) => {
  try {
    const catalog = await getCatalog();
    const app = findAppById(catalog, req.params.appId);
    if (!app) { sendError(res, 404, "app_not_found", "Unknown app."); return; }
    res.json({ app, versions: readAppVersions(req.params.appId) } satisfies VersionsResponse);
  } catch (error) {
    sendError(res, 502, "versions_fetch_failed", "Could not load version history.", { message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/apps/:appId/versions/:version", async (req, res) => {
  try {
    const catalog = await getCatalog();
    const app = findAppById(catalog, req.params.appId);
    const version = readAppVersions(req.params.appId).find((item) => item.version.toLowerCase() === req.params.version.toLowerCase());
    if (!app || !version) { sendError(res, 404, "version_not_found", "Unknown app version."); return; }
    res.json({ app, version } satisfies VersionResponse);
  } catch (error) {
    sendError(res, 502, "version_fetch_failed", "Could not load this version.", { message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/apps/:appId/status", async (req, res) => {
  try {
    res.json(readAppStatus(req.params.appId));
  } catch (error) {
    sendError(res, 502, "status_fetch_failed", "Could not resolve app status.", { message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/apps", async (req, res) => {
  const parsedQuery = BrowseAppsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_apps_query", "Apps query parameters are invalid.", parsedQuery.error.flatten());
    return;
  }

  try {
    if (parsedQuery.data.sourceId) {
      const selectedSources = SOURCES.filter((source) => source.id === parsedQuery.data.sourceId);
      if (selectedSources.length === 0) {
        sendError(res, 404, "source_not_found", `Unknown source "${parsedQuery.data.sourceId}".`);
        return;
      }

      const allApps = await getAppsForSources(selectedSources);
      const categorizedApps = filterAppsByCategory(allApps, parsedQuery.data.category);
      const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
      const groupedApps = groupAppsByBundleId(filteredApps);
      const sortedApps = sortApps(groupedApps, parsedQuery.data.sort);
      const pagedApps = paginateApps(sortedApps, parsedQuery.data);
      const body: AppListResponse = {
        apps: attachAppStoreMetadata(pagedApps.apps, parsedQuery.data.includeAppStore),
        pagination: pagedApps.pagination,
        categories: getCategoryFacets(allApps)
      };
      res.json(body);
      return;
    }

    const catalog = await getCatalog();
    const categorizedApps = filterAppsByCategory(catalog.apps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const sortedApps = sortApps(filteredApps, parsedQuery.data.sort);
    const pagedApps = paginateApps(sortedApps, parsedQuery.data);
    const body: AppListResponse = {
      apps: attachAppStoreMetadata(pagedApps.apps, parsedQuery.data.includeAppStore),
      pagination: pagedApps.pagination,
      categories: catalog.categoryFacets
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "apps_fetch_failed", "Could not fetch or parse source repositories.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/apps/:appId", async (req, res) => {
  const params = AppIdParamSchema.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "invalid_app_id", "App id is required.", params.error.flatten());
    return;
  }

  try {
    const catalog = await getCatalog();
    const matchedApp = findAppById(catalog, params.data.appId);

    if (!matchedApp) {
      sendError(res, 404, "app_not_found", `Unknown app "${params.data.appId}".`);
      return;
    }

    const [enrichedApp] = enrichAppsWithCachedAppStoreMetadata([matchedApp]);
    const body: AppResponse = {
      app: enrichedApp ?? matchedApp
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "app_fetch_failed", "Could not fetch or parse source repositories.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/sources/:sourceId/apps", async (req, res) => {
  const params = SourceIdParamSchema.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "invalid_source_id", "Source id is required.", params.error.flatten());
    return;
  }

  const parsedQuery = BrowseAppsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_apps_query", "Apps query parameters are invalid.", parsedQuery.error.flatten());
    return;
  }

  const source = findSource(params.data.sourceId);
  if (!source) {
    sendError(res, 404, "source_not_found", `Unknown source "${params.data.sourceId}".`);
    return;
  }

  try {
    const allApps = await getSourceApps(source);
    const categorizedApps = filterAppsByCategory(allApps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const groupedApps = groupAppsByBundleId(filteredApps);
    const sortedApps = sortApps(groupedApps, parsedQuery.data.sort);
    const pagedApps = paginateApps(sortedApps, parsedQuery.data);
    const body: AppsResponse = {
      source: sourceToDto(source, allApps.length),
      apps: attachAppStoreMetadata(pagedApps.apps, parsedQuery.data.includeAppStore),
      pagination: pagedApps.pagination,
      categories: getCategoryFacets(allApps)
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "source_fetch_failed", "Could not fetch or parse the source repository.", {
      sourceId: source.id,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/developers/:developerSlug/apps", async (req, res) => {
  const params = DeveloperSlugParamSchema.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "invalid_developer_slug", "Developer slug is required.", params.error.flatten());
    return;
  }

  const parsedQuery = BrowseAppsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_apps_query", "Apps query parameters are invalid.", parsedQuery.error.flatten());
    return;
  }

  try {
    const catalog = await getCatalog();
    const developerApps = catalog.developerSlugToApps.get(params.data.developerSlug);

    if (!developerApps) {
      sendError(res, 404, "developer_not_found", `Unknown developer "${params.data.developerSlug}".`);
      return;
    }

    const categorizedApps = filterAppsByCategory(developerApps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const sortedApps = sortApps(filteredApps, parsedQuery.data.sort);
    const pagedApps = paginateApps(sortedApps, parsedQuery.data);
    const body: AppListResponse = {
      apps: pagedApps.apps,
      pagination: pagedApps.pagination,
      categories: getCategoryFacets(developerApps)
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "developer_apps_fetch_failed", "Could not fetch developer apps.", {
      developerSlug: params.data.developerSlug,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/search", async (req, res) => {
  const parsedQuery = SearchAppsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_search_query", "Search query parameter q is required.", parsedQuery.error.flatten());
    return;
  }

  try {
    if (parsedQuery.data.sourceId) {
      const selectedSources = SOURCES.filter((source) => source.id === parsedQuery.data.sourceId);
      if (selectedSources.length === 0) {
        sendError(res, 404, "source_not_found", `Unknown source "${parsedQuery.data.sourceId}".`);
        return;
      }

      const allApps = await getAppsForSources(selectedSources);
      const matchedApps = searchApps(allApps, parsedQuery.data.q);
      const categorizedApps = filterAppsByCategory(matchedApps, parsedQuery.data.category);
      const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
      const groupedApps = groupAppsByBundleId(filteredApps);
      const sortedApps = sortApps(groupedApps, parsedQuery.data.sort);
      const pagedApps = paginateApps(sortedApps, parsedQuery.data);
      const body: SearchResponse = {
        query: parsedQuery.data,
        apps: attachAppStoreMetadata(pagedApps.apps, parsedQuery.data.includeAppStore),
        pagination: pagedApps.pagination,
        categories: getCategoryFacets(matchedApps)
      };
      res.json(body);
      return;
    }

    const catalog = await getCatalog();
    const matchedApps = searchMaterializedCatalog(catalog, parsedQuery.data.q);
    const categorizedApps = filterAppsByCategory(matchedApps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const sortedApps = sortApps(filteredApps, parsedQuery.data.sort);
    const pagedApps = paginateApps(sortedApps, parsedQuery.data);
    const body: SearchResponse = {
      query: parsedQuery.data,
      apps: attachAppStoreMetadata(pagedApps.apps, parsedQuery.data.includeAppStore),
      pagination: pagedApps.pagination,
      categories: getCategoryFacets(matchedApps)
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "search_failed", "Could not search source repositories.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`iappstores API listening on http://localhost:${port}`);
});
