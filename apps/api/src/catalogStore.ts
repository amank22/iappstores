import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { AppDtoSchema, type AppDto, type AppVersion, type UpdateEvent, type ArchiveSummary, type AppStatusResponse } from "@iappstores/contracts";
import { groupAppsByBundleId } from "./normalizer.js";
import { getRepoCacheDbPath } from "./repoCacheStore.js";

type CatalogRow = {
  canonical_id: string;
  app_json: string;
  metadata_hash: string;
  first_seen_at: number;
  last_seen_at: number;
  metadata_updated_at: number;
  missing_since: number | null;
  missing_count: number;
  removed_at: number | null;
  status: "active" | "missing" | "removed";
  replacement_id: string | null;
};

type SnapshotRow = { app_json: string };
type VersionRow = { version: string; release_date: string | null; build_json: string; first_seen_at: number; last_seen_at: number };
type EventRow = { id: string; event_type: "new" | "version"; occurred_at: number; canonical_id: string; version: string | null; title: string; summary: string | null; app_json: string };

let database: DatabaseSync | undefined;
let searchIndexReady: boolean | undefined;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function searchIndexAvailable(): boolean {
  if (searchIndexReady !== undefined) {
    return searchIndexReady;
  }

  try {
    db().exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS catalog_search USING fts5(
        canonical_id UNINDEXED,
        name,
        bundle_identifier,
        developer_name,
        subtitle,
        description,
        latest_version,
        tokenize = 'porter unicode61 remove_diacritics 2'
      );
    `);
    searchIndexReady = true;
    backfillSearchIndexIfEmpty();
  } catch (error) {
    console.warn("FTS5 is not available in this node:sqlite build; falling back to linear search.", error);
    searchIndexReady = false;
  }

  return searchIndexReady;
}

function backfillSearchIndexIfEmpty(): void {
  const { count } = db().prepare(`SELECT COUNT(*) AS count FROM catalog_search`).get() as { count: number };
  if (count > 0) {
    return;
  }

  const rows = db().prepare(`SELECT canonical_id, app_json FROM catalog_apps WHERE status != 'removed'`).all() as Array<{
    canonical_id: string;
    app_json: string;
  }>;

  if (rows.length === 0) {
    return;
  }

  console.log(`Backfilling search index for ${rows.length} existing catalog app${rows.length === 1 ? "" : "s"}...`);

  for (const row of rows) {
    const parsed = AppDtoSchema.safeParse(JSON.parse(row.app_json) as unknown);
    if (parsed.success) {
      upsertSearchIndex(row.canonical_id, parsed.data);
    }
  }
}

export function isSearchIndexAvailable(): boolean {
  return searchIndexAvailable();
}

function db(): DatabaseSync {
  if (!database?.isOpen) {
    database = new DatabaseSync(getRepoCacheDbPath());
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
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
        replacement_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_catalog_apps_status_updated ON catalog_apps(status, metadata_updated_at DESC);
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
    `);
  }
  return database;
}

function canonicalId(app: Pick<AppDto, "id" | "bundleIdentifier">): string {
  return app.bundleIdentifier?.toLowerCase() ?? app.id;
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function meaningfulApp(app: AppDto): unknown {
  const { firstSeenAt: _first, lastSeenAt: _last, metadataUpdatedAt: _metadata, lastUpdatedAt: _updated, canonicalStatus: _status, canonicalId: _canonical, appStore, ...rest } = app;
  if (!appStore) return rest;
  const { fetchedAt: _fetchedAt, ...meaningfulStore } = appStore;
  return { ...rest, appStore: meaningfulStore };
}

function hashApp(app: AppDto): string {
  return createHash("sha256").update(JSON.stringify(meaningfulApp(app))).digest("hex");
}

function validDate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function versionKey(version: string): string {
  return version.trim().toLowerCase();
}

function buildKey(downloadURL: string | null, changelog: string | null): string {
  return createHash("sha1").update(`${downloadURL ?? ""}|${changelog ?? ""}`).digest("hex");
}

function decorate(app: AppDto, row: CatalogRow): AppDto {
  const release = validDate(app.versionDate);
  const updated = release ?? row.metadata_updated_at;
  return {
    ...app,
    firstSeenAt: iso(row.first_seen_at),
    lastSeenAt: iso(row.last_seen_at),
    metadataUpdatedAt: iso(row.metadata_updated_at),
    lastUpdatedAt: iso(updated),
    canonicalId: row.canonical_id,
    canonicalStatus: row.status
  };
}

function readRow(id: string): CatalogRow | undefined {
  return db().prepare(`SELECT * FROM catalog_apps WHERE canonical_id = ?`).get(id) as CatalogRow | undefined;
}

function readRowsBatch(ids: string[]): Map<string, CatalogRow> {
  const result = new Map<string, CatalogRow>();
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return result;
  }

  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = db()
    .prepare(`SELECT * FROM catalog_apps WHERE canonical_id IN (${placeholders})`)
    .all(...uniqueIds) as CatalogRow[];

  for (const row of rows) {
    result.set(row.canonical_id, row);
  }

  return result;
}

