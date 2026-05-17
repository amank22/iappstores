import type { AppDto } from "@iappstores/contracts";
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
        iconUrl: asUrl(app.iconURL ?? app.iconUrl),
        screenshots: asUrlArray(app.screenshots),
        latestVersion: latest ? asString(latest.version) : null,
        versionDate: latest ? asString(latest.date) : null,
        versionDescription: latest ? asString(latest.localizedDescription ?? latest.description) : null,
        downloadURL: latest ? asUrl(latest.downloadURL ?? latest.downloadUrl) : null,
        size: latest ? asNumber(latest.size) : null,
        minOSVersion: latest ? asString(latest.minOSVersion ?? latest.minOsVersion) : null
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

  return apps.filter((app) => {
    const haystack = [
      app.name,
      app.bundleIdentifier,
      app.developerName,
      app.subtitle,
      app.description,
      app.latestVersion
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}
