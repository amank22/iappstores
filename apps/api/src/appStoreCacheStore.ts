import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppStoreMetadataSchema, type AppStoreMetadata } from "@iappstores/contracts";
import { getRepoCacheDbPath } from "./repoCacheStore.js";

type AppStoreCacheRow = {
  country: string;
  bundle_id: string;
  status: "hit" | "miss" | "error";
  fetched_at: number;
  expires_at: number;
  metadata_json: string | null;
  last_error: string | null;
  last_error_at: number | null;
};

export type AppStoreCacheEntry = {
  country: string;
  bundleId: string;
  status: "hit" | "miss" | "error";
  fetchedAt: number;
  expiresAt: number;
  metadata: AppStoreMetadata | null;
  lastError: string | null;
  lastErrorAt: number | null;
  isExpired: boolean;
};

let database: DatabaseSync | undefined;

function createDatabase(): DatabaseSync {
  const dbPath = getRepoCacheDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS app_store_cache (
      country TEXT NOT NULL,
      bundle_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('hit', 'miss', 'error')),
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      metadata_json TEXT,
      last_error TEXT,
      last_error_at INTEGER,
      PRIMARY KEY (country, bundle_id)
    );

    CREATE INDEX IF NOT EXISTS idx_app_store_cache_expires_at
      ON app_store_cache (expires_at);
  `);

  return db;
}

export function initAppStoreCacheStore(): void {
  database ??= createDatabase();
}

function getDatabase(): DatabaseSync {
  initAppStoreCacheStore();
  return database!;
}

function toCacheEntry(row: AppStoreCacheRow, now = Date.now()): AppStoreCacheEntry | null {
  try {
    const metadata = row.metadata_json
      ? AppStoreMetadataSchema.parse(JSON.parse(row.metadata_json) as unknown)
      : null;

    return {
      country: row.country,
      bundleId: row.bundle_id,
      status: row.status,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      metadata,
      lastError: row.last_error,
      lastErrorAt: row.last_error_at,
      isExpired: row.expires_at <= now
    };
  } catch {
    return null;
  }
}

export function readAppStoreCache(country: string, bundleId: string): AppStoreCacheEntry | null {
  const row = getDatabase()
    .prepare(
      `
        SELECT country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at
        FROM app_store_cache
        WHERE country = ? AND bundle_id = ?
      `
    )
    .get(country, bundleId) as AppStoreCacheRow | undefined;

  return row ? toCacheEntry(row) : null;
}

export function writeAppStoreCacheHit(
  country: string,
  bundleId: string,
  metadata: AppStoreMetadata,
  ttlMs: number,
  now = Date.now()
): void {
  getDatabase()
    .prepare(
      `
        INSERT INTO app_store_cache (
          country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at
        )
        VALUES (?, ?, 'hit', ?, ?, ?, NULL, NULL)
        ON CONFLICT(country, bundle_id) DO UPDATE SET
          status = excluded.status,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          metadata_json = excluded.metadata_json,
          last_error = NULL,
          last_error_at = NULL
      `
    )
    .run(country, bundleId, now, now + ttlMs, JSON.stringify(metadata));
}

export function writeAppStoreCacheMiss(country: string, bundleId: string, ttlMs: number, now = Date.now()): void {
  getDatabase()
    .prepare(
      `
        INSERT INTO app_store_cache (
          country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at
        )
        VALUES (?, ?, 'miss', ?, ?, NULL, NULL, NULL)
        ON CONFLICT(country, bundle_id) DO UPDATE SET
          status = excluded.status,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          metadata_json = NULL,
          last_error = NULL,
          last_error_at = NULL
      `
    )
    .run(country, bundleId, now, now + ttlMs);
}

export function writeAppStoreCacheError(
  country: string,
  bundleId: string,
  error: unknown,
  ttlMs: number,
  now = Date.now()
): void {
  const message = error instanceof Error ? error.message : String(error);

  getDatabase()
    .prepare(
      `
        INSERT INTO app_store_cache (
          country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at
        )
        VALUES (?, ?, 'error', ?, ?, NULL, ?, ?)
        ON CONFLICT(country, bundle_id) DO UPDATE SET
          status = excluded.status,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          metadata_json = NULL,
          last_error = excluded.last_error,
          last_error_at = excluded.last_error_at
      `
    )
    .run(country, bundleId, now, now + ttlMs, message, now);
}

export function closeAppStoreCacheStore(): void {
  if (database?.isOpen) {
    database.close();
  }

  database = undefined;
}
