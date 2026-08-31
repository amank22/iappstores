import type { AppCategoryFacet, AppDto, DeveloperDto } from "@iappstores/contracts";
import { enrichAppsWithCachedAppStoreMetadata } from "./appStoreClient.js";
import { hydrateCatalogApps, isSearchIndexAvailable, searchCatalogIds } from "./catalogStore.js";
import { getCategoryFacets, groupAppsByBundleId, searchApps } from "./normalizer.js";
import { getSourceApps, onSourceRefreshed } from "./repoClient.js";
import { SOURCES, type SourceDefinition } from "./sources.js";

export type MaterializedCatalog = {
  generatedAt: number;
  apps: AppDto[];
  byId: Map<string, AppDto>;
  categoryFacets: AppCategoryFacet[];
  developers: DeveloperDto[];
  developerSlugToApps: Map<string, AppDto[]>;
};

const DEFAULT_REBUILD_DEBOUNCE_MS = 5_000;
const MAX_REBUILD_WAIT_MS = 60_000;

function getRebuildDebounceMs(): number {
  const configured = Number(process.env.CATALOG_REBUILD_DEBOUNCE_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REBUILD_DEBOUNCE_MS;
}

export function appIdentity(app: AppDto): string[] {
  return [app.id, app.canonicalId ?? "", app.bundleIdentifier ?? "", app.bundleIdentifier ? `bundle:${app.bundleIdentifier.toLowerCase()}` : ""].filter(Boolean);
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

function buildDevelopers(apps: AppDto[]): { developers: DeveloperDto[]; developerSlugToApps: Map<string, AppDto[]> } {
  const bySlug = new Map<string, { name: string; apps: AppDto[] }>();

  for (const app of apps) {
    const name = getDeveloperName(app);
    if (!name) continue;

    const slug = slugify(name);
    if (!slug) continue;

    const developer = bySlug.get(slug) ?? { name, apps: [] };
    developer.apps.push(app);
    bySlug.set(slug, developer);
  }

  const developers = [...bySlug.entries()]
    .map(([slug, developer]) => ({
      slug,
      name: developer.name,
      appCount: developer.apps.length,
      categories: [...new Set(developer.apps.map((app) => app.category))].sort(),
      sourceNames: [...new Set(developer.apps.flatMap((app) => app.downloadOptions.map((option) => option.sourceName)))].sort()
    }))
    .sort((a, b) => b.appCount - a.appCount || a.name.localeCompare(b.name));

  const developerSlugToApps = new Map<string, AppDto[]>();
  for (const [slug, developer] of bySlug) {
    developerSlugToApps.set(slug, developer.apps);
  }

  return { developers, developerSlugToApps };
}

async function getAppsForSources(sources: SourceDefinition[]): Promise<AppDto[]> {
  const results = await Promise.allSettled(sources.map((source) => getSourceApps(source)));
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function buildMaterializedCatalog(sources: SourceDefinition[]): Promise<MaterializedCatalog> {
  const allApps = await getAppsForSources(sources);
  const apps = hydrateCatalogApps(groupAppsByBundleId(allApps));

  const byId = new Map<string, AppDto>();
  for (const app of apps) {
    for (const id of appIdentity(app)) {
      byId.set(id.toLowerCase(), app);
    }
  }

  const categoryFacets = getCategoryFacets(allApps);
  const { developers, developerSlugToApps } = buildDevelopers(enrichAppsWithCachedAppStoreMetadata(apps));

  return { generatedAt: Date.now(), apps, byId, categoryFacets, developers, developerSlugToApps };
}

let current: MaterializedCatalog | undefined;
let building: Promise<MaterializedCatalog> | undefined;
let debounceTimer: NodeJS.Timeout | undefined;
let firstPendingAt: number | undefined;

export function getMaterializedCatalog(): MaterializedCatalog | undefined {
  return current;
}

export function findAppById(catalog: MaterializedCatalog, id: string): AppDto | undefined {
  return catalog.byId.get(id.toLowerCase());
}

export function searchMaterializedCatalog(catalog: MaterializedCatalog, query: string, limit = 500): AppDto[] {
  if (!query.trim()) {
    return catalog.apps;
  }

  if (!isSearchIndexAvailable()) {
    return searchApps(catalog.apps, query);
  }

  return searchCatalogIds(query, limit).flatMap((id) => catalog.byId.get(id.toLowerCase()) ?? []);
}

function runBuild(sources: SourceDefinition[]): Promise<MaterializedCatalog> {
  building ??= buildMaterializedCatalog(sources)
    .then((next) => {
      current = next;
      return next;
    })
    .catch((error: unknown) => {
      console.error("Catalog materialization failed.", error);
      throw error;
    })
    .finally(() => {
      building = undefined;
    });

  return building;
}

export function requestMaterialization(sources: SourceDefinition[] = SOURCES): void {
  const now = Date.now();
  firstPendingAt ??= now;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  const fire = () => {
    debounceTimer = undefined;
    firstPendingAt = undefined;
    void runBuild(sources);
  };

  if (now - firstPendingAt >= MAX_REBUILD_WAIT_MS) {
    fire();
    return;
  }

  debounceTimer = setTimeout(fire, getRebuildDebounceMs());
  debounceTimer.unref();
}

export async function ensureMaterializedCatalog(sources: SourceDefinition[] = SOURCES): Promise<MaterializedCatalog> {
  return current ?? runBuild(sources);
}

export function resetMaterializerForTests(): void {
  current = undefined;
  building = undefined;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = undefined;
  firstPendingAt = undefined;
}

onSourceRefreshed(() => requestMaterialization(SOURCES));
