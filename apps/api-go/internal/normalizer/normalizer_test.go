package normalizer

import (
	"testing"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/sources"
)

var testSource = sources.SourceDefinition{
	ID:   "fastsign-altstore",
	Name: "FastSign Lite",
	URL:  "https://fastsign.dev/repo.lite.altstore.json",
}

func mustStr(apps []contracts.AppDto) []string {
	out := make([]string, len(apps))
	for i, a := range apps {
		out[i] = a.Name
	}
	return out
}

func TestNormalizeAltStoreRepoBasic(t *testing.T) {
	raw := map[string]interface{}{
		"apps": []interface{}{
			map[string]interface{}{
				"name":                 "Example App",
				"bundleIdentifier":     "com.example.app",
				"developerName":        "Example Dev",
				"subtitle":             "Useful app",
				"localizedDescription": "Long app description",
				"iconURL":              "https://example.com/icon.png",
				"appStoreURL":          "https://apps.apple.com/us/app/example-app/id123456789",
				"screenshots":          []interface{}{"https://example.com/screen.png"},
				"versions": []interface{}{
					map[string]interface{}{
						"version":              "1.0.0",
						"date":                 "2024-01-01",
						"localizedDescription": "Initial build",
						"downloadURL":          "https://example.com/app.ipa",
						"size":                 float64(1234),
						"minOSVersion":         "15.0",
					},
				},
			},
		},
	}

	apps := NormalizeAltStoreRepo(raw, testSource)
	if len(apps) != 1 {
		t.Fatalf("expected 1 app, got %d", len(apps))
	}
	app := apps[0]
	if app.ID != "fastsign-altstore:com.example.app" {
		t.Errorf("id = %s", app.ID)
	}
	if app.Category != contracts.CategoryTools {
		t.Errorf("category = %s, want tools", app.Category)
	}
	if app.AppStoreURL == nil || *app.AppStoreURL != "https://apps.apple.com/us/app/example-app/id123456789" {
		t.Errorf("appStoreUrl = %v", app.AppStoreURL)
	}
	if app.LatestVersion == nil || *app.LatestVersion != "1.0.0" {
		t.Errorf("latestVersion = %v", app.LatestVersion)
	}
	if app.DownloadURL == nil || *app.DownloadURL != "https://example.com/app.ipa" {
		t.Errorf("downloadURL = %v", app.DownloadURL)
	}
	if len(app.DownloadOptions) != 1 || app.DownloadOptions[0].SourceID != "fastsign-altstore" {
		t.Errorf("downloadOptions = %+v", app.DownloadOptions)
	}
}

func TestSearchApps(t *testing.T) {
	raw := map[string]interface{}{
		"apps": []interface{}{
			map[string]interface{}{
				"name":             "Delta",
				"bundleIdentifier": "com.rileytestut.Delta",
				"developerName":    "Riley Testut",
				"versions":         []interface{}{},
			},
		},
	}
	apps := NormalizeAltStoreRepo(raw, testSource)
	if len(SearchApps(apps, "riley delta")) != 1 {
		t.Errorf("expected match for 'riley delta'")
	}
	if len(SearchApps(apps, "missing")) != 0 {
		t.Errorf("expected no match for 'missing'")
	}
}

func TestCategorization(t *testing.T) {
	raw := map[string]interface{}{
		"apps": []interface{}{
			map[string]interface{}{"name": "RetroArch Emulator", "bundleIdentifier": "com.example.emulator", "versions": []interface{}{}},
			map[string]interface{}{"name": "Chat Messenger", "bundleIdentifier": "com.example.social", "versions": []interface{}{}},
			map[string]interface{}{"name": "Manga Reader", "bundleIdentifier": "com.example.books", "versions": []interface{}{}},
		},
	}
	apps := NormalizeAltStoreRepo(raw, testSource)

	if got := mustStr(FilterAppsByCategory(apps, contracts.CategoryEmulators)); len(got) != 1 || got[0] != "RetroArch Emulator" {
		t.Errorf("emulators filter = %v", got)
	}
	if got := mustStr(FilterAppsByCategory(apps, contracts.CategorySocial)); len(got) != 1 || got[0] != "Chat Messenger" {
		t.Errorf("social filter = %v", got)
	}
	if got := mustStr(FilterAppsByCategory(apps, contracts.CategoryBooks)); len(got) != 1 || got[0] != "Manga Reader" {
		t.Errorf("books filter = %v", got)
	}
}

func strp(s string) *string { return &s }

func TestFilterAppsByIosVersion(t *testing.T) {
	raw := map[string]interface{}{
		"apps": []interface{}{
			map[string]interface{}{"name": "Older App", "bundleIdentifier": "com.example.older", "versions": []interface{}{map[string]interface{}{"version": "1.0.0", "minOSVersion": "14.0"}}},
			map[string]interface{}{"name": "Newer App", "bundleIdentifier": "com.example.newer", "versions": []interface{}{map[string]interface{}{"version": "1.0.0", "minOSVersion": "17.2"}}},
			map[string]interface{}{"name": "Unknown App", "bundleIdentifier": "com.example.unknown", "versions": []interface{}{}},
		},
	}
	apps := NormalizeAltStoreRepo(raw, testSource)

	lte := FilterAppsByIosVersion(apps, strp("16"), contracts.IosOpLte)
	if got := mustStr(lte); len(got) != 1 || got[0] != "Older App" {
		t.Errorf("lte filter = %v", got)
	}
	gte := FilterAppsByIosVersion(apps, strp("16"), contracts.IosOpGte)
	if got := mustStr(gte); len(got) != 1 || got[0] != "Newer App" {
		t.Errorf("gte filter = %v", got)
	}
}

