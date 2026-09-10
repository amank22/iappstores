// Package catalog ports catalogStore.ts onto the shared *sql.DB: per-source snapshot
// tracking, canonical-app rebuilding with missing/removed lifecycle rules, FTS5 search,
// version history, and update-event archives. This intentionally replaces
// catalogMaterializer.ts's full-in-memory-catalog pattern -- there is no in-process object
// graph of the whole catalog here, every read hydrates only the rows it needs from SQLite.
package catalog

import (
	"crypto/sha1"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
	"github.com/iappstores/api-go/internal/normalizer"
)

const hour = int64(time.Hour / time.Millisecond)
const day = 24 * hour

type Store struct {
	db *sql.DB

	mu               sync.Mutex
	searchIndexReady *bool
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// --- search index bootstrap ---

// IsSearchIndexAvailable mirrors isSearchIndexAvailable()/searchIndexAvailable(): lazily
// creates the FTS5 virtual table (memoizing success/failure) and, the first time it's
// created, backfills it from any pre-existing catalog_apps rows so search still works
// for a database written before the index existed.
func (s *Store) IsSearchIndexAvailable() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.searchIndexReady != nil {
		return *s.searchIndexReady
	}

	_, err := s.db.Exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS catalog_search USING fts5(
			canonical_id UNINDEXED,
			name,
			bundle_identifier,
			developer_name,
			subtitle,
			description,
			latest_version,
			tokenize = 'porter unicode61 remove_diacritics 2'
		)
	`)
	ok := err == nil
	s.searchIndexReady = &ok
	if !ok {
		log.Printf("FTS5 is not available in this SQLite build; falling back to linear search: %v", err)
		return false
	}

	// backfillSearchIndexIfEmpty (via upsertSearchIndex) re-checks IsSearchIndexAvailable,
	// which would deadlock against this method's own lock -- release it first since
	// searchIndexReady is now set and safe to read without holding s.mu.
	s.mu.Unlock()
	s.backfillSearchIndexIfEmpty()
	s.mu.Lock()
	return true
}

func (s *Store) backfillSearchIndexIfEmpty() {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM catalog_search`).Scan(&count); err != nil || count > 0 {
		return
	}

	rows, err := s.db.Query(`SELECT canonical_id, app_json FROM catalog_apps WHERE status != 'removed'`)
	if err != nil {
		return
	}
	defer rows.Close()

	type row struct{ id, appJSON string }
	var toBackfill []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.appJSON); err == nil {
			toBackfill = append(toBackfill, r)
		}
	}
	if len(toBackfill) == 0 {
		return
	}

	log.Printf("Backfilling search index for %d existing catalog app(s)...", len(toBackfill))
	for _, r := range toBackfill {
		var app contracts.AppDto
		if err := json.Unmarshal([]byte(r.appJSON), &app); err == nil {
			upsertSearchIndex(s.db, r.id, app)
		}
	}
}

// execer is satisfied by both *sql.DB and *sql.Tx. upsertSearchIndex/removeFromSearchIndex
// take one explicitly so callers running inside a transaction (rebuildCanonical) write the
// FTS5 index through that same transaction rather than a second pool connection --
// writing through a separate connection while the transaction still held SQLite's write
// lock caused every call to block for the full busy_timeout (reproduced as intermittent
// "database is locked" failures/hangs under `go test`).
type execer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
}

