package catalog

import (
	"fmt"
	"math/rand"
	"testing"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/normalizer"
)

func browseFixture(n int) []contracts.AppDto {
	rng := rand.New(rand.NewSource(42))
	names := []string{"Delta", "delta", "Délta", "Alpha", "Älpha", "Zebra", "日本語", "2048", "Émulator", "emulator", ""}
	dates := []string{"", "2024-01-02", "2024-01-02T10:00:00Z", "2023-05-01", "Jan 2, 2024", "garbage"}
	oses := []string{"", "14.0", "15", "16.4.1", "17"}
	categories := []contracts.AppCategory{contracts.CategoryGames, contracts.CategoryTools, contracts.CategoryEmulators, contracts.CategoryMedia}
	apps := make([]contracts.AppDto, n)
	for i := range apps {
		app := contracts.AppDto{
			ID:       fmt.Sprintf("bundle:com.example.%d", rng.Intn(1_000_000)*1000+i),
			Name:     names[rng.Intn(len(names))],
			Category: categories[rng.Intn(len(categories))],
		}
		if d := dates[rng.Intn(len(dates))]; d != "" {
			app.VersionDate = &d
		}
		if o := oses[rng.Intn(len(oses))]; o != "" {
			app.MinOSVersion = &o
		}
		apps[i] = app
	}
	return apps
}

// Browse must return exactly what the per-request pipeline it replaces returned.
func TestActiveAppsBrowseMatchesPipeline(t *testing.T) {
	apps := browseFixture(700)
	snapshot := newActiveApps(apps)

	categories := []contracts.AppCategory{contracts.CategoryAll, contracts.CategoryRecent, contracts.CategoryGames, contracts.CategoryMedia, contracts.CategoryMusic}
	sorts := []contracts.AppSort{contracts.SortRecent, contracts.SortNameAsc, contracts.SortNameDesc, contracts.AppSort("unknown")}
	versions := []*string{nil, ptr("15"), ptr("16.4"), ptr("junk")}
	operators := []contracts.IosVersionOperator{contracts.IosOpLte, contracts.IosOpGte}
	pages := []int{1, 2, 7, 1000}

	for _, category := range categories {
		for _, sortOrder := range sorts {
			for _, version := range versions {
				for _, op := range operators {
					categorized := normalizer.FilterAppsByCategory(apps, category)
					filtered := normalizer.FilterAppsByIosVersion(categorized, version, op)
					sorted := normalizer.SortApps(filtered, sortOrder)
					for _, page := range pages {
						for _, pageSize := range []int{1, 24, 60} {
							want, wantPagination := normalizer.PaginateApps(sorted, page, pageSize)
							got, gotPagination := snapshot.Browse(category, normalizer.NewIosFilter(version, op), sortOrder, page, pageSize)
							label := fmt.Sprintf("category=%s sort=%s ios=%v op=%s page=%d size=%d", category, sortOrder, derefVersion(version), op, page, pageSize)
							if gotPagination != wantPagination {
								t.Fatalf("%s: pagination %+v, want %+v", label, gotPagination, wantPagination)
							}
							if len(got) != len(want) {
								t.Fatalf("%s: %d apps, want %d", label, len(got), len(want))
							}
							for i := range got {
								if got[i].ID != want[i].ID {
									t.Fatalf("%s: app %d is %s, want %s", label, i, got[i].ID, want[i].ID)
								}
							}
						}
					}
				}
			}
		}
	}
}

// Browse hands out copies: changing a returned app must not change the shared snapshot.
func TestActiveAppsBrowseReturnsCopies(t *testing.T) {
	snapshot := newActiveApps(browseFixture(10))
	got, _ := snapshot.Browse(contracts.CategoryAll, nil, contracts.SortNameAsc, 1, 10)
	original := snapshot.Apps[snapshot.Order(contracts.SortNameAsc)[0]].Name
	got[0].Name = "changed"
	if snapshot.Apps[snapshot.Order(contracts.SortNameAsc)[0]].Name != original {
		t.Fatal("Browse returned an alias into the snapshot")
	}
}

func ptr(s string) *string { return &s }

func derefVersion(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

// The snapshot's facets must equal the SQL counts they replace, also after apps leave
// the active set.
func TestSnapshotCategoryFacetsMatchSQL(t *testing.T) {
	s := newTestStore(t)
	categories := []contracts.AppCategory{contracts.CategoryGames, contracts.CategoryTools, contracts.CategoryEmulators}
	var apps []contracts.AppDto
	for i := 0; i < 9; i++ {
		bundle := fmt.Sprintf("com.example.app%d", i)
		category := categories[i%len(categories)]
		apps = append(apps, makeApp("test-source:"+bundle, bundle, fmt.Sprintf("App %d", i), func(a *contracts.AppDto) {
			a.Category = category
		}))
	}
	check := func(label string) {
		t.Helper()
		want := normalizer.BuildCategoryFacets(s.CountByCategory(), s.TotalActive())
		got := s.ActiveSnapshot().CategoryFacets()
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Fatalf("%s: snapshot facets %v, SQL facets %v", label, got, want)
		}
	}

	if err := s.SyncSourceCatalog("test-source", apps, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}
	check("initial")

	// Take three apps out of the active set (normal syncs only get there over several
	// cycles; see the lifecycle tests) and rebuild the snapshot as a sync would.
	if _, err := s.db.Exec(`UPDATE catalog_apps SET status = 'missing' WHERE canonical_id IN ('com.example.app0', 'com.example.app1', 'com.example.app4')`); err != nil {
		t.Fatalf("mark missing: %v", err)
	}
	s.refreshActiveAppsCache(s.catalogSeq.Add(1))
	if total := s.TotalActive(); total >= len(apps) {
		t.Fatalf("expected some apps to leave the active set, still %d active", total)
	}
	check("after removals")
}
