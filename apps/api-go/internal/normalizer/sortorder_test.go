package normalizer

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"sort"
	"testing"

	"github.com/iappstores/api-go/internal/contracts"
)

// The reference* functions are the implementations SortApps, FilterAppsByCategory and
// FilterAppsByIosVersion had before keyed sorting: a per-comparison date parse and
// collation call. The keyed versions must return exactly the same order.

func referenceSortApps(apps []contracts.AppDto, sortOrder contracts.AppSort) []contracts.AppDto {
	out := make([]contracts.AppDto, len(apps))
	copy(out, apps)
	if sortOrder == contracts.SortNameAsc || sortOrder == contracts.SortNameDesc {
		sort.SliceStable(out, func(i, j int) bool {
			a, b := out[i], out[j]
			cmp := BaseCompare(a.Name, b.Name)
			if cmp != 0 {
				if sortOrder == contracts.SortNameAsc {
					return cmp < 0
				}
				return cmp > 0
			}
			return DefaultCompare(a.ID, b.ID) < 0
		})
		return out
	}
	sort.SliceStable(out, func(i, j int) bool {
		dateDiff := appTimestamp(out[j]) - appTimestamp(out[i])
		if dateDiff != 0 {
			return dateDiff < 0
		}
		return DefaultCompare(out[i].Name, out[j].Name) < 0
	})
	return out
}

func referenceFilterRecent(apps []contracts.AppDto) []contracts.AppDto {
	out := make([]contracts.AppDto, len(apps))
	copy(out, apps)
	sort.SliceStable(out, func(i, j int) bool {
		return appTimestamp(out[j]) < appTimestamp(out[i])
	})
	return out
}

func referenceMatchesIosVersion(app contracts.AppDto, iosVersion string, operator contracts.IosVersionOperator) bool {
	appMin := parseIosVersion(app.MinOSVersion)
	requested := parseIosVersion(&iosVersion)
	if appMin == nil || requested == nil {
		return false
	}
	cmp := compareIosVersions(appMin, requested)
	if operator == contracts.IosOpLte {
		return cmp <= 0
	}
	return cmp >= 0
}

func strPtr(s string) *string { return &s }

// sortFixtureApps builds a catalog with the cases that make collation and date ordering
// tricky: case and accent variants, exact duplicate names (ties), non-Latin scripts,
// missing and unparseable dates, several date layouts, equal timestamps, odd ids.
func sortFixtureApps(n int, seed int64) []contracts.AppDto {
	rng := rand.New(rand.NewSource(seed))
	names := []string{
		"Delta", "delta", "Délta", "DELTA", "Delta ", "Älpha", "Alpha", "alpha", "Æther",
		"Zebra", "zebra", "Ångström", "Ω Omega", "ωmega", "日本語アプリ", "中文", "한국어",
		"Ünïcödé", "1Password", "10Gram", "2048", "_under", "-dash", "Émulator", "emulator",
		"Straße", "Strasse", "ﬁle", "file", "Ｆｕｌｌｗｉｄｔｈ", "Fullwidth", "🎮 Games", "",
	}
	dates := []*string{
		nil, strPtr(""), strPtr("not a date"), strPtr("12345"),
		strPtr("2024-01-02"), strPtr("2024-01-02T10:00:00Z"), strPtr("2024-01-02T10:00:00.5+02:00"),
		strPtr("2023-12-31"), strPtr("2024/01/02"), strPtr("01/02/2024"), strPtr("Jan 2, 2024"),
		strPtr("Tue, 02 Jan 2024 10:00:00 +0000"), strPtr("2025-06-30 08:15:00"),
	}
	oses := []*string{nil, strPtr("14.0"), strPtr("15"), strPtr("16.4.1"), strPtr("iOS 17.0+"), strPtr("x")}
	categories := []contracts.AppCategory{
		contracts.CategoryGames, contracts.CategoryTools, contracts.CategoryEmulators, contracts.CategoryMedia,
	}
	apps := make([]contracts.AppDto, n)
	for i := range apps {
		apps[i] = contracts.AppDto{
			ID:           fmt.Sprintf("%s:%c.app-%03d", []string{"bundle", "src", "Bundle"}[rng.Intn(3)], 'a'+rune(rng.Intn(26)), rng.Intn(1000)),
			Name:         names[rng.Intn(len(names))],
			VersionDate:  dates[rng.Intn(len(dates))],
			MinOSVersion: oses[rng.Intn(len(oses))],
			Category:     categories[rng.Intn(len(categories))],
		}
		// Unique-ish ids like the real catalog, with a few deliberate collisions.
		if rng.Intn(20) != 0 {
			apps[i].ID += fmt.Sprintf("-%d", i)
		}
	}
	return apps
}