function upsertSearchIndex(id: string, app: AppDto): void {
  if (!searchIndexAvailable()) {
    return;
  }

  const text = (value: string | null | undefined) => value ?? "";
  db().prepare(`DELETE FROM catalog_search WHERE canonical_id = ?`).run(id);
  db()
    .prepare(
      `INSERT INTO catalog_search(canonical_id, name, bundle_identifier, developer_name, subtitle, description, latest_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, app.name, text(app.bundleIdentifier), text(app.developerName), text(app.subtitle), text(app.description), text(app.latestVersion));
}

function removeFromSearchIndex(id: string): void {
  if (!searchIndexAvailable()) {
    return;
  }

  db().prepare(`DELETE FROM catalog_search WHERE canonical_id = ?`).run(id);
}

const FTS5_SPECIAL_CHARS = /["*^:().]/g;

function toMatchQuery(query: string): string | null {
  const terms = query
    .replace(FTS5_SPECIAL_CHARS, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, 8);

  if (terms.length === 0) {
    return null;
  }

  return terms.map((term) => `"${term.replace(/"/g, '""')}"*`).join(" AND ");
}

export function searchCatalogIds(query: string, limit = 500): string[] {
  if (!searchIndexAvailable()) {
    return [];
  }

  const matchQuery = toMatchQuery(query);
  if (!matchQuery) {
    return [];
  }

  const rows = db()
    .prepare(
      `SELECT canonical_id, bm25(catalog_search, 3.0, 2.0, 2.0, 1.5, 1.0, 1.0) AS rank
       FROM catalog_search
       WHERE catalog_search MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(matchQuery, limit) as Array<{ canonical_id: string; rank: number }>;

  return rows.map((row) => row.canonical_id);
}

function rebuildCanonical(id: string, now: number): void {
  const snapshots = db().prepare(`SELECT app_json FROM catalog_source_apps WHERE canonical_id = ? AND active = 1`).all(id) as SnapshotRow[];
  const previous = readRow(id);
  if (snapshots.length === 0) {
    if (!previous) return;
    const missingSince = previous.missing_since ?? now;
    const missingCount = previous.missing_count + 1;
    const status = missingCount >= 2 && now - missingSince >= 48 * HOUR
      ? (now - missingSince >= 30 * DAY && !previous.replacement_id ? "removed" : "missing")
      : previous.status;
    db().prepare(`UPDATE catalog_apps SET missing_since = ?, missing_count = ?, status = ?, removed_at = CASE WHEN ? = 'removed' THEN COALESCE(removed_at, ?) ELSE removed_at END WHERE canonical_id = ?`)
      .run(missingSince, missingCount, status, status, now, id);
    if (status === "removed" && previous.status !== "removed") {
      removeFromSearchIndex(id);
    }
    return;
  }

  const apps = snapshots.flatMap((row) => {
    const parsed = AppDtoSchema.safeParse(JSON.parse(row.app_json) as unknown);
    return parsed.success ? [parsed.data] : [];
  });
  const grouped = groupAppsByBundleId(apps)[0];
  if (!grouped) return;
  const hash = hashApp(grouped);
  const firstSeen = previous?.first_seen_at ?? now;
  const metadataUpdated = previous && previous.metadata_hash === hash ? previous.metadata_updated_at : now;
  const decorated = { ...grouped, firstSeenAt: iso(firstSeen), lastSeenAt: iso(now), metadataUpdatedAt: iso(metadataUpdated), lastUpdatedAt: grouped.versionDate ?? iso(metadataUpdated), canonicalId: id, canonicalStatus: "active" as const };
  db().prepare(`
    INSERT INTO catalog_apps(canonical_id, app_json, metadata_hash, first_seen_at, last_seen_at, metadata_updated_at, status)
    VALUES(?,?,?,?,?,?,'active')
    ON CONFLICT(canonical_id) DO UPDATE SET app_json=excluded.app_json, metadata_hash=excluded.metadata_hash,
      last_seen_at=excluded.last_seen_at, metadata_updated_at=excluded.metadata_updated_at,
      missing_since=NULL, missing_count=0, removed_at=NULL, status='active'
  `).run(id, JSON.stringify(decorated), hash, firstSeen, now, metadataUpdated);

  db().prepare(`INSERT OR IGNORE INTO catalog_events(id,event_type,occurred_at,canonical_id,title) VALUES(?, 'new', ?, ?, ?)`)
    .run(`new:${id}`, firstSeen, id, `New app: ${grouped.name}`);

  upsertSearchIndex(id, decorated);
}

export function syncSourceCatalog(ownerSourceId: string, apps: AppDto[], now = Date.now()): void {
  const store = db();
  const previousIds = (store.prepare(`SELECT DISTINCT canonical_id FROM catalog_source_apps WHERE owner_source_id = ? AND active = 1`).all(ownerSourceId) as Array<{ canonical_id: string }>).map((row) => row.canonical_id);
  const presentSourceIds = new Set(apps.map((app) => app.id));
  const impacted = new Set(previousIds);
  store.exec("BEGIN");
  try {
    for (const app of apps) {
      const id = canonicalId(app);
      impacted.add(id);
      store.prepare(`
        INSERT INTO catalog_source_apps(owner_source_id,source_app_id,canonical_id,app_json,active,first_seen_at,last_seen_at)
        VALUES(?,?,?,?,1,?,?)
        ON CONFLICT(owner_source_id,source_app_id) DO UPDATE SET canonical_id=excluded.canonical_id, app_json=excluded.app_json, active=1, last_seen_at=excluded.last_seen_at
      `).run(ownerSourceId, app.id, id, JSON.stringify(app), now, now);
      store.prepare(`INSERT INTO catalog_aliases(alias,canonical_id) VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET canonical_id=excluded.canonical_id`).run(app.id, id);
      if (app.bundleIdentifier) {
        store.prepare(`INSERT INTO catalog_aliases(alias,canonical_id) VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET canonical_id=excluded.canonical_id`).run(app.bundleIdentifier, id);
        store.prepare(`INSERT INTO catalog_aliases(alias,canonical_id) VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET canonical_id=excluded.canonical_id`).run(`bundle:${id}`, id);
      }
      for (const build of app.versions) {
        const releaseAt = validDate(build.releaseDate);
        const occurredAt = releaseAt ?? now;
        const withSeen = { ...build, firstSeenAt: iso(now), lastSeenAt: iso(now) };
        store.prepare(`
          INSERT INTO catalog_versions(canonical_id,version_key,version,source_id,build_key,release_date,build_json,first_seen_at,last_seen_at)
          VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(canonical_id,version_key,source_id,build_key) DO UPDATE SET build_json=excluded.build_json,last_seen_at=excluded.last_seen_at
        `).run(id, versionKey(build.version), build.version, build.sourceId, buildKey(build.downloadURL, build.changelog), build.releaseDate, JSON.stringify(withSeen), now, now);
        store.prepare(`INSERT OR IGNORE INTO catalog_events(id,event_type,occurred_at,canonical_id,version,title,summary) VALUES(?, 'version', ?, ?, ?, ?, ?)`)
          .run(`version:${id}:${versionKey(build.version)}`, occurredAt, id, build.version, `${app.name} ${build.version}`, build.changelog);
      }
    }
    const oldRows = store.prepare(`SELECT source_app_id FROM catalog_source_apps WHERE owner_source_id = ? AND active = 1`).all(ownerSourceId) as Array<{ source_app_id: string }>;
    for (const row of oldRows) {
      if (!presentSourceIds.has(row.source_app_id)) {
        store.prepare(`UPDATE catalog_source_apps SET active=0 WHERE owner_source_id=? AND source_app_id=?`).run(ownerSourceId, row.source_app_id);
      }
    }
    for (const id of impacted) rebuildCanonical(id, now);
    store.exec("COMMIT");
  } catch (error) {
    store.exec("ROLLBACK");
    throw error;
  }
}

export function hydrateCatalogApps(apps: AppDto[]): AppDto[] {
  const rowsById = readRowsBatch(apps.map((app) => canonicalId(app)));
  return apps.map((app) => {
    const row = rowsById.get(canonicalId(app));
    return row ? decorate(app, row) : app;
  });
}

export function readCatalogApp(id: string): AppDto | null {
  const status = readAppStatus(id);
  return status.app;
}

export function readAppStatus(requestedId: string): AppStatusResponse {
  const alias = db().prepare(`SELECT canonical_id FROM catalog_aliases WHERE alias = ? COLLATE NOCASE`).get(requestedId) as { canonical_id: string } | undefined;
  const normalized = requestedId.toLowerCase().replace(/^bundle:/, "");
  const id = alias?.canonical_id ?? normalized;
  const row = readRow(id);
  if (!row) return { status: "missing", requestedId, canonicalId: null, replacementId: null, app: null, missingSince: null, removedAt: null };
  const parsed = AppDtoSchema.safeParse(JSON.parse(row.app_json) as unknown);
  const app = parsed.success ? decorate(parsed.data, row) : null;
  const isRedirect = requestedId !== id && requestedId.toLowerCase() !== id;
  return {
    status: row.replacement_id || isRedirect ? "redirect" : row.status,
    requestedId,
    canonicalId: id,
    replacementId: row.replacement_id,
    app,
    missingSince: iso(row.missing_since),
    removedAt: iso(row.removed_at)
  };
}

export function readAppVersions(id: string): AppVersion[] {
  const status = readAppStatus(id);
  if (!status.canonicalId) return [];
  const rows = db().prepare(`SELECT version,release_date,build_json,first_seen_at,last_seen_at FROM catalog_versions WHERE canonical_id=? ORDER BY COALESCE(release_date,'') DESC,first_seen_at DESC`).all(status.canonicalId) as VersionRow[];
  const groups = new Map<string, AppVersion>();
  for (const row of rows) {
    const build = JSON.parse(row.build_json) as AppVersion["builds"][number];
    const key = versionKey(row.version);
    const current = groups.get(key) ?? { version: row.version, releaseDate: row.release_date, changelog: build.changelog, firstSeenAt: iso(row.first_seen_at), metadataUpdatedAt: iso(row.last_seen_at), builds: [] };
    current.builds.push({ ...build, firstSeenAt: build.firstSeenAt ?? iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at) });
    if (!current.changelog && build.changelog) current.changelog = build.changelog;
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function readUpdateEvents(from: number | null, to: number | null, type: "all" | "new" | "version", limit = 1000): UpdateEvent[] {
  const clauses = ["a.status = 'active'"];
  const params: Array<string | number> = [];
  if (from !== null) { clauses.push("e.occurred_at >= ?"); params.push(from); }
  if (to !== null) { clauses.push("e.occurred_at < ?"); params.push(to); }
  if (type !== "all") { clauses.push("e.event_type = ?"); params.push(type); }
  params.push(limit);
  const rows = db().prepare(`SELECT e.*,a.app_json FROM catalog_events e JOIN catalog_apps a ON a.canonical_id=e.canonical_id WHERE ${clauses.join(" AND ")} ORDER BY e.occurred_at DESC LIMIT ?`).all(...params) as EventRow[];
  return rows.flatMap((row) => {
    const parsed = AppDtoSchema.safeParse(JSON.parse(row.app_json) as unknown);
    if (!parsed.success) return [];
    return [{ id: row.id, type: row.event_type, occurredAt: new Date(row.occurred_at).toISOString(), app: parsed.data, version: row.version, title: row.title, summary: row.summary }];
  });
}

function isoWeek(date: Date): { key: string; from: Date; to: Date } {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / DAY) + 1) / 7);
  const from = new Date(value); from.setUTCDate(value.getUTCDate() - 3); from.setUTCHours(0, 0, 0, 0);
  return { key: `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, from, to: new Date(from.getTime() + 7 * DAY) };
}

export function readArchives(): { weeks: ArchiveSummary[]; months: ArchiveSummary[] } {
  const rows = db().prepare(`SELECT occurred_at FROM catalog_events ORDER BY occurred_at DESC`).all() as Array<{ occurred_at: number }>;
  const weeks = new Map<string, ArchiveSummary>();
  const months = new Map<string, ArchiveSummary>();
  for (const row of rows) {
    const date = new Date(row.occurred_at);
    const week = isoWeek(date);
    const existingWeek = weeks.get(week.key);
    weeks.set(week.key, { kind: "week", key: week.key, from: week.from.toISOString(), to: week.to.toISOString(), eventCount: (existingWeek?.eventCount ?? 0) + 1 });
    const key = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const existingMonth = months.get(key);
    months.set(key, { kind: "month", key, from: from.toISOString(), to: to.toISOString(), eventCount: (existingMonth?.eventCount ?? 0) + 1 });
  }
  return { weeks: [...weeks.values()], months: [...months.values()] };
}

export function closeCatalogStore(): void {
  if (database?.isOpen) database.close();
  database = undefined;
  searchIndexReady = undefined;
}
