import type {
  AppCategory,
  AppCategoryFacet,
  AppDownloadOption,
  AppSort,
  AppDto,
  BrowseAppsQuery,
  DerivedAppCategory,
  IosVersionOperator,
  Pagination
} from "@iappstores/contracts";
import type { SourceDefinition } from "./sources.js";

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
  }

  return null;
}

function asUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

function pickAppStoreUrl(app: AnyRecord): string | null {
  return asUrl(
    app.appStoreURL ??
      app.appStoreUrl ??
      app.appstoreURL ??
      app.appstoreUrl ??
      app.storeURL ??
      app.storeUrl ??
      app.itunesURL ??
      app.itunesUrl ??
      app.marketplaceURL ??
      app.marketplaceUrl
  );
}

function asUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      const url = asUrl(item);
      return url ? [url] : [];
    }

    if (isRecord(item)) {
      const url = asUrl(item.url ?? item.imageURL ?? item.imageUrl);
      return url ? [url] : [];
    }

    return [];
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function versionTimestamp(version: AnyRecord): number {
  const date = asString(version.date);
  return date ? Date.parse(date) || 0 : 0;
}

function pickLatestVersion(app: AnyRecord): AnyRecord | null {
  const versions = Array.isArray(app.versions) ? app.versions.filter(isRecord) : [];
  if (versions.length === 0) {
    return null;
  }

  return [...versions].sort((a, b) => versionTimestamp(b) - versionTimestamp(a))[0] ?? versions[0] ?? null;
}

function appSearchText(app: Pick<AppDto, "name" | "bundleIdentifier" | "developerName" | "subtitle" | "description" | "latestVersion">): string {
  return [app.name, app.bundleIdentifier, app.developerName, app.subtitle, app.description, app.latestVersion]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function categorizeApp(app: AnyRecord): DerivedAppCategory {
  const text = [
    app.name,
    app.bundleIdentifier,
    app.developerName,
    app.subtitle,
    app.localizedDescription,
    app.description
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(game|games|gaming|emulator|arcade|minecraft|pokemon|delta|retroarch)\b/.test(text)) {
    return "games";
  }

  if (/\b(music|video|photo|camera|movie|media|stream|youtube|spotify|piano)\b/.test(text)) {
    return "media";
  }

  if (/\b(learn|learning|education|school|book|language|math|course|study)\b/.test(text)) {
    return "education";
  }

  return "tools";
}

function appTimestamp(app: AppDto): number {
  return app.versionDate ? Date.parse(app.versionDate) || 0 : 0;
}

function optionTimestamp(option: AppDownloadOption): number {
  return option.versionDate ? Date.parse(option.versionDate) || 0 : 0;
}

function parseIosVersion(version: string | null): number[] | null {
  if (!version) {
    return null;
  }

  const match = version.match(/\d+(?:\.\d+){0,2}/);
  if (!match) {
    return null;
  }

  return match[0].split(".").map((part) => Number(part));
}

function compareIosVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length, 3);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function matchesIosVersion(app: AppDto, iosVersion: string, operator: IosVersionOperator): boolean {
  const appMinVersion = parseIosVersion(app.minOSVersion);
  const requestedVersion = parseIosVersion(iosVersion);

  if (!appMinVersion || !requestedVersion) {
    return false;
  }

  const comparison = compareIosVersions(appMinVersion, requestedVersion);
  return operator === "lte" ? comparison <= 0 : comparison >= 0;
}

export function normalizeAltStoreRepo(repoJson: unknown, source: SourceDefinition): AppDto[] {
  if (!isRecord(repoJson) || !Array.isArray(repoJson.apps)) {
    return [];
  }

  return repoJson.apps.filter(isRecord).flatMap((app): AppDto[] => {
    const name = asString(app.name);
    if (!name) {
      return [];
    }

    const latest = pickLatestVersion(app);
    const bundleIdentifier = asString(app.bundleIdentifier);
    const stableId = `${source.id}:${bundleIdentifier ?? slugify(name)}`;
    const downloadOption: AppDownloadOption = {
      sourceId: source.id,
      sourceName: source.name,
      latestVersion: latest ? asString(latest.version) : null,
      versionDate: latest ? asString(latest.date) : null,
      downloadURL: latest ? asUrl(latest.downloadURL ?? latest.downloadUrl) : null,
      size: latest ? asNumber(latest.size) : null,
      minOSVersion: latest ? asString(latest.minOSVersion ?? latest.minOsVersion) : null
    };

    return [
      {
        id: stableId,
        sourceId: source.id,
        sourceName: source.name,
        name,
        bundleIdentifier,
        developerName: asString(app.developerName),
        subtitle: asString(app.subtitle),
        description: asString(app.localizedDescription ?? app.description),
        category: categorizeApp(app),
        iconUrl: asUrl(app.iconURL ?? app.iconUrl),
        appStoreUrl: pickAppStoreUrl(app),
        screenshots: asUrlArray(app.screenshots),
        latestVersion: latest ? asString(latest.version) : null,
        versionDate: latest ? asString(latest.date) : null,
        versionDescription: latest ? asString(latest.localizedDescription ?? latest.description) : null,
        downloadURL: latest ? asUrl(latest.downloadURL ?? latest.downloadUrl) : null,
        size: latest ? asNumber(latest.size) : null,
        minOSVersion: latest ? asString(latest.minOSVersion ?? latest.minOsVersion) : null,
        downloadOptions: [downloadOption]
      }
    ];
  });
}

