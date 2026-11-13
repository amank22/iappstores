package catalog

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
	"sort"
	"sync"
	"testing"
	"time"

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

func TestActiveAppsCacheConcurrentSyncsAndReads(t *testing.T) {
	s := newTestStore(t)
	if err := s.SyncSourceCatalog("seed", []contracts.AppDto{makeApp("seed:com.example.seed", "com.example.seed", "Seed", nil)}, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if got := len(s.ListAllActiveApps("")); got != 1 {
		t.Fatalf("expected 1 active app, got %d", got)
	}

	const sources = 6
	var wg sync.WaitGroup
	stop := make(chan struct{})
	for r := 0; r < 4; r++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					if len(s.ListAllActiveApps("")) == 0 {
						t.Error("readers must never see an empty cache once it is loaded")
						return
					}
				}
			}
		}()
	}

	var syncs sync.WaitGroup
	for i := 0; i < sources; i++ {
		syncs.Add(1)
		go func(i int) {
			defer syncs.Done()
			id := fmt.Sprintf("com.example.app%d", i)
			src := fmt.Sprintf("src-%d", i)
			if err := s.SyncSourceCatalog(src, []contracts.AppDto{makeApp(src+":"+id, id, "App", nil)}, int64(i+1)); err != nil {
				t.Errorf("sync %d: %v", i, err)
			}
		}(i)
	}
	syncs.Wait()
	close(stop)
	wg.Wait()

	// Every sync has returned, so the cache must reflect all of them.
	if got := len(s.ListAllActiveApps("")); got != sources+1 {
		t.Fatalf("expected %d active apps after all syncs, got %d", sources+1, got)
	}
}

// insertTestApps syncs count apps and gives their "new" events distinct times, an hour apart.
func insertTestApps(t *testing.T, s *Store, count int) {
	t.Helper()
	apps := make([]contracts.AppDto, count)
	for i := range apps {
		apps[i] = makeApp(fmt.Sprintf("app-%02d", i), fmt.Sprintf("com.example.app%02d", i), fmt.Sprintf("App %02d", i), nil)
	}
	if err := s.SyncSourceCatalog("test-source", apps, 1000); err != nil {
		t.Fatalf("sync: %v", err)
	}
	// SyncSourceCatalog stamps every new app's event with the same time; spread them out so
	// the newest-first order is well defined.
	rows, err := s.db.Query(`SELECT id FROM catalog_events ORDER BY canonical_id`)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	for i, id := range ids {
		if _, err := s.db.Exec(`UPDATE catalog_events SET occurred_at = ? WHERE id = ?`, int64(i+1)*3_600_000, id); err != nil {
			t.Fatal(err)
		}
	}
}

func TestReadUpdateEventsPagePagesNewestFirstAndReportsTotal(t *testing.T) {
	s := newTestStore(t)
	insertTestApps(t, s, 25)

	first, total := s.ReadUpdateEventsPage(nil, nil, "all", 1, 10, 20_000)
	if total != 25 || len(first) != 10 {
		t.Fatalf("page 1: total = %d, len = %d, want 25 / 10", total, len(first))
	}
	if first[0].App.Name != "App 24" || first[9].App.Name != "App 15" {
		t.Fatalf("page 1 runs %q to %q, want App 24 to App 15", first[0].App.Name, first[9].App.Name)
	}
	last, _ := s.ReadUpdateEventsPage(nil, nil, "all", 3, 10, 20_000)
	if len(last) != 5 || last[4].App.Name != "App 00" {
		t.Fatalf("last page: len = %d", len(last))
	}
	if beyond, total := s.ReadUpdateEventsPage(nil, nil, "all", 4, 10, 20_000); len(beyond) != 0 || total != 25 {
		t.Fatalf("page past the end: len = %d, total = %d", len(beyond), total)
	}
}

