export const DOWNLOADED_APPS_STORAGE_KEY = "iappstores:downloaded-apps:v1";

export type DownloadedAppRecord = {
  appId: string;
  appName: string;
  sourceId: string;
  sourceName: string;
  downloadedAt: number;
};

type DownloadedAppsStorage = {
  apps: Record<string, DownloadedAppRecord>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isDownloadedAppRecord(value: unknown): value is DownloadedAppRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DownloadedAppRecord>;
  return (
    typeof candidate.appId === "string" &&
    candidate.appId.length > 0 &&
    typeof candidate.appName === "string" &&
    typeof candidate.sourceId === "string" &&
    candidate.sourceId.length > 0 &&
    typeof candidate.sourceName === "string" &&
    typeof candidate.downloadedAt === "number" &&
    Number.isFinite(candidate.downloadedAt)
  );
}

function parseDownloadedApps(raw: string | null): DownloadedAppsStorage {
  if (!raw) {
    return { apps: {} };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("apps" in parsed)) {
      return { apps: {} };
    }

    const apps = (parsed as { apps?: unknown }).apps;
    if (typeof apps !== "object" || apps === null || Array.isArray(apps)) {
      return { apps: {} };
    }

    return {
      apps: Object.fromEntries(
        Object.entries(apps).filter((entry): entry is [string, DownloadedAppRecord] =>
          isDownloadedAppRecord(entry[1])
        )
      )
    };
  } catch {
    return { apps: {} };
  }
}

export function readDownloadedAppRecords(storage = getBrowserStorage()): DownloadedAppRecord[] {
  if (!storage) {
    return [];
  }

  return Object.values(parseDownloadedApps(storage.getItem(DOWNLOADED_APPS_STORAGE_KEY)).apps);
}

export function readDownloadedAppIds(storage = getBrowserStorage()): Set<string> {
  return new Set(readDownloadedAppRecords(storage).map((record) => record.appId));
}

export function recordDownloadedApp(
  input: Omit<DownloadedAppRecord, "downloadedAt"> & { downloadedAt?: number },
  storage = getBrowserStorage()
): DownloadedAppRecord | null {
  if (!storage) {
    return null;
  }

  const current = parseDownloadedApps(storage.getItem(DOWNLOADED_APPS_STORAGE_KEY));
  const record: DownloadedAppRecord = {
    appId: input.appId,
    appName: input.appName,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    downloadedAt: input.downloadedAt ?? Date.now()
  };

  storage.setItem(
    DOWNLOADED_APPS_STORAGE_KEY,
    JSON.stringify({
      apps: {
        ...current.apps,
        [record.appId]: record
      }
    })
  );

  return record;
}
