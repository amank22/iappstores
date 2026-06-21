import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  PopularDownloadStatsItem,
  ProblemDownloadLinkStatsItem
} from "@iappstores/contracts";
import { getRepoCacheDbPath } from "./repoCacheStore.js";

export type DownloadProbeStatus = "success" | "hard_failure" | "inconclusive";

export type DownloadAnalyticsInput = {
  appId: string;
  bundleIdentifier: string | null;
  appName: string;
  sourceId: string;
  sourceName: string;
  downloadURL: string;
  probeStatus: DownloadProbeStatus;
  probeStatusCode: number | null;
  probeError: string | null;
  createdAt?: number;
};

type PopularDownloadStatsRow = {
  app_id: string;
  bundle_identifier: string | null;
  app_name: string;
  download_count: number;
  last_downloaded_at: number | null;
};

type ProblemDownloadLinkStatsRow = {
  app_id: string;
  bundle_identifier: string | null;
  app_name: string;
  source_id: string;
  source_name: string;
  download_url: string;
  failure_count: number;
  last_status: string;
  last_status_code: number | null;
  last_failure_at: number | null;
};

let database: DatabaseSync | undefined;

function createDatabase(): DatabaseSync {
  const dbPath = getRepoCacheDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS download_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      bundle_identifier TEXT,
      app_name TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      download_url TEXT NOT NULL,
      probe_status TEXT NOT NULL CHECK (probe_status IN ('success', 'hard_failure', 'inconclusive')),
      probe_status_code INTEGER,
      probe_error TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_download_events_app_id_created_at
      ON download_events (app_id, created_at);

    CREATE TABLE IF NOT EXISTS download_link_stats (
      app_id TEXT NOT NULL,
      bundle_identifier TEXT,
      app_name TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      download_url TEXT NOT NULL,
      click_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      inconclusive_count INTEGER NOT NULL DEFAULT 0,
      last_status TEXT NOT NULL,
      last_status_code INTEGER,
      last_error TEXT,
      first_downloaded_at INTEGER NOT NULL,
      last_downloaded_at INTEGER NOT NULL,
      last_checked_at INTEGER NOT NULL,
      last_success_at INTEGER,
      last_failure_at INTEGER,
      PRIMARY KEY (app_id, source_id, download_url)
    );

    CREATE INDEX IF NOT EXISTS idx_download_link_stats_click_count
      ON download_link_stats (click_count DESC, last_downloaded_at DESC);

    CREATE INDEX IF NOT EXISTS idx_download_link_stats_failure_count
      ON download_link_stats (failure_count DESC, last_failure_at DESC);
  `);

  return db;
}

export function initDownloadAnalyticsStore(): void {
  database ??= createDatabase();
}

function getDatabase(): DatabaseSync {
  initDownloadAnalyticsStore();
  return database!;
}

function toIncrement(status: DownloadProbeStatus, expectedStatus: DownloadProbeStatus): number {
  return status === expectedStatus ? 1 : 0;
}

export function recordDownloadAttempt(input: DownloadAnalyticsInput): void {
  const createdAt = input.createdAt ?? Date.now();
  const successIncrement = toIncrement(input.probeStatus, "success");
  const failureIncrement = toIncrement(input.probeStatus, "hard_failure");
  const inconclusiveIncrement = toIncrement(input.probeStatus, "inconclusive");
  const lastSuccessAt = input.probeStatus === "success" ? createdAt : null;
  const lastFailureAt = input.probeStatus === "hard_failure" ? createdAt : null;
  const db = getDatabase();

  db.exec("BEGIN");

  try {
    db.prepare(
      `
        INSERT INTO download_events (
          app_id, bundle_identifier, app_name, source_id, source_name, download_url,
          probe_status, probe_status_code, probe_error, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      input.appId,
      input.bundleIdentifier,
      input.appName,
      input.sourceId,
      input.sourceName,
      input.downloadURL,
      input.probeStatus,
      input.probeStatusCode,
      input.probeError,
      createdAt
    );

    db.prepare(
      `
        INSERT INTO download_link_stats (
          app_id, bundle_identifier, app_name, source_id, source_name, download_url,
          click_count, success_count, failure_count, inconclusive_count,
          last_status, last_status_code, last_error,
          first_downloaded_at, last_downloaded_at, last_checked_at, last_success_at, last_failure_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(app_id, source_id, download_url) DO UPDATE SET
          bundle_identifier = excluded.bundle_identifier,
          app_name = excluded.app_name,
          source_name = excluded.source_name,
          click_count = download_link_stats.click_count + 1,
          success_count = download_link_stats.success_count + excluded.success_count,
          failure_count = download_link_stats.failure_count + excluded.failure_count,
          inconclusive_count = download_link_stats.inconclusive_count + excluded.inconclusive_count,
          last_status = excluded.last_status,
          last_status_code = excluded.last_status_code,
          last_error = excluded.last_error,
          last_downloaded_at = excluded.last_downloaded_at,
          last_checked_at = excluded.last_checked_at,
          last_success_at = COALESCE(excluded.last_success_at, download_link_stats.last_success_at),
          last_failure_at = COALESCE(excluded.last_failure_at, download_link_stats.last_failure_at)
      `
    ).run(
      input.appId,
      input.bundleIdentifier,
      input.appName,
      input.sourceId,
      input.sourceName,
      input.downloadURL,
      successIncrement,
      failureIncrement,
      inconclusiveIncrement,
      input.probeStatus,
      input.probeStatusCode,
      input.probeError,
      createdAt,
      createdAt,
      createdAt,
      lastSuccessAt,
      lastFailureAt
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readPopularDownloadStats(limit: number): PopularDownloadStatsItem[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT
          app_id,
          bundle_identifier,
          app_name,
          SUM(click_count) AS download_count,
          MAX(last_downloaded_at) AS last_downloaded_at
        FROM download_link_stats
        GROUP BY app_id, bundle_identifier, app_name
        ORDER BY download_count DESC, last_downloaded_at DESC
        LIMIT ?
      `
    )
    .all(limit) as PopularDownloadStatsRow[];

  return rows.map((row) => ({
    appId: row.app_id,
    bundleIdentifier: row.bundle_identifier,
    appName: row.app_name,
    downloadCount: row.download_count,
    lastDownloadedAt: row.last_downloaded_at
  }));
}

export function readProblemDownloadLinkStats(limit: number): ProblemDownloadLinkStatsItem[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT
          app_id,
          bundle_identifier,
          app_name,
          source_id,
          source_name,
          download_url,
          failure_count,
          last_status,
          last_status_code,
          last_failure_at
        FROM download_link_stats
        WHERE failure_count > 0 AND last_status = 'hard_failure'
        ORDER BY last_failure_at DESC, failure_count DESC
        LIMIT ?
      `
    )
    .all(limit) as ProblemDownloadLinkStatsRow[];

  return rows.map((row) => ({
    appId: row.app_id,
    bundleIdentifier: row.bundle_identifier,
    appName: row.app_name,
    sourceId: row.source_id,
    sourceName: row.source_name,
    downloadURL: row.download_url,
    failureCount: row.failure_count,
    lastStatus: row.last_status,
    lastStatusCode: row.last_status_code,
    lastFailureAt: row.last_failure_at
  }));
}

export function closeDownloadAnalyticsStore(): void {
  if (database?.isOpen) {
    database.close();
  }

  database = undefined;
}
