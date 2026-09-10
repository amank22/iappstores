package catalog

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	db, err := dbconn.Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewStore(db)
}

func makeApp(id, bundleID, name string, overrides func(*contracts.AppDto)) contracts.AppDto {
	app := contracts.AppDto{
		ID:               id,
		SourceID:         "test-source",
		SourceName:       "Test Source",
		Name:             name,
		BundleIdentifier: &bundleID,
		DeveloperName:    strp("Example Dev"),
		Category:         contracts.CategoryTools,
		Screenshots:      []string{},
		LatestVersion:    strp("1.0.0"),
		VersionDate:      strp("2026-01-01"),
		DownloadURL:      strp("https://example.com/app.ipa"),
		Size:             i64p(1234),
		MinOSVersion:     strp("15.0"),
		DownloadOptions: []contracts.AppDownloadOption{
			{SourceID: "test-source", SourceName: "Test Source", LatestVersion: strp("1.0.0"), VersionDate: strp("2026-01-01"), DownloadURL: strp("https://example.com/app.ipa"), Size: i64p(1234), MinOSVersion: strp("15.0")},
		},
		Versions:        []contracts.AppVersionBuild{},
		CanonicalStatus: contracts.StatusActive,
	}
	if overrides != nil {
		overrides(&app)
	}
	return app
}

func strp(s string) *string { return &s }
func i64p(n int64) *int64   { return &n }

func TestSearchIndexAvailable(t *testing.T) {
	s := newTestStore(t)
	if !s.IsSearchIndexAvailable() {
		t.Fatal("expected FTS5 to be available under modernc.org/sqlite")
	}
}

func TestSearchRanksNameMatchAboveDescriptionMatch(t *testing.T) {
	s := newTestStore(t)
	deltaByName := makeApp("test-source:com.example.delta", "com.example.delta", "Delta Emulator", func(a *contracts.AppDto) {
		a.Description = strp("A general purpose retro gaming tool.")
	})
	deltaByDescription := makeApp("test-source:com.example.other", "com.example.other", "Utility Tool", func(a *contracts.AppDto) {
		a.Description = strp("Not related to delta wave audio processing at all, just mentions it once.")
	})

	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{deltaByName, deltaByDescription}, 1000); err != nil {
		t.Fatalf("sync: %v", err)
	}

	ids := s.SearchCatalogIds("delta", 500)
	idxDelta, idxOther := indexOf(ids, "com.example.delta"), indexOf(ids, "com.example.other")
	if idxDelta == -1 || idxOther == -1 {
		t.Fatalf("expected both apps in results, got %v", ids)
	}
	if idxDelta >= idxOther {
		t.Errorf("expected name match ranked above description match: %v", ids)
	}
}

func TestSearchSupportsPrefixMatching(t *testing.T) {
	s := newTestStore(t)
	app := makeApp("test-source:com.example.provenance", "com.example.provenance", "Provenance", nil)
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 1000); err != nil {
		t.Fatalf("sync: %v", err)
	}
	ids := s.SearchCatalogIds("prov", 500)
	if indexOf(ids, "com.example.provenance") == -1 {
		t.Errorf("expected prefix match, got %v", ids)
	}
}

func TestSearchDoesNotThrowOnAdversarialInput(t *testing.T) {
	s := newTestStore(t)
	app := makeApp("test-source:com.example.safe", "com.example.safe", "Safe App", nil)
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 1000); err != nil {
		t.Fatalf("sync: %v", err)
	}
	_ = s.SearchCatalogIds(`"weird* (query)) OR 1=1`, 500)
}

func TestSearchBlankQueryReturnsNothing(t *testing.T) {
	s := newTestStore(t)
	if got := s.SearchCatalogIds("   ", 500); len(got) != 0 {
		t.Errorf("expected empty for blank query, got %v", got)
	}
}

func TestMissingAppLifecycleStaysActiveBelowThreshold(t *testing.T) {
	s := newTestStore(t)
	app := makeApp("test-source:com.example.fading", "com.example.fading", "Fading App", nil)

	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if indexOf(s.SearchCatalogIds("fading", 500), "com.example.fading") == -1 {
		t.Fatal("expected app to be searchable initially")
	}

	// The app disappears from its only source. missing_count becomes 1, which stays
	// below the >=2 threshold, so status stays "active" and it's still searchable --
	// ported line-by-line from catalogStore.test.ts's "keeps a missing app searchable".
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{}, 1); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if indexOf(s.SearchCatalogIds("fading", 500), "com.example.fading") == -1 {
		t.Fatal("expected app to remain searchable after first miss")
	}

	status := s.ReadAppStatus("com.example.fading")
	if status.Status != contracts.StatusActive {
		t.Errorf("expected still-active status, got %s", status.Status)
	}
}