func appIDs(apps []contracts.AppDto) []string {
	out := make([]string, len(apps))
	for i := range apps {
		out[i] = apps[i].ID + "|" + apps[i].Name
	}
	return out
}

func assertSameOrder(t *testing.T, label string, got, want []contracts.AppDto) {
	t.Helper()
	g, w := appIDs(got), appIDs(want)
	if len(g) != len(w) {
		t.Fatalf("%s: got %d apps, want %d", label, len(g), len(w))
	}
	for i := range g {
		if g[i] != w[i] {
			t.Fatalf("%s: first difference at %d: got %q, want %q", label, i, g[i], w[i])
		}
	}
}

var allSorts = []contracts.AppSort{contracts.SortRecent, contracts.SortNameAsc, contracts.SortNameDesc}

func checkMatchesReference(t *testing.T, apps []contracts.AppDto) {
	t.Helper()
	for _, s := range allSorts {
		assertSameOrder(t, "SortApps "+string(s), SortApps(apps, s), referenceSortApps(apps, s))
	}
	assertSameOrder(t, "FilterAppsByCategory recent",
		FilterAppsByCategory(apps, contracts.CategoryRecent), referenceFilterRecent(apps))

	for _, v := range []string{"15", "16.4", "17.0.1", "nonsense"} {
		for _, op := range []contracts.IosVersionOperator{contracts.IosOpLte, contracts.IosOpGte} {
			version := v
			want := []contracts.AppDto{}
			for _, app := range apps {
				if referenceMatchesIosVersion(app, version, op) {
					want = append(want, app)
				}
			}
			assertSameOrder(t, "FilterAppsByIosVersion "+v+" "+string(op),
				FilterAppsByIosVersion(apps, &version, op), want)
		}
	}
}

func TestKeyedSortMatchesReference(t *testing.T) {
	for _, n := range []int{0, 1, 2, 7, 64, 3000} {
		for seed := int64(1); seed <= 3; seed++ {
			checkMatchesReference(t, sortFixtureApps(n, seed))
		}
	}
}

// TestKeyedSortMatchesReferenceOnCatalogDump runs the same comparison on a real catalog
// dump (a JSON array of apps, e.g. every page of /api/apps concatenated) when
// SORT_FIXTURE_JSON points at one.
func TestKeyedSortMatchesReferenceOnCatalogDump(t *testing.T) {
	path := os.Getenv("SORT_FIXTURE_JSON")
	if path == "" {
		t.Skip("SORT_FIXTURE_JSON not set")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var apps []contracts.AppDto
	if err := json.Unmarshal(raw, &apps); err != nil {
		t.Fatal(err)
	}
	// Shuffle so the dump's existing order doesn't make the sort trivially stable.
	rand.New(rand.NewSource(7)).Shuffle(len(apps), func(i, j int) { apps[i], apps[j] = apps[j], apps[i] })
	checkMatchesReference(t, apps)
}

func TestPageBoundsMatchesPaginate(t *testing.T) {
	for _, total := range []int{0, 1, 23, 24, 25, 100} {
		for _, page := range []int{1, 2, 5, 99} {
			start, end, p := PageBounds(total, page, 24)
			if start < 0 || end > total || start > end {
				t.Fatalf("bad bounds %d..%d for total %d page %d", start, end, total, page)
			}
			if p.TotalItems != total || (total > 0 && p.Page > p.TotalPages) {
				t.Fatalf("bad pagination %+v", p)
			}
		}
	}
}

func BenchmarkSortAppsRecent(b *testing.B) {
	apps := sortFixtureApps(5000, 1)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		SortApps(apps, contracts.SortRecent)
	}
}

func BenchmarkReferenceSortAppsRecent(b *testing.B) {
	apps := sortFixtureApps(5000, 1)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		referenceSortApps(apps, contracts.SortRecent)
	}
}
