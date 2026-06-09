import cors from "cors";
import express from "express";
import {
  AppIdParamSchema,
  BrowseAppsQuerySchema,
  DeveloperSlugParamSchema,
  SearchAppsQuerySchema,
  SourceIdParamSchema,
  TranslationRequestSchema,
  type AppDto,
  type AppResponse,
  type AppListResponse,
  type AppsResponse,
  type DeveloperDto,
  type DevelopersResponse,
  type SearchResponse,
  type SitemapAppsResponse,
  type SourcesResponse,
  type TranslationResponse
} from "@iappstores/contracts";
import { enrichAppsWithCachedAppStoreMetadata } from "./appStoreClient.js";
import { closeAppStoreCacheStore, initAppStoreCacheStore } from "./appStoreCacheStore.js";
import { sendError } from "./http.js";
import {
  filterAppsByCategory,
  filterAppsByIosVersion,
  getCategoryFacets,
  groupAppsByBundleId,
  paginateApps,
  searchApps
} from "./normalizer.js";
import { closeRepoCacheStore, initRepoCacheStore } from "./repoCacheStore.js";
import { getSourceApps } from "./repoClient.js";
import { startRepoRefreshWorker } from "./repoRefreshWorker.js";
import { findSource, sourceToDto, SOURCES } from "./sources.js";
import { translateText } from "./translateClient.js";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const frontendOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

initRepoCacheStore();
initAppStoreCacheStore();
startRepoRefreshWorker(SOURCES);
process.on("exit", () => {
  closeRepoCacheStore();
  closeAppStoreCacheStore();
});

async function getAppsForSources(sources: typeof SOURCES) {
  const results = await Promise.allSettled(sources.map((source) => getSourceApps(source)));

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function getGroupedAppsForSources(sources: typeof SOURCES) {
  const allApps = await getAppsForSources(sources);
  return groupAppsByBundleId(allApps);
}

function attachAppStoreMetadata(apps: AppDto[], includeAppStore: boolean): AppDto[] {
  return includeAppStore ? enrichAppsWithCachedAppStoreMetadata(apps) : apps;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getDeveloperName(app: AppDto): string | null {
  return app.appStore?.developerName ?? app.developerName;
}

function getDevelopers(apps: AppDto[]): DeveloperDto[] {
  const developers = new Map<string, { name: string; apps: AppDto[] }>();

  for (const app of apps) {
    const name = getDeveloperName(app);
    if (!name) {
      continue;
    }

    const slug = slugify(name);
    if (!slug) {
      continue;
    }

    const developer = developers.get(slug) ?? { name, apps: [] };
    developer.apps.push(app);
    developers.set(slug, developer);
  }

  return [...developers.entries()]
    .map(([slug, developer]) => ({
      slug,
      name: developer.name,
      appCount: developer.apps.length,
      categories: [...new Set(developer.apps.map((app) => app.category))].sort(),
      sourceNames: [...new Set(developer.apps.flatMap((app) => app.downloadOptions.map((option) => option.sourceName)))].sort()
    }))
    .sort((a, b) => b.appCount - a.appCount || a.name.localeCompare(b.name));
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
    const groupedApps = enrichAppsWithCachedAppStoreMetadata(await getGroupedAppsForSources(SOURCES));
    const body: DevelopersResponse = {
      developers: getDevelopers(groupedApps)
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

app.get("/api/sitemap/apps", async (_req, res) => {
  try {
    const groupedApps = await getGroupedAppsForSources(SOURCES);
    const body: SitemapAppsResponse = {
      apps: groupedApps.map((app) => ({
        id: app.id,
        bundleIdentifier: app.bundleIdentifier,
        versionDate: app.versionDate
      }))
    };
    res.json(body);
  } catch (error) {
    sendError(res, 502, "sitemap_apps_failed", "Could not build sitemap app list.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/apps", async (req, res) => {
  const parsedQuery = BrowseAppsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    sendError(res, 400, "invalid_apps_query", "Apps query parameters are invalid.", parsedQuery.error.flatten());
    return;
  }

  const selectedSources = parsedQuery.data.sourceId
    ? SOURCES.filter((source) => source.id === parsedQuery.data.sourceId)
    : SOURCES;

  if (parsedQuery.data.sourceId && selectedSources.length === 0) {
    sendError(res, 404, "source_not_found", `Unknown source "${parsedQuery.data.sourceId}".`);
    return;
  }

  try {
    const allApps = await getAppsForSources(selectedSources);
    const categorizedApps = filterAppsByCategory(allApps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const groupedApps = groupAppsByBundleId(filteredApps);
    const pagedApps = paginateApps(groupedApps, parsedQuery.data);
    const body: AppListResponse = {
      apps: attachAppStoreMetadata(pagedApps.apps, parsedQuery.data.includeAppStore),
      pagination: pagedApps.pagination,
      categories: getCategoryFacets(allApps)
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
    const groupedApps = await getGroupedAppsForSources(SOURCES);
    const decodedAppId = params.data.appId;
    const matchedApp = groupedApps.find(
      (candidate) =>
        candidate.id === decodedAppId ||
        candidate.bundleIdentifier?.toLowerCase() === decodedAppId.toLowerCase() ||
        candidate.id === `bundle:${decodedAppId.toLowerCase()}`
    );

    if (!matchedApp) {
      sendError(res, 404, "app_not_found", `Unknown app "${decodedAppId}".`);
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
    const pagedApps = paginateApps(groupedApps, parsedQuery.data);
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
    const groupedApps = enrichAppsWithCachedAppStoreMetadata(await getGroupedAppsForSources(SOURCES));
    const developer = getDevelopers(groupedApps).find((candidate) => candidate.slug === params.data.developerSlug);

    if (!developer) {
      sendError(res, 404, "developer_not_found", `Unknown developer "${params.data.developerSlug}".`);
      return;
    }

    const developerApps = groupedApps.filter((app) => {
      const name = getDeveloperName(app);
      return name ? slugify(name) === developer.slug : false;
    });
    const categorizedApps = filterAppsByCategory(developerApps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const pagedApps = paginateApps(filteredApps, parsedQuery.data);
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

  const selectedSources = parsedQuery.data.sourceId
    ? SOURCES.filter((source) => source.id === parsedQuery.data.sourceId)
    : SOURCES;

  if (parsedQuery.data.sourceId && selectedSources.length === 0) {
    sendError(res, 404, "source_not_found", `Unknown source "${parsedQuery.data.sourceId}".`);
    return;
  }

  try {
    const allApps = await getAppsForSources(selectedSources);
    const matchedApps = searchApps(allApps, parsedQuery.data.q);
    const categorizedApps = filterAppsByCategory(matchedApps, parsedQuery.data.category);
    const filteredApps = filterAppsByIosVersion(categorizedApps, parsedQuery.data);
    const groupedApps = groupAppsByBundleId(filteredApps);
    const pagedApps = paginateApps(groupedApps, parsedQuery.data);
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