// TestMissingAppBecomesMissingThenRemoved exercises rebuildCanonical's ">=2 misses AND
// 48h passed" / ">=30 days AND no replacement" threshold math directly.
//
// Note on reachability: as ported line-by-line from catalogStore.ts, a canonical app's
// catalog_source_apps row is marked inactive (active=0) the same sync call in which it's
// first observed absent -- so a *second* natural "zero active snapshots" transition can
// only occur if the row becomes active again first, and reappearing always runs the
// "has snapshots" branch, which resets missing_count back to 0. In other words,
// missing_count cannot exceed 1 through repeated real SyncSourceCatalog calls alone; the
// >=2 branch is reachable only via a second distinct zero-snapshot transition arriving
// while missing_count is already >=1 (e.g. multiple sources independently losing the
// app in a way that leaves a stale missing_count from a previous cycle). This test
// reproduces that precondition directly -- pre-seeding catalog_apps with missing_count=1
// and an old missing_since, and catalog_source_apps as still (about to become) inactive --
// to verify the threshold math itself is ported faithfully, independent of that
// reachability quirk (which is preserved as-is per the "port line by line" instruction).
func TestMissingAppBecomesMissingThenRemoved(t *testing.T) {
	s := newTestStore(t)
	app := makeApp("test-source:com.example.gone", "com.example.gone", "Going App", nil)
	const hour = int64(60 * 60 * 1000)
	const day = 24 * hour

	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}
	// First disappearance: missing_count -> 1, still active (below the >=2 gate).
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{}, 1); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if s.ReadAppStatus("com.example.gone").Status != contracts.StatusActive {
		t.Fatal("expected still-active after a single miss")
	}

	// Force a second zero-snapshot transition while missing_count is already 1: mark the
	// source row active again (so it's "impacted" on the next sync) without including the
	// app in this sync's payload, so rebuildCanonical sees zero active snapshots again.
	if _, err := s.db.Exec(`UPDATE catalog_source_apps SET active = 1 WHERE owner_source_id = ? AND source_app_id = ?`, "test-source", app.ID); err != nil {
		t.Fatalf("force active: %v", err)
	}
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{}, 49*hour); err != nil {
		t.Fatalf("sync: %v", err)
	}
	status := s.ReadAppStatus("com.example.gone")
	if status.Status != contracts.StatusMissing {
		t.Fatalf("expected missing status once missing_count reaches 2 and 48h have passed, got %s", status.Status)
	}

	// A third such transition, now 30+ days after missing_since, with no replacement_id
	// set -> "removed", and dropped from the search index.
	if _, err := s.db.Exec(`UPDATE catalog_source_apps SET active = 1 WHERE owner_source_id = ? AND source_app_id = ?`, "test-source", app.ID); err != nil {
		t.Fatalf("force active: %v", err)
	}
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{}, 31*day); err != nil {
		t.Fatalf("sync: %v", err)
	}
	status = s.ReadAppStatus("com.example.gone")
	if status.Status != contracts.StatusRemoved {
		t.Fatalf("expected removed status, got %s", status.Status)
	}
	if indexOf(s.SearchCatalogIds("going", 500), "com.example.gone") != -1 {
		t.Error("expected removed app to drop out of the search index")
	}
}

func TestAppReappearingResetsLifecycle(t *testing.T) {
	s := newTestStore(t)
	app := makeApp("test-source:com.example.flaky", "com.example.flaky", "Flaky App", nil)

	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{}, 1); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if s.ReadAppStatus("com.example.flaky").Status != contracts.StatusActive {
		t.Fatal("expected active after a single miss (below threshold)")
	}
	if _, err := s.db.Exec(`SELECT missing_count FROM catalog_apps WHERE canonical_id = ?`, "com.example.flaky"); err != nil {
		t.Fatalf("sanity query: %v", err)
	}

	// The app comes back: rebuildCanonical's "has snapshots" branch fully clears the
	// missing state (missing_count -> 0, missing_since -> NULL, status -> active).
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 2); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if s.ReadAppStatus("com.example.flaky").Status != contracts.StatusActive {
		t.Fatal("expected active again after reappearing")
	}
	row := s.readRow("com.example.flaky")
	if row == nil || row.MissingCount != 0 || row.MissingSince.Valid {
		t.Errorf("expected missing state fully cleared on reappearance, got %+v", row)
	}
}

