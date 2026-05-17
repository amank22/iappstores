import cors from "cors";
import express from "express";
import {
  BrowseAppsQuerySchema,
  SearchAppsQuerySchema,
  SourceIdParamSchema,
  type AppListResponse,
  type AppsResponse,
  type SearchResponse,
  type SourcesResponse
} from "@iappstores/contracts";
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

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const frontendOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

initRepoCacheStore();
startRepoRefreshWorker(SOURCES);
process.on("exit", closeRepoCacheStore);

async function getAppsForSources(sources: typeof SOURCES) {
  const results = await Promise.allSettled(sources.map((source) => getSourceApps(source)));

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

app.use(
  cors({
    origin: frontendOrigin
  })
);

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
      apps: pagedApps.apps,
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
      apps: pagedApps.apps,
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
      apps: pagedApps.apps,
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
