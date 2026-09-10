-- Schema for the single shared SQLite database, combining what used to be four
-- separate node:sqlite handles onto the same file (repo cache, catalog store + FTS5,
-- App Store cache, download analytics). All statements are idempotent so this file can
-- be re-applied safely on every boot.

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

CREATE INDEX IF NOT EXISTS idx_source_cache_expires_at ON source_cache (expires_at);

CREATE TABLE IF NOT EXISTS catalog_apps (
  canonical_id TEXT PRIMARY KEY,
  app_json TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  metadata_updated_at INTEGER NOT NULL,
  missing_since INTEGER,
  missing_count INTEGER NOT NULL DEFAULT 0,
  removed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','missing','removed')),
  replacement_id TEXT,
  category TEXT,
  developer_slug TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_apps_status_updated ON catalog_apps(status, metadata_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_apps_category ON catalog_apps(category, status);
CREATE INDEX IF NOT EXISTS idx_catalog_apps_developer_slug ON catalog_apps(developer_slug, status);

CREATE TABLE IF NOT EXISTS catalog_source_apps (
  owner_source_id TEXT NOT NULL,
  source_app_id TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  app_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY(owner_source_id, source_app_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_source_apps_canonical ON catalog_source_apps(canonical_id, active);

CREATE TABLE IF NOT EXISTS catalog_versions (
  canonical_id TEXT NOT NULL,
  version_key TEXT NOT NULL,
  version TEXT NOT NULL,
  source_id TEXT NOT NULL,
  build_key TEXT NOT NULL,
  release_date TEXT,
  build_json TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY(canonical_id, version_key, source_id, build_key)
);

CREATE INDEX IF NOT EXISTS idx_catalog_versions_app ON catalog_versions(canonical_id, release_date DESC, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS catalog_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN ('new','version')),
  occurred_at INTEGER NOT NULL,
  canonical_id TEXT NOT NULL,
  version TEXT,
  title TEXT NOT NULL,
  summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_events_time ON catalog_events(occurred_at DESC, event_type);

CREATE TABLE IF NOT EXISTS catalog_aliases (
  alias TEXT PRIMARY KEY COLLATE NOCASE,
  canonical_id TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_app_store_cache_expires_at ON app_store_cache (expires_at);

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
  session_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_download_events_app_id_created_at ON download_events (app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_download_events_session_created ON download_events(session_hash, created_at);

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

CREATE INDEX IF NOT EXISTS idx_download_link_stats_click_count ON download_link_stats (click_count DESC, last_downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_link_stats_failure_count ON download_link_stats (failure_count DESC, last_failure_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