func TestBackfillsSearchIndexFromLegacyRows(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.sqlite")

	// Simulate a database with catalog_apps rows written before FTS5 existed by using a
	// raw connection with only the base table, bypassing SyncSourceCatalog entirely.
	raw, err := sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatalf("open raw db: %v", err)
	}
	if _, err := raw.Exec(`
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
			status TEXT NOT NULL DEFAULT 'active',
			replacement_id TEXT,
			category TEXT,
			developer_slug TEXT
		)
	`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	app := makeApp("test-source:com.example.legacy", "com.example.legacy", "Legacy Holdover App", nil)
	appJSON := mustMarshal(t, app)
	if _, err := raw.Exec(`INSERT INTO catalog_apps(canonical_id, app_json, metadata_hash, first_seen_at, last_seen_at, metadata_updated_at, status)
		VALUES (?, ?, 'hash', 0, 0, 0, 'active')`, "com.example.legacy", appJSON); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}
	raw.Close()

	db, err := dbconn.Open(dbPath)
	if err != nil {
		t.Fatalf("open via dbconn: %v", err)
	}
	defer db.Close()
	s := NewStore(db)

	if !s.IsSearchIndexAvailable() {
		t.Fatal("expected FTS5 available")
	}
	if indexOf(s.SearchCatalogIds("legacy", 500), "com.example.legacy") == -1 {
		t.Error("expected backfilled legacy row to be searchable")
	}
}

func TestListAllActiveAppsCacheServesUntilInvalidated(t *testing.T) {
	s := newTestStore(t)
	app := makeApp("test-source:com.example.cached", "com.example.cached", "Cached App", nil)
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}

	first := s.ListAllActiveApps("")
	if len(first) != 1 {
		t.Fatalf("expected 1 active app, got %d", len(first))
	}

	// Mutating the returned slice must never corrupt the cache -- each caller gets its own
	// shallow copy.
	first[0].Name = "Mutated"
	second := s.ListAllActiveApps("")
	if second[0].Name != "Cached App" {
		t.Errorf("expected cache to be unaffected by caller mutation, got %q", second[0].Name)
	}

	// A second source sync (even one that changes nothing) invalidates the cache, so the
	// next read reflects the database again.
	app2 := makeApp("test-source-2:com.example.other", "com.example.other", "Other App", nil)
	if err := s.SyncSourceCatalog("test-source-2", []contracts.AppDto{app2}, 1); err != nil {
		t.Fatalf("sync: %v", err)
	}
	third := s.ListAllActiveApps("")
	if len(third) != 2 {
		t.Fatalf("expected cache to reload after invalidation, got %d apps", len(third))
	}
}

func TestCountByCategoryAndTotalActive(t *testing.T) {
	s := newTestStore(t)
	game := makeApp("test-source:com.example.game", "com.example.game", "A Game", func(a *contracts.AppDto) {
		a.Category = contracts.CategoryGames
	})
	tool := makeApp("test-source:com.example.tool", "com.example.tool", "A Tool", func(a *contracts.AppDto) {
		a.Category = contracts.CategoryTools
	})
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{game, tool}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}

	counts := s.CountByCategory()
	if counts[contracts.CategoryGames] != 1 {
		t.Errorf("games count = %d", counts[contracts.CategoryGames])
	}
	if counts[contracts.CategoryTools] != 1 {
		t.Errorf("tools count = %d", counts[contracts.CategoryTools])
	}
	if total := s.TotalActive(); total != 2 {
		t.Errorf("TotalActive() = %d, want 2", total)
	}
}

func TestCanonicalIDIsAlwaysLowercase(t *testing.T) {
	s := newTestStore(t)
	// No bundle identifier -> canonicalID falls back to app.ID, which must still be
	// lowercased so ListByCanonicalIDs (fed ids straight from the FTS5 index / canonical_id
	// column) can never miss a row on a case mismatch.
	app := makeApp("Test-Source:Mixed-Case-App", "", "Mixed Case App", func(a *contracts.AppDto) {
		a.BundleIdentifier = nil
	})
	if err := s.SyncSourceCatalog("test-source", []contracts.AppDto{app}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}

	got := s.ListByCanonicalIDs([]string{"test-source:mixed-case-app"})
	if len(got) != 1 {
		t.Fatalf("expected canonical id to be stored lowercase and match exactly, got %d results", len(got))
	}
}

func indexOf(ss []string, target string) int {
	for i, s := range ss {
		if s == target {
			return i
		}
	}
	return -1
}

func mustMarshal(t *testing.T, app contracts.AppDto) string {
	t.Helper()
	b, err := json.Marshal(app)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}