func upsertSearchIndex(exec execer, id string, app contracts.AppDto) {
	exec.Exec(`DELETE FROM catalog_search WHERE canonical_id = ?`, id)
	exec.Exec(`INSERT INTO catalog_search(canonical_id, name, bundle_identifier, developer_name, subtitle, description, latest_version)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, app.Name, deref(app.BundleIdentifier), deref(app.DeveloperName), deref(app.Subtitle), deref(app.Description), deref(app.LatestVersion))
}

func removeFromSearchIndex(exec execer, id string) {
	exec.Exec(`DELETE FROM catalog_search WHERE canonical_id = ?`, id)
}

var ftsSpecialChars = regexp.MustCompile(`["*^:().]`)
var ftsWhitespace = regexp.MustCompile(`\s+`)

// toMatchQuery mirrors toMatchQuery(): strips FTS5 syntax characters, lowercases, takes
// up to 8 terms, and ANDs together quoted-prefix matches so query text can never be
// interpreted as raw FTS5 query syntax (defends against injection via crafted search text).
func toMatchQuery(query string) string {
	stripped := ftsSpecialChars.ReplaceAllString(query, " ")
	stripped = strings.ToLower(stripped)
	terms := []string{}
	for _, t := range ftsWhitespace.Split(strings.TrimSpace(stripped), -1) {
		if t != "" {
			terms = append(terms, t)
		}
	}
	if len(terms) > 8 {
		terms = terms[:8]
	}
	if len(terms) == 0 {
		return ""
	}
	quoted := make([]string, len(terms))
	for i, t := range terms {
		quoted[i] = fmt.Sprintf(`"%s"*`, strings.ReplaceAll(t, `"`, `""`))
	}
	return strings.Join(quoted, " AND ")
}

// SearchCatalogIds mirrors searchCatalogIds(): FTS5 MATCH against a weighted bm25()
// ranking (column weights: name 3.0, bundle_identifier 2.0, developer_name 2.0,
// subtitle 1.5, description 1.0, latest_version 1.0 -- lower bm25 score is a better
// match, hence ORDER BY rank ascending), returning canonical ids in rank order.
func (s *Store) SearchCatalogIds(query string, limit int) []string {
	if !s.IsSearchIndexAvailable() {
		return []string{}
	}
	matchQuery := toMatchQuery(query)
	if matchQuery == "" {
		return []string{}
	}

	rows, err := s.db.Query(`
		SELECT canonical_id, bm25(catalog_search, 3.0, 2.0, 2.0, 1.5, 1.0, 1.0) AS rank
		FROM catalog_search
		WHERE catalog_search MATCH ?
		ORDER BY rank
		LIMIT ?`, matchQuery, limit)
	if err != nil {
		return []string{}
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var id string
		var rank float64
		if err := rows.Scan(&id, &rank); err == nil {
			out = append(out, id)
		}
	}
	return out
}

// --- canonicalization helpers ---

func canonicalID(app contracts.AppDto) string {
	if app.BundleIdentifier != nil && *app.BundleIdentifier != "" {
		return strings.ToLower(*app.BundleIdentifier)
	}
	return app.ID
}

func iso(ms *int64) *string {
	if ms == nil {
		return nil
	}
	t := time.UnixMilli(*ms).UTC().Format("2006-01-02T15:04:05.000Z")
	return &t
}

func isoV(ms int64) *string {
	return iso(&ms)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func validDate(value *string) *int64 {
	if value == nil {
		return nil
	}
	if ms, ok := lenientParseOK(*value); ok {
		v := ms
		return &v
	}
	return nil
}

// lenientParseOK exposes normalizer's lenient date parser for catalogStore's own
// Date.parse()-alike checks.
func lenientParseOK(value string) (int64, bool) {
	return normalizer.ParseLenientDateOK(value)
}

func versionKey(version string) string {
	return strings.ToLower(strings.TrimSpace(version))
}

func buildKey(downloadURL, changelog *string) string {
	h := sha1.Sum([]byte(deref(downloadURL) + "|" + deref(changelog)))
	return hex.EncodeToString(h[:])
}

// meaningfulApp strips fields that shouldn't affect the content hash (lifecycle
// timestamps/status, and the AppStore metadata's own fetchedAt), mirroring meaningfulApp().
func meaningfulApp(app contracts.AppDto) map[string]interface{} {
	b, _ := json.Marshal(app)
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	delete(m, "firstSeenAt")
	delete(m, "lastSeenAt")
	delete(m, "metadataUpdatedAt")
	delete(m, "lastUpdatedAt")
	delete(m, "canonicalStatus")
	delete(m, "canonicalId")
	if appStore, ok := m["appStore"].(map[string]interface{}); ok {
		delete(appStore, "fetchedAt")
	}
	return m
}

func hashApp(app contracts.AppDto) string {
	m := meaningfulApp(app)
	// json.Marshal of a map sorts keys, matching JSON.stringify's insertion order closely
	// enough for hash-stability purposes (this hash only needs to be stable within this
	// process/schema version, not byte-identical to the old TS hash).
	b, _ := json.Marshal(m)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

type catalogRow struct {
	CanonicalID       string
	AppJSON           string
	MetadataHash      string
	FirstSeenAt       int64
	LastSeenAt        int64
	MetadataUpdatedAt int64
	MissingSince      sql.NullInt64
	MissingCount      int
	RemovedAt         sql.NullInt64
	Status            string
	ReplacementID     sql.NullString
}

func (s *Store) readRow(id string) *catalogRow {
	row := s.db.QueryRow(`SELECT canonical_id, app_json, metadata_hash, first_seen_at, last_seen_at, metadata_updated_at,
		missing_since, missing_count, removed_at, status, replacement_id FROM catalog_apps WHERE canonical_id = ?`, id)
	var r catalogRow
	if err := row.Scan(&r.CanonicalID, &r.AppJSON, &r.MetadataHash, &r.FirstSeenAt, &r.LastSeenAt, &r.MetadataUpdatedAt,
		&r.MissingSince, &r.MissingCount, &r.RemovedAt, &r.Status, &r.ReplacementID); err != nil {
		return nil
	}
	return &r
}

func decorate(app contracts.AppDto, row *catalogRow) contracts.AppDto {
	release := validDate(app.VersionDate)
	updated := row.MetadataUpdatedAt
	if release != nil {
		updated = *release
	}
	app.FirstSeenAt = isoV(row.FirstSeenAt)
	app.LastSeenAt = isoV(row.LastSeenAt)
	app.MetadataUpdatedAt = isoV(row.MetadataUpdatedAt)
	app.LastUpdatedAt = isoV(updated)
	canonical := row.CanonicalID
	app.CanonicalID = &canonical
	app.CanonicalStatus = contracts.CanonicalAppStatus(row.Status)
	return app
}

// developerSlug and category columns support the architecture-fix indexed facet/filter
// queries (WHERE category = ?, GROUP BY category) instead of full in-memory rescans.
var devSlugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)
var devSlugTrim = regexp.MustCompile(`(^-|-$)`)

func developerSlug(app contracts.AppDto) string {
	name := app.DeveloperName
	if app.AppStore != nil && app.AppStore.DeveloperName != nil {
		name = app.AppStore.DeveloperName
	}
	if name == nil || *name == "" {
		return ""
	}
	v := strings.ToLower(*name)
	v = strings.ReplaceAll(v, "&", " and ")
	v = devSlugNonAlnum.ReplaceAllString(v, "-")
	v = devSlugTrim.ReplaceAllString(v, "")
	return v
}

// rebuildCanonical mirrors rebuildCanonical() line for line, including the exact
// missing/removed time-threshold + count-gating rules:
//   - a canonical app with zero active source snapshots left increments missing_count
//     and, once missing_count >= 2 AND 48h have passed since missing_since, becomes
//     "missing"; once 30 days have passed since missing_since AND there's no
//     replacement_id, it becomes "removed" (and is dropped from the search index).
//   - a canonical app with active snapshots is (re)computed by grouping them via
//     normalizer.GroupAppsByBundleId, content-hashed, and upserted back to "active",
//     clearing any missing/removed state.
func (s *Store) rebuildCanonical(id string, now int64, tx *sql.Tx) error {
	rows, err := tx.Query(`SELECT app_json FROM catalog_source_apps WHERE canonical_id = ? AND active = 1`, id)
	if err != nil {
		return err
	}
	var snapshotJSONs []string
	for rows.Next() {
		var j string
		if err := rows.Scan(&j); err == nil {
			snapshotJSONs = append(snapshotJSONs, j)
		}
	}
	rows.Close()

	previous := s.readRowTx(tx, id)

	if len(snapshotJSONs) == 0 {
		if previous == nil {
			return nil
		}
		missingSince := now
		if previous.MissingSince.Valid {
			missingSince = previous.MissingSince.Int64
		}
		missingCount := previous.MissingCount + 1
		status := previous.Status
		if missingCount >= 2 && now-missingSince >= 48*hour {
			if now-missingSince >= 30*day && !previous.ReplacementID.Valid {
				status = "removed"
			} else {
				status = "missing"
			}
		}
		_, err := tx.Exec(`UPDATE catalog_apps SET missing_since = ?, missing_count = ?, status = ?,
			removed_at = CASE WHEN ? = 'removed' THEN COALESCE(removed_at, ?) ELSE removed_at END
			WHERE canonical_id = ?`, missingSince, missingCount, status, status, now, id)
		if err != nil {
			return err
		}
		if status == "removed" && previous.Status != "removed" && s.IsSearchIndexAvailable() {
			removeFromSearchIndex(tx, id)
		}
		return nil
	}

	var apps []contracts.AppDto
	for _, j := range snapshotJSONs {
		var app contracts.AppDto
		if err := json.Unmarshal([]byte(j), &app); err == nil {
			apps = append(apps, app)
		}
	}
	grouped := normalizer.GroupAppsByBundleId(apps)
	if len(grouped) == 0 {
		return nil
	}
	app := grouped[0]

	hash := hashApp(app)
	firstSeen := now
	if previous != nil {
		firstSeen = previous.FirstSeenAt
	}
	metadataUpdated := now
	if previous != nil && previous.MetadataHash == hash {
		metadataUpdated = previous.MetadataUpdatedAt
	}

	decorated := app
	decorated.FirstSeenAt = isoV(firstSeen)
	decorated.LastSeenAt = isoV(now)
	decorated.MetadataUpdatedAt = isoV(metadataUpdated)
	if app.VersionDate != nil {
		decorated.LastUpdatedAt = app.VersionDate
	} else {
		decorated.LastUpdatedAt = isoV(metadataUpdated)
	}
	canon := id
	decorated.CanonicalID = &canon
	decorated.CanonicalStatus = contracts.StatusActive

	appJSON, _ := json.Marshal(decorated)
	category := string(app.Category)
	devSlug := developerSlug(app)

	_, err = tx.Exec(`
		INSERT INTO catalog_apps(canonical_id, app_json, metadata_hash, first_seen_at, last_seen_at, metadata_updated_at, status, category, developer_slug)
		VALUES(?,?,?,?,?,?,'active',?,?)
		ON CONFLICT(canonical_id) DO UPDATE SET app_json=excluded.app_json, metadata_hash=excluded.metadata_hash,
			last_seen_at=excluded.last_seen_at, metadata_updated_at=excluded.metadata_updated_at,
			missing_since=NULL, missing_count=0, removed_at=NULL, status='active',
			category=excluded.category, developer_slug=excluded.developer_slug
	`, id, string(appJSON), hash, firstSeen, now, metadataUpdated, category, nullableStr(devSlug))
	if err != nil {
		return err
	}

	_, err = tx.Exec(`INSERT OR IGNORE INTO catalog_events(id,event_type,occurred_at,canonical_id,title) VALUES(?, 'new', ?, ?, ?)`,
		"new:"+id, firstSeen, id, "New app: "+app.Name)
	if err != nil {
		return err
	}

	if s.IsSearchIndexAvailable() {
		upsertSearchIndex(tx, id, decorated)
	}
	return nil
}

func nullableStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (s *Store) readRowTx(tx *sql.Tx, id string) *catalogRow {
	row := tx.QueryRow(`SELECT canonical_id, app_json, metadata_hash, first_seen_at, last_seen_at, metadata_updated_at,
		missing_since, missing_count, removed_at, status, replacement_id FROM catalog_apps WHERE canonical_id = ?`, id)
	var r catalogRow
	if err := row.Scan(&r.CanonicalID, &r.AppJSON, &r.MetadataHash, &r.FirstSeenAt, &r.LastSeenAt, &r.MetadataUpdatedAt,
		&r.MissingSince, &r.MissingCount, &r.RemovedAt, &r.Status, &r.ReplacementID); err != nil {
		return nil
	}
	return &r
}

// SyncSourceCatalog mirrors syncSourceCatalog(): upserts every app currently reported by
// a source as an active snapshot, marks previously-active snapshots from that source that
// are no longer present as inactive, records version-build history + "new"/"version"
// timeline events, and rebuilds every canonical app touched by this sync (including ones
// that lost their last active snapshot, to run the missing/removed lifecycle). Retries the
// whole transaction with backoff on SQLITE_BUSY (see dbconn.RetryOnBusy), since concurrent
// source refreshes can briefly contend for SQLite's single writer lock.
func (s *Store) SyncSourceCatalog(ownerSourceID string, apps []contracts.AppDto, now int64) error {
	return dbconn.RetryOnBusy(func() error {
		return s.syncSourceCatalogOnce(ownerSourceID, apps, now)
	})
}

func (s *Store) syncSourceCatalogOnce(ownerSourceID string, apps []contracts.AppDto, now int64) error {
	// Ensure the FTS5 virtual table (and any legacy-row backfill) exists before opening
	// a transaction below -- CREATE VIRTUAL TABLE takes SQLite's write lock, and doing it
	// lazily from inside upsertSearchIndex (itself called mid-transaction by
	// rebuildCanonical) would otherwise contend with the very transaction that triggered it.
	s.IsSearchIndexAvailable()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	prevRows, err := tx.Query(`SELECT DISTINCT canonical_id FROM catalog_source_apps WHERE owner_source_id = ? AND active = 1`, ownerSourceID)
	if err != nil {
		return err
	}
	impacted := map[string]bool{}
	for prevRows.Next() {
		var id string
		if err := prevRows.Scan(&id); err == nil {
			impacted[id] = true
		}
	}
	prevRows.Close()

	present := map[string]bool{}
	for _, app := range apps {
		present[app.ID] = true
	}

	for _, app := range apps {
		id := canonicalID(app)
		impacted[id] = true

		appJSON, _ := json.Marshal(app)
		if _, err := tx.Exec(`
			INSERT INTO catalog_source_apps(owner_source_id,source_app_id,canonical_id,app_json,active,first_seen_at,last_seen_at)
			VALUES(?,?,?,?,1,?,?)
			ON CONFLICT(owner_source_id,source_app_id) DO UPDATE SET canonical_id=excluded.canonical_id, app_json=excluded.app_json, active=1, last_seen_at=excluded.last_seen_at
		`, ownerSourceID, app.ID, id, string(appJSON), now, now); err != nil {
			return err
		}

		if _, err := tx.Exec(`INSERT INTO catalog_aliases(alias,canonical_id) VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET canonical_id=excluded.canonical_id`, app.ID, id); err != nil {
			return err
		}
		if app.BundleIdentifier != nil && *app.BundleIdentifier != "" {
			if _, err := tx.Exec(`INSERT INTO catalog_aliases(alias,canonical_id) VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET canonical_id=excluded.canonical_id`, *app.BundleIdentifier, id); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO catalog_aliases(alias,canonical_id) VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET canonical_id=excluded.canonical_id`, "bundle:"+id, id); err != nil {
				return err
			}
		}

		for _, build := range app.Versions {
			releaseAt := validDate(build.ReleaseDate)
			occurredAt := now
			if releaseAt != nil {
				occurredAt = *releaseAt
			}
			withSeen := build
			withSeen.FirstSeenAt = isoV(now)
			withSeen.LastSeenAt = isoV(now)
			buildJSON, _ := json.Marshal(withSeen)

			if _, err := tx.Exec(`
				INSERT INTO catalog_versions(canonical_id,version_key,version,source_id,build_key,release_date,build_json,first_seen_at,last_seen_at)
				VALUES(?,?,?,?,?,?,?,?,?)
				ON CONFLICT(canonical_id,version_key,source_id,build_key) DO UPDATE SET build_json=excluded.build_json,last_seen_at=excluded.last_seen_at
			`, id, versionKey(build.Version), build.Version, build.SourceID, buildKey(build.DownloadURL, build.Changelog),
				optionalStr(build.ReleaseDate), string(buildJSON), now, now); err != nil {
				return err
			}

			if _, err := tx.Exec(`INSERT OR IGNORE INTO catalog_events(id,event_type,occurred_at,canonical_id,version,title,summary) VALUES(?, 'version', ?, ?, ?, ?, ?)`,
				fmt.Sprintf("version:%s:%s", id, versionKey(build.Version)), occurredAt, id, build.Version,
				fmt.Sprintf("%s %s", app.Name, build.Version), optionalStr(build.Changelog)); err != nil {
				return err
			}
		}
	}

	oldRows, err := tx.Query(`SELECT source_app_id FROM catalog_source_apps WHERE owner_source_id = ? AND active = 1`, ownerSourceID)
	if err != nil {
		return err
	}
	var toDeactivate []string
	for oldRows.Next() {
		var sourceAppID string
		if err := oldRows.Scan(&sourceAppID); err == nil && !present[sourceAppID] {
			toDeactivate = append(toDeactivate, sourceAppID)
		}
	}
	oldRows.Close()
	for _, sourceAppID := range toDeactivate {
		if _, err := tx.Exec(`UPDATE catalog_source_apps SET active=0 WHERE owner_source_id=? AND source_app_id=?`, ownerSourceID, sourceAppID); err != nil {
			return err
		}
	}

	ids := make([]string, 0, len(impacted))
	for id := range impacted {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if err := s.rebuildCanonical(id, now, tx); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func optionalStr(s *string) interface{} {
	if s == nil {
		return nil
	}
	return *s
}

// ReadAppStatus mirrors readAppStatus(): resolves aliases (case-insensitively) and the
// "bundle:" prefix convention, and reports "redirect" whenever the requested id differs
// from the resolved canonical id.
func (s *Store) ReadAppStatus(requestedID string) contracts.AppStatusResponse {
	var aliasCanonical sql.NullString
	s.db.QueryRow(`SELECT canonical_id FROM catalog_aliases WHERE alias = ? COLLATE NOCASE`, requestedID).Scan(&aliasCanonical)

	normalized := strings.ToLower(requestedID)
	normalized = strings.TrimPrefix(normalized, "bundle:")

	id := normalized
	if aliasCanonical.Valid {
		id = aliasCanonical.String
	}

	row := s.readRow(id)
	if row == nil {
		return contracts.AppStatusResponse{Status: contracts.StatusMissing, RequestedID: requestedID}
	}

	var app *contracts.AppDto
	var parsed contracts.AppDto
	if json.Unmarshal([]byte(row.AppJSON), &parsed) == nil {
		decorated := decorate(parsed, row)
		app = &decorated
	}

	isRedirect := requestedID != id && strings.ToLower(requestedID) != id
	status := contracts.CanonicalAppStatus(row.Status)
	if row.ReplacementID.Valid || isRedirect {
		status = contracts.StatusRedirect
	}

	resp := contracts.AppStatusResponse{
		Status:       status,
		RequestedID:  requestedID,
		CanonicalID:  &id,
		App:          app,
		MissingSince: iso(nullInt64Ptr(row.MissingSince)),
		RemovedAt:    iso(nullInt64Ptr(row.RemovedAt)),
	}
	if row.ReplacementID.Valid {
		resp.ReplacementID = &row.ReplacementID.String
	}
	return resp
}

func nullInt64Ptr(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

// ReadCatalogApp is a small convenience used by handlers that only need the app, not the
// full status envelope.
func (s *Store) ReadCatalogApp(id string) *contracts.AppDto {
	return s.ReadAppStatus(id).App
}

// ReadAppVersions mirrors readAppVersions(): groups build rows by version number,
// preferring the first non-empty changelog across builds sharing that version.
func (s *Store) ReadAppVersions(requestedID string) []contracts.AppVersion {
	status := s.ReadAppStatus(requestedID)
	if status.CanonicalID == nil {
		return []contracts.AppVersion{}
	}

	rows, err := s.db.Query(`SELECT version, release_date, build_json, first_seen_at, last_seen_at FROM catalog_versions
		WHERE canonical_id = ? ORDER BY COALESCE(release_date,'') DESC, first_seen_at DESC`, *status.CanonicalID)
	if err != nil {
		return []contracts.AppVersion{}
	}
	defer rows.Close()

	order := []string{}
	groups := map[string]*contracts.AppVersion{}
	for rows.Next() {
		var version string
		var releaseDate sql.NullString
		var buildJSON string
		var firstSeenAt, lastSeenAt int64
		if err := rows.Scan(&version, &releaseDate, &buildJSON, &firstSeenAt, &lastSeenAt); err != nil {
			continue
		}
		var build contracts.AppVersionBuild
		json.Unmarshal([]byte(buildJSON), &build)
		if build.FirstSeenAt == nil {
			build.FirstSeenAt = isoV(firstSeenAt)
		}
		build.LastSeenAt = isoV(lastSeenAt)

		key := versionKey(version)
		g, ok := groups[key]
		if !ok {
			var rd *string
			if releaseDate.Valid {
				rd = &releaseDate.String
			}
			g = &contracts.AppVersion{
				Version:           version,
				ReleaseDate:       rd,
				Changelog:         build.Changelog,
				FirstSeenAt:       isoV(firstSeenAt),
				MetadataUpdatedAt: isoV(lastSeenAt),
				Builds:            []contracts.AppVersionBuild{},
			}
			groups[key] = g
			order = append(order, key)
		}
		g.Builds = append(g.Builds, build)
		if (g.Changelog == nil || *g.Changelog == "") && build.Changelog != nil && *build.Changelog != "" {
			g.Changelog = build.Changelog
		}
	}

	out := make([]contracts.AppVersion, 0, len(order))
	for _, key := range order {
		out = append(out, *groups[key])
	}
	return out
}

// ReadUpdateEvents mirrors readUpdateEvents(): only events for still-"active" canonical
// apps are returned (missing/removed apps drop out of the timeline).
func (s *Store) ReadUpdateEvents(from, to *int64, eventType string, limit int) []contracts.UpdateEvent {
	clauses := []string{"a.status = 'active'"}
	args := []interface{}{}
	if from != nil {
		clauses = append(clauses, "e.occurred_at >= ?")
		args = append(args, *from)
	}
	if to != nil {
		clauses = append(clauses, "e.occurred_at < ?")
		args = append(args, *to)
	}
	if eventType != "" && eventType != "all" {
		clauses = append(clauses, "e.event_type = ?")
		args = append(args, eventType)
	}
	args = append(args, limit)

	query := fmt.Sprintf(`SELECT e.id, e.event_type, e.occurred_at, e.canonical_id, e.version, e.title, e.summary, a.app_json
		FROM catalog_events e JOIN catalog_apps a ON a.canonical_id = e.canonical_id
		WHERE %s ORDER BY e.occurred_at DESC LIMIT ?`, strings.Join(clauses, " AND "))

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return []contracts.UpdateEvent{}
	}
	defer rows.Close()

	out := []contracts.UpdateEvent{}
	for rows.Next() {
		var id, eventTypeVal, canonicalID, title, appJSON string
		var occurredAt int64
		var version, summary sql.NullString
		if err := rows.Scan(&id, &eventTypeVal, &occurredAt, &canonicalID, &version, &title, &summary, &appJSON); err != nil {
			continue
		}
		var app contracts.AppDto
		if json.Unmarshal([]byte(appJSON), &app) != nil {
			continue
		}
		ev := contracts.UpdateEvent{
			ID:         id,
			Type:       eventTypeVal,
			OccurredAt: *isoV(occurredAt),
			App:        app,
			Title:      title,
		}
		if version.Valid {
			ev.Version = &version.String
		}
		if summary.Valid {
			ev.Summary = &summary.String
		}
		out = append(out, ev)
	}
	return out
}

func isoWeekInfo(t time.Time) (key string, from, to time.Time) {
	t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	day := int(t.Weekday())
	if day == 0 {
		day = 7
	}
	t = t.AddDate(0, 0, 4-day)
	yearStart := time.Date(t.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	week := int((t.Sub(yearStart).Hours()/24+1)/7) + 1
	from = t.AddDate(0, 0, -3)
	from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	to = from.AddDate(0, 0, 7)
	key = fmt.Sprintf("%d-W%s", t.Year(), pad2(week))
	return
}

func pad2(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

// ReadArchives mirrors readArchives(): buckets every event's occurred_at into ISO week
// and calendar month summaries.
func (s *Store) ReadArchives() contracts.ArchivesResponse {
	rows, err := s.db.Query(`SELECT occurred_at FROM catalog_events ORDER BY occurred_at DESC`)
	if err != nil {
		return contracts.ArchivesResponse{Weeks: []contracts.ArchiveSummary{}, Months: []contracts.ArchiveSummary{}}
	}
	defer rows.Close()

	weekOrder := []string{}
	weeks := map[string]*contracts.ArchiveSummary{}
	monthOrder := []string{}
	months := map[string]*contracts.ArchiveSummary{}

	for rows.Next() {
		var occurredAt int64
		if rows.Scan(&occurredAt) != nil {
			continue
		}
		t := time.UnixMilli(occurredAt).UTC()

		weekKey, weekFrom, weekTo := isoWeekInfo(t)
		if w, ok := weeks[weekKey]; ok {
			w.EventCount++
		} else {
			weeks[weekKey] = &contracts.ArchiveSummary{Kind: "week", Key: weekKey, From: weekFrom.Format("2006-01-02T15:04:05.000Z"), To: weekTo.Format("2006-01-02T15:04:05.000Z"), EventCount: 1}
			weekOrder = append(weekOrder, weekKey)
		}

		monthKey := fmt.Sprintf("%d/%s", t.Year(), pad2(int(t.Month())))
		if m, ok := months[monthKey]; ok {
			m.EventCount++
		} else {
			monthFrom := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
			monthTo := monthFrom.AddDate(0, 1, 0)
			months[monthKey] = &contracts.ArchiveSummary{Kind: "month", Key: monthKey, From: monthFrom.Format("2006-01-02T15:04:05.000Z"), To: monthTo.Format("2006-01-02T15:04:05.000Z"), EventCount: 1}
			monthOrder = append(monthOrder, monthKey)
		}
	}

	weeksOut := make([]contracts.ArchiveSummary, 0, len(weekOrder))
	for _, k := range weekOrder {
		weeksOut = append(weeksOut, *weeks[k])
	}
	monthsOut := make([]contracts.ArchiveSummary, 0, len(monthOrder))
	for _, k := range monthOrder {
		monthsOut = append(monthsOut, *months[k])
	}
	return contracts.ArchivesResponse{Weeks: weeksOut, Months: monthsOut}
}

// --- paginated / faceted catalog reads (the architecture fix: SQL-driven, not a full
// in-memory rescan) ---

// CountByCategory mirrors getCategoryFacets() but via a single indexed GROUP BY query
// against catalog_apps.category instead of an O(15n log n) full-array-regroup.
// Non-"active" apps are excluded, matching browse routes' effective behavior (they only
// ever read from catalog_apps rows that are active; missing/removed apps are addressable
// individually via /status but never appear in a listing).
func (s *Store) CountByCategory() map[string]int {
	rows, err := s.db.Query(`SELECT category, COUNT(*) FROM catalog_apps WHERE status = 'active' GROUP BY category`)
	out := map[string]int{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var category sql.NullString
		var count int
		if rows.Scan(&category, &count) == nil && category.Valid {
			out[category.String] = count
		}
	}
	return out
}

// TotalActive returns the total number of active canonical apps (for the "all" facet).
func (s *Store) TotalActive() int {
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM catalog_apps WHERE status = 'active'`).Scan(&count)
	return count
}

// ListAppsPage reads one page of active catalog apps, optionally filtered by category,
// sorted and paginated in SQL. sort "recent" and category "recent" both map to
// ORDER BY metadata_updated_at DESC (an exact proxy for version-date recency once
// decorated, since metadata_updated_at tracks the app's own release date when known).
// Name sort still requires in-memory locale-aware comparison (SQLite has no built-in
// Unicode collation), so name-asc/name-desc pages are read unsorted from SQL up to a
// generous cap and then locale-sorted/paginated in Go.
func (s *Store) ListAllActiveApps(category string) []contracts.AppDto {
	query := `SELECT app_json FROM catalog_apps WHERE status = 'active'`
	args := []interface{}{}
	if category != "" && category != "all" && category != "recent" {
		query += ` AND category = ?`
		args = append(args, category)
	}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return []contracts.AppDto{}
	}
	defer rows.Close()

	out := []contracts.AppDto{}
	for rows.Next() {
		var appJSON string
		if rows.Scan(&appJSON) != nil {
			continue
		}
		var app contracts.AppDto
		if json.Unmarshal([]byte(appJSON), &app) == nil {
			out = append(out, app)
		}
	}
	return out
}

// ListByCanonicalIDs hydrates a specific set of canonical ids (used for search-index
// results and developer/co-download lookups) preserving the given order.
func (s *Store) ListByCanonicalIDs(ids []string) []contracts.AppDto {
	if len(ids) == 0 {
		return []contracts.AppDto{}
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := s.db.Query(fmt.Sprintf(`SELECT canonical_id, app_json FROM catalog_apps WHERE canonical_id IN (%s) AND status = 'active'`, placeholders), args...)
	if err != nil {
		return []contracts.AppDto{}
	}
	defer rows.Close()

	byID := map[string]contracts.AppDto{}
	for rows.Next() {
		var id, appJSON string
		if rows.Scan(&id, &appJSON) != nil {
			continue
		}
		var app contracts.AppDto
		if json.Unmarshal([]byte(appJSON), &app) == nil {
			byID[id] = app
		}
	}

	out := []contracts.AppDto{}
	for _, id := range ids {
		if app, ok := byID[strings.ToLower(id)]; ok {
			out = append(out, app)
		}
	}
	return out
}

// ListByDeveloperSlug returns all active apps for a developer slug (used by
// /api/developers/:slug/apps); returns (nil, false) if the slug has no apps at all,
// matching the JS Map.get() undefined-vs-empty-array distinction that decides 404 vs
// an empty listing.
func (s *Store) ListByDeveloperSlug(slug string) ([]contracts.AppDto, bool) {
	rows, err := s.db.Query(`SELECT app_json FROM catalog_apps WHERE developer_slug = ? AND status = 'active'`, slug)
	if err != nil {
		return nil, false
	}
	defer rows.Close()
	out := []contracts.AppDto{}
	for rows.Next() {
		var appJSON string
		if rows.Scan(&appJSON) != nil {
			continue
		}
		var app contracts.AppDto
		if json.Unmarshal([]byte(appJSON), &app) == nil {
			out = append(out, app)
		}
	}
	if len(out) == 0 {
		return nil, false
	}
	return out, true
}

// ListDevelopers mirrors buildDevelopers(): aggregates every active app by developer
// slug. Since this reads every active app's JSON, it's the one place that's still an
// O(n) scan -- but it happens once per /api/developers request against bounded catalog
// size, never held resident, and is far cheaper than the old code's job of also
// re-deriving the entire browse catalog at the same time.
func (s *Store) ListDevelopers() []contracts.DeveloperDto {
	apps := s.ListAllActiveApps("")
	type acc struct {
		name        string
		count       int
		categories  map[string]bool
		sourceNames map[string]bool
	}
	bySlug := map[string]*acc{}
	order := []string{}
	for _, app := range apps {
		name := app.DeveloperName
		if app.AppStore != nil && app.AppStore.DeveloperName != nil {
			name = app.AppStore.DeveloperName
		}
		if name == nil || *name == "" {
			continue
		}
		slug := developerSlug(app)
		if slug == "" {
			continue
		}
		a, ok := bySlug[slug]
		if !ok {
			a = &acc{name: *name, categories: map[string]bool{}, sourceNames: map[string]bool{}}
			bySlug[slug] = a
			order = append(order, slug)
		}
		a.count++
		a.categories[string(app.Category)] = true
		for _, opt := range app.DownloadOptions {
			a.sourceNames[opt.SourceName] = true
		}
	}

	out := make([]contracts.DeveloperDto, 0, len(order))
	for _, slug := range order {
		a := bySlug[slug]
		cats := setToSortedSlice(a.categories)
		names := setToSortedSlice(a.sourceNames)
		out = append(out, contracts.DeveloperDto{Slug: slug, Name: a.name, AppCount: a.count, Categories: cats, SourceNames: names})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].AppCount != out[j].AppCount {
			return out[i].AppCount > out[j].AppCount
		}
		return normalizer.DefaultCompare(out[i].Name, out[j].Name) < 0
	})
	return out
}

func setToSortedSlice(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