func TestGroupAppsByBundleId(t *testing.T) {
	source2 := sources.SourceDefinition{ID: "mirror", Name: "Mirror Source", URL: "https://mirror.example.com/repo.json"}
	first := NormalizeAltStoreRepo(map[string]interface{}{
		"apps": []interface{}{map[string]interface{}{
			"name": "Shared App", "bundleIdentifier": "com.example.shared",
			"versions": []interface{}{map[string]interface{}{"version": "1.0.0", "date": "2024-01-01", "downloadURL": "https://example.com/one.ipa"}},
		}},
	}, testSource)
	second := NormalizeAltStoreRepo(map[string]interface{}{
		"apps": []interface{}{map[string]interface{}{
			"name": "Shared App", "bundleIdentifier": "com.example.shared",
			"versions": []interface{}{map[string]interface{}{"version": "2.0.0", "date": "2024-02-01", "downloadURL": "https://example.com/two.ipa"}},
		}},
	}, source2)

	grouped := GroupAppsByBundleId(append(first, second...))
	if len(grouped) != 1 {
		t.Fatalf("expected 1 grouped app, got %d", len(grouped))
	}
	g := grouped[0]
	if g.ID != "bundle:com.example.shared" {
		t.Errorf("id = %s", g.ID)
	}
	if g.SourceID != "multiple" || g.SourceName != "2 sources" {
		t.Errorf("sourceId/sourceName = %s/%s", g.SourceID, g.SourceName)
	}
	if g.LatestVersion == nil || *g.LatestVersion != "2.0.0" {
		t.Errorf("latestVersion = %v", g.LatestVersion)
	}
	if len(g.DownloadOptions) != 2 || g.DownloadOptions[0].SourceName != "Mirror Source" {
		t.Errorf("downloadOptions order = %+v", g.DownloadOptions)
	}
}

func TestSortAppsAndPagination(t *testing.T) {
	raw := map[string]interface{}{
		"apps": []interface{}{
			map[string]interface{}{"name": "beta", "bundleIdentifier": "com.example.beta", "versions": []interface{}{map[string]interface{}{"version": "1.0.0", "date": "2024-01-01"}}},
			map[string]interface{}{"name": "Alpha", "bundleIdentifier": "com.example.alpha", "versions": []interface{}{map[string]interface{}{"version": "1.0.0", "date": "2024-03-01"}}},
			map[string]interface{}{"name": "Charlie", "bundleIdentifier": "com.example.charlie", "versions": []interface{}{map[string]interface{}{"version": "1.0.0", "date": "2024-02-01"}}},
		},
	}
	apps := NormalizeAltStoreRepo(raw, testSource)
	grouped := GroupAppsByBundleId(apps)

	if got := mustStr(SortApps(grouped, contracts.SortRecent)); !equal(got, []string{"Alpha", "Charlie", "beta"}) {
		t.Errorf("recent sort = %v", got)
	}
	if got := mustStr(SortApps(grouped, contracts.SortNameAsc)); !equal(got, []string{"Alpha", "beta", "Charlie"}) {
		t.Errorf("name-asc sort = %v", got)
	}
	if got := mustStr(SortApps(grouped, contracts.SortNameDesc)); !equal(got, []string{"Charlie", "beta", "Alpha"}) {
		t.Errorf("name-desc sort = %v", got)
	}

	sortedByName := SortApps(grouped, contracts.SortNameAsc)
	paged, pagination := PaginateApps(sortedByName, 1, 2)
	if got := mustStr(paged); !equal(got, []string{"Alpha", "beta"}) {
		t.Errorf("paged = %v", got)
	}
	if pagination.TotalItems != 3 || pagination.TotalPages != 2 || !pagination.HasNextPage {
		t.Errorf("pagination = %+v", pagination)
	}
}

func TestPaginateAppsClampsPage(t *testing.T) {
	apps := make([]contracts.AppDto, 3)
	for i := range apps {
		apps[i] = contracts.AppDto{ID: strconvItoa(i)}
	}
	_, pagination := PaginateApps(apps, 99, 1)
	if pagination.Page != 3 {
		t.Errorf("expected clamped page 3, got %d", pagination.Page)
	}

	empty, pagination2 := PaginateApps(nil, 1, 10)
	if len(empty) != 0 || pagination2.TotalPages != 0 || pagination2.Page != 1 {
		t.Errorf("empty pagination = %+v", pagination2)
	}
}

func strconvItoa(i int) string {
	digits := "0123456789"
	if i == 0 {
		return "0"
	}
	out := ""
	for i > 0 {
		out = string(digits[i%10]) + out
		i /= 10
	}
	return out
}

func TestGetCategoryFacets(t *testing.T) {
	raw := map[string]interface{}{
		"apps": []interface{}{
			map[string]interface{}{"name": "Arcade Game", "bundleIdentifier": "com.example.arcade", "developerName": "Games Dev", "versions": []interface{}{}},
			map[string]interface{}{"name": "Signing Tool", "bundleIdentifier": "com.example.sign", "developerName": "Tools Dev", "versions": []interface{}{}},
		},
	}
	apps := NormalizeAltStoreRepo(raw, testSource)
	facets := GetCategoryFacets(apps)
	byID := map[contracts.AppCategory]int{}
	for _, f := range facets {
		byID[f.ID] = f.AppCount
	}
	if byID[contracts.CategoryAll] != 2 {
		t.Errorf("all facet = %d", byID[contracts.CategoryAll])
	}
	if byID[contracts.CategoryGames] != 1 {
		t.Errorf("games facet = %d", byID[contracts.CategoryGames])
	}
	if byID[contracts.CategoryUtilities] != 1 {
		t.Errorf("utilities facet = %d", byID[contracts.CategoryUtilities])
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