export function searchApps(apps: AppDto[], query: string): AppDto[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return apps;
  }

  return apps.filter((app) => terms.every((term) => appSearchText(app).includes(term)));
}

export function filterAppsByCategory(apps: AppDto[], category: AppCategory): AppDto[] {
  if (category === "all") {
    return apps;
  }

  if (category === "recent") {
    return [...apps].sort((a, b) => appTimestamp(b) - appTimestamp(a));
  }

  return apps.filter((app) => app.category === category);
}

export function filterAppsByIosVersion(apps: AppDto[], query: BrowseAppsQuery): AppDto[] {
  const iosVersion = query.iosVersion;
  if (!iosVersion) {
    return apps;
  }

  return apps.filter((app) => matchesIosVersion(app, iosVersion, query.iosVersionOperator));
}

function appGroupKey(app: AppDto): string {
  return app.bundleIdentifier ? `bundle:${app.bundleIdentifier.toLowerCase()}` : `app:${app.id}`;
}

function sortDownloadOptions(options: AppDownloadOption[]): AppDownloadOption[] {
  return [...options].sort((a, b) => {
    if (Boolean(a.downloadURL) !== Boolean(b.downloadURL)) {
      return a.downloadURL ? -1 : 1;
    }

    const dateDifference = optionTimestamp(b) - optionTimestamp(a);
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return a.sourceName.localeCompare(b.sourceName);
  });
}

function dedupeDownloadOptions(options: AppDownloadOption[]): AppDownloadOption[] {
  const seen = new Set<string>();

  return sortDownloadOptions(options).filter((option) => {
    const key = [option.sourceId, option.downloadURL, option.latestVersion].join("|");
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortGroupedApps(apps: AppDto[]): AppDto[] {
  return [...apps].sort((a, b) => {
    const dateDifference = appTimestamp(b) - appTimestamp(a);
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return a.name.localeCompare(b.name);
  });
}

export function sortApps(apps: AppDto[], sort: AppSort): AppDto[] {
  if (sort === "name-asc" || sort === "name-desc") {
    return [...apps].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (comparison !== 0) {
        return sort === "name-asc" ? comparison : -comparison;
      }

      return a.id.localeCompare(b.id);
    });
  }

  return sortGroupedApps(apps);
}

export function groupAppsByBundleId(apps: AppDto[]): AppDto[] {
  const groups = new Map<string, AppDto[]>();

  for (const app of apps) {
    const key = appGroupKey(app);
    groups.set(key, [...(groups.get(key) ?? []), app]);
  }

  return sortGroupedApps(
    Array.from(groups.values()).map((group) => {
      const sortedGroup = sortGroupedApps(group);
      const representative = sortedGroup[0]!;
      const downloadOptions = dedupeDownloadOptions(group.flatMap((app) => app.downloadOptions));
      const preferredOption = downloadOptions[0];

      return {
        ...representative,
        id: representative.bundleIdentifier
          ? `bundle:${representative.bundleIdentifier.toLowerCase()}`
          : representative.id,
        sourceId: downloadOptions.length === 1 ? representative.sourceId : "multiple",
        sourceName: downloadOptions.length === 1 ? representative.sourceName : `${downloadOptions.length} sources`,
        latestVersion: preferredOption?.latestVersion ?? representative.latestVersion,
        versionDate: preferredOption?.versionDate ?? representative.versionDate,
        downloadURL: preferredOption?.downloadURL ?? representative.downloadURL,
        size: preferredOption?.size ?? representative.size,
        minOSVersion: preferredOption?.minOSVersion ?? representative.minOSVersion,
        appStoreUrl: representative.appStoreUrl ?? group.find((app) => app.appStoreUrl)?.appStoreUrl ?? null,
        downloadOptions
      };
    })
  );
}

export function getCategoryFacets(apps: AppDto[]): AppCategoryFacet[] {
  const categories: Array<{ id: AppCategory; name: string }> = [
    { id: "all", name: "All apps" },
    { id: "recent", name: "Recently updated" },
    { id: "games", name: "Games" },
    { id: "tools", name: "Tools" },
    { id: "media", name: "Media" },
    { id: "education", name: "Education" }
  ];

  return categories.map((category) => ({
    ...category,
    appCount: groupAppsByBundleId(filterAppsByCategory(apps, category.id)).length
  }));
}

export function paginateApps(apps: AppDto[], query: BrowseAppsQuery): { apps: AppDto[]; pagination: Pagination } {
  const totalItems = apps.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const page = Math.min(query.page, Math.max(totalPages, 1));
  const start = (page - 1) * query.pageSize;

  return {
    apps: apps.slice(start, start + query.pageSize),
    pagination: {
      page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}
