import cors from "cors";
import express from "express";
import {
  SearchAppsQuerySchema,
  SourceIdParamSchema,
  type AppsResponse,
  type SearchResponse,
  type SourcesResponse
} from "@iappstores/contracts";
import { sendError } from "./http.js";
import { searchApps } from "./normalizer.js";
import { getSourceApps } from "./repoClient.js";
import { findSource, sourceToDto, SOURCES } from "./sources.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const frontendOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

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
  const sources = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const apps = await getSourceApps(source);
        return sourceToDto(source, apps.length);
      } catch {
        return sourceToDto(source);
      }
    })
  );

  const body: SourcesResponse = { sources };
  res.json(body);
});

app.get("/api/sources/:sourceId/apps", async (req, res) => {
  const params = SourceIdParamSchema.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "invalid_source_id", "Source id is required.", params.error.flatten());
    return;
  }

  const source = findSource(params.data.sourceId);
  if (!source) {
    sendError(res, 404, "source_not_found", `Unknown source "${params.data.sourceId}".`);
    return;
  }

  try {
    const apps = await getSourceApps(source);
    const body: AppsResponse = {
      source: sourceToDto(source, apps.length),
      apps
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
    const sourceApps = await Promise.all(selectedSources.map((source) => getSourceApps(source)));
    const apps = sourceApps.flatMap((appsForSource) => searchApps(appsForSource, parsedQuery.data.q));
    const body: SearchResponse = {
      query: parsedQuery.data,
      apps
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