func TestReadUpdateEventsPageHonoursCapFiltersAndInactiveApps(t *testing.T) {
	s := newTestStore(t)
	insertTestApps(t, s, 25)

	// The cap bounds the total and the pages, as the old fixed LIMIT did.
	capped, total := s.ReadUpdateEventsPage(nil, nil, "all", 2, 10, 15)
	if total != 15 || len(capped) != 5 {
		t.Fatalf("capped page 2: total = %d, len = %d, want 15 / 5", total, len(capped))
	}

	from, to := int64(10*3_600_000), int64(13*3_600_000)
	window, total := s.ReadUpdateEventsPage(&from, &to, "all", 1, 10, 20_000)
	if total != 3 || len(window) != 3 {
		t.Fatalf("time window: total = %d, len = %d, want 3 / 3", total, len(window))
	}
	if none, total := s.ReadUpdateEventsPage(nil, nil, "version", 1, 10, 20_000); total != 0 || len(none) != 0 {
		t.Fatalf("version events: total = %d, want 0", total)
	}

	res, err := s.db.Exec(`UPDATE catalog_apps SET status = 'removed'
		WHERE canonical_id = (SELECT canonical_id FROM catalog_events ORDER BY occurred_at DESC LIMIT 1)`)
	if err != nil {
		t.Fatal(err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		t.Fatalf("test setup removed %d apps, want 1", n)
	}
	s.catalogSeq.Add(1) // as a committed sync would; totals are cached until then
	if _, total := s.ReadUpdateEventsPage(nil, nil, "all", 1, 10, 20_000); total != 24 {
		t.Fatalf("removed app's event still counted: total = %d, want 24", total)
	}
}

func TestUpdateTotalsAreCachedUntilTheCatalogChanges(t *testing.T) {
	s := newTestStore(t)
	insertTestApps(t, s, 12)

	if _, total := s.ReadUpdateEventsPage(nil, nil, "all", 1, 5, 20_000); total != 12 {
		t.Fatalf("total = %d, want 12", total)
	}
	// A row changed behind the store's back is not noticed: the count is reused.
	if _, err := s.db.Exec(`DELETE FROM catalog_events WHERE occurred_at <= ?`, int64(3*3_600_000)); err != nil {
		t.Fatal(err)
	}
	if _, total := s.ReadUpdateEventsPage(nil, nil, "all", 1, 5, 20_000); total != 12 {
		t.Fatalf("count was recomputed without a sync: total = %d", total)
	}
	// A different query is counted on its own.
	if _, total := s.ReadUpdateEventsPage(nil, nil, "all", 1, 5, 6); total != 6 {
		t.Fatalf("capped total = %d, want 6", total)
	}
	// A committed sync moves catalogSeq on, which drops every cached count.
	s.catalogSeq.Add(1)
	if _, total := s.ReadUpdateEventsPage(nil, nil, "all", 1, 5, 20_000); total != 9 {
		t.Fatalf("total after sync = %d, want 9", total)
	}
}

// referenceArchives is the straightforward version of ReadArchives: one step per event.
func referenceArchives(times []int64) contracts.ArchivesResponse {
	weekOrder, monthOrder := []string{}, []string{}
	weeks, months := map[string]*contracts.ArchiveSummary{}, map[string]*contracts.ArchiveSummary{}
	for _, ms := range times {
		t := time.UnixMilli(ms).UTC()
		weekKey, from, to := isoWeekInfo(t)
		if w, ok := weeks[weekKey]; ok {
			w.EventCount++
		} else {
			weeks[weekKey] = &contracts.ArchiveSummary{Kind: "week", Key: weekKey, From: from.Format("2006-01-02T15:04:05.000Z"), To: to.Format("2006-01-02T15:04:05.000Z"), EventCount: 1}
			weekOrder = append(weekOrder, weekKey)
		}
		monthKey := fmt.Sprintf("%d/%s", t.Year(), pad2(int(t.Month())))
		if m, ok := months[monthKey]; ok {
			m.EventCount++
		} else {
			mf := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
			months[monthKey] = &contracts.ArchiveSummary{Kind: "month", Key: monthKey, From: mf.Format("2006-01-02T15:04:05.000Z"), To: mf.AddDate(0, 1, 0).Format("2006-01-02T15:04:05.000Z"), EventCount: 1}
			monthOrder = append(monthOrder, monthKey)
		}
	}
	out := contracts.ArchivesResponse{Weeks: []contracts.ArchiveSummary{}, Months: []contracts.ArchiveSummary{}}
	for _, k := range weekOrder {
		out.Weeks = append(out.Weeks, *weeks[k])
	}
	for _, k := range monthOrder {
		out.Months = append(out.Months, *months[k])
	}
	return out
}

func TestReadArchivesMatchesCountingEveryEvent(t *testing.T) {
	s := newTestStore(t)
	// Several events on one day, runs of days, and times either side of midnight UTC,
	// a month end and an ISO year boundary (2020-12-31 is in week 53, 2021-01-03 in 53).
	day := int64(86_400_000)
	base := time.Date(2020, 12, 28, 0, 0, 0, 0, time.UTC).UnixMilli()
	var times []int64
	for i := int64(0); i < 40; i++ {
		times = append(times, base+i*day+3*3_600_000, base+i*day+23*3_600_000+59*60_000+59_999)
	}
	times = append(times, base+5*day+3*3_600_000, base+5*day+3*3_600_000, base-1, base)
	for i, ms := range times {
		if _, err := s.db.Exec(`INSERT INTO catalog_events(id,event_type,occurred_at,canonical_id,title) VALUES(?, 'new', ?, 'x', 'x')`, fmt.Sprintf("e%d", i), ms); err != nil {
			t.Fatal(err)
		}
	}

	sort.Slice(times, func(i, j int) bool { return times[i] > times[j] })
	got, want := s.ReadArchives(), referenceArchives(times)
	if !reflect.DeepEqual(got, want) {
		gj, _ := json.Marshal(got)
		wj, _ := json.Marshal(want)
		t.Fatalf("archives differ\n got: %s\nwant: %s", gj, wj)
	}
	if len(got.Weeks) < 5 || len(got.Months) < 2 {
		t.Fatalf("test data should span several weeks and months: %d weeks, %d months", len(got.Weeks), len(got.Months))
	}
}
