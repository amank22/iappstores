import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { AppDtoSchema, type AppDto } from "@iappstores/contracts";
import type { SourceDefinition } from "./sources.js";

type SourceCacheRow = {
  source_id: string;
  source_url: string;
  fetched_at: number;
  expires_at: number;
  app_count: number;
  apps_json: string;
  last_error: string | null;
  last_error_at: number | null;
};

export type SourceCacheEntry = {
  sourceId: string;
  sourceUrl: string;
  fetchedAt: number;
  expiresAt: number;
  appCount: number;
  apps: AppDto[];
  lastError: string | null;
  lastErrorAt: number | null;
  isExpired: boolean;
};

const AppDtoArraySchema = z.array(AppDtoSchema);
let database: DatabaseSync | undefined;

function getDefaultDataDir(): string {
  return process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(".data");
}

export function getRepoCacheDbPath(): string {
  return process.env.REPO_CACHE_DB_PATH ?? join(getDefaultDataDir(), "iappstores.sqlite");
}

function createDatabase(): DatabaseSync {
  const dbPath = getRepoCacheDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS source_cache (
      source_id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      app_count INTEGER NOT NULL,
      apps_json TEXT NOT NULL,
      last_error TEXT,
      last_error_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_source_cache_expires_at
      ON source_cache (expires_at);
  `);

  return db;
}

export function initRepoCacheStore(): void {
  database ??= createDatabase();
}

function getDatabase(): DatabaseSync {
  initRepoCacheStore();
  return database!;
}

function toCacheEntry(row: SourceCacheRow, now = Date.now()): SourceCacheEntry | null {
  try {
    return {
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      appCount: row.app_count,
      apps: AppDtoArraySchema.parse(JSON.parse(row.apps_json) as unknown),
      lastError: row.last_error,
      lastErrorAt: row.last_error_at,
      isExpired: row.expires_at <= now
    };
  } catch {
    return null;
  }
}

export function readSourceCache(source: Pick<SourceDefinition, "id" | "url">): SourceCacheEntry | null {
  const row = getDatabase()
    .prepare(
      `
        SELECT source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at
        FROM source_cache
        WHERE source_id = ?
      `
    )
    .get(source.id) as SourceCacheRow | undefined;

  if (!row || row.source_url !== source.url) {
    return null;
  }

  return toCacheEntry(row);
}

export function writeSourceCache(source: SourceDefinition, apps: AppDto[], ttlMs: number, now = Date.now()): void {
  getDatabase()
    .prepare(
      `
        INSERT INTO source_cache (
          source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(source_id) DO UPDATE SET
          source_url = excluded.source_url,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          app_count = excluded.app_count,
          apps_json = excluded.apps_json,
          last_error = NULL,
          last_error_at = NULL
      `
    )
    .run(source.id, source.url, now, now + ttlMs, apps.length, JSON.stringify(apps));
}

export function writeSourceCacheError(source: Pick<SourceDefinition, "id">, error: unknown, now = Date.now()): void {
  const message = error instanceof Error ? error.message : String(error);

  getDatabase()
    .prepare(
      `
        UPDATE source_cache
        SET last_error = ?, last_error_at = ?
        WHERE source_id = ?
      `
    )
    .run(message, now, source.id);
}

export function closeRepoCacheStore(): void {
  if (database?.isOpen) {
    database.close();
  }

  database = undefined;
}
