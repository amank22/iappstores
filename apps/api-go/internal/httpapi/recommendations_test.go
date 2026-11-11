package httpapi

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
)

// referenceSimilarity and referenceRecommendations are the implementation the index
// replaced (tokenizing inside the sort comparator), kept to check the index returns
// exactly the same sections.
func referenceSimilarity(a, b contracts.AppDto) float64 {
	left := textTokens(a)
	right := textTokens(b)
	shared := 0
	union := map[string]bool{}
	for t := range left {
		union[t] = true
		if right[t] {
			shared++
		}
	}
	for t := range right {
		union[t] = true
	}
	denom := len(union)
	if denom < 1 {
		denom = 1
	}
	score := float64(shared) / float64(denom)
	if a.Category == b.Category {
		score += 0.35
	}
	aDev := developerNameFirst(a)
	bDev := developerNameFirst(b)
	if aDev != nil && bDev != nil && *aDev == *bDev {
		score += 0.25
	} else if aDev == nil && bDev == nil {
		score += 0.25
	}
	return score
}

func referenceLimit(apps []contracts.AppDto, limit int) []contracts.AppDto {
	if len(apps) <= limit {
		return apps
	}
	return apps[:limit]
}

func referenceNonNil(apps []contracts.AppDto) []contracts.AppDto {
	if apps == nil {
		return []contracts.AppDto{}
	}
	return apps
}

func referenceRecommendations(apps []contracts.AppDto, appID string, coIDs []string) (contracts.RecommendationsResponse, bool) {
	var target *contracts.AppDto
	for i := range apps {
		if matchesAnyIdentity(apps[i], appID) {
			target = &apps[i]
			break
		}
	}
	if target == nil {
		return contracts.RecommendationsResponse{}, false
	}
	others := make([]contracts.AppDto, 0, len(apps)-1)
	for _, app := range apps {
		if app.ID != target.ID {
			others = append(others, app)
		}
	}
	ranked := make([]contracts.AppDto, len(others))
	copy(ranked, others)
	sort.SliceStable(ranked, func(i, j int) bool {
		return referenceSimilarity(*target, ranked[j]) < referenceSimilarity(*target, ranked[i])
	})
	developer := developerNameOf(*target)
	sourceIDs := map[string]bool{}
	for _, opt := range target.DownloadOptions {
		sourceIDs[opt.SourceID] = true
	}
	othersByID := map[string]contracts.AppDto{}
	for _, app := range others {
		for _, id := range appIdentity(app) {
			othersByID[strings.ToLower(id)] = app
		}
	}
	coDownloaded := []contracts.AppDto{}
	for _, id := range coIDs {
		if app, ok := othersByID[strings.ToLower(id)]; ok {
			coDownloaded = append(coDownloaded, app)
		}
		if len(coDownloaded) >= 6 {
			break
		}
	}
	related := []contracts.AppDto{}
	for _, app := range ranked {
		if app.Category == target.Category {
			related = append(related, app)
			if len(related) >= 6 {
				break
			}
		}
	}
	similar := referenceLimit(ranked, 6)
	alsoDownloaded := coDownloaded
	if len(alsoDownloaded) < 3 {
		alsoDownloaded = referenceLimit(ranked, 6)
	}
	sameDeveloper := []contracts.AppDto{}
	if developer != nil {
		for _, app := range others {
			if d := developerNameOf(app); d != nil && *d == *developer {
				sameDeveloper = append(sameDeveloper, app)
				if len(sameDeveloper) >= 6 {
					break
				}
			}
		}
	}
	sameRepository := []contracts.AppDto{}
	for _, app := range others {
		matched := false
		for _, opt := range app.DownloadOptions {
			if sourceIDs[opt.SourceID] {
				matched = true
				break
			}
		}
		if matched {
			sameRepository = append(sameRepository, app)
			if len(sameRepository) >= 6 {
				break
			}
		}
	}
	return contracts.RecommendationsResponse{Sections: []contracts.RecommendationSection{
		{ID: "related", Title: "Related Apps", Apps: referenceNonNil(related)},
		{ID: "similar", Title: "Similar Apps", Apps: referenceNonNil(similar)},
		{ID: "also-downloaded", Title: "Users also downloaded", Apps: referenceNonNil(alsoDownloaded)},
		{ID: "same-developer", Title: "More from the same developer", Apps: referenceNonNil(sameDeveloper)},
		{ID: "same-repository", Title: "More from the same repository", Apps: referenceNonNil(sameRepository)},
	}}, true
}

func recStr(s string) *string { return &s }

// recommendationFixture: overlapping vocabularies, shared and missing developers, App
// Store developer names and genres, shared bundle ids across apps, several repositories.
func recommendationFixture(n int) []contracts.AppDto {
	rng := rand.New(rand.NewSource(11))
	words := []string{"photo", "editor", "camera", "filter", "music", "player", "stream", "video", "game",
		"puzzle", "racing", "emulator", "retro", "chat", "social", "notes", "todo", "focus", "timer", "vpn",
		"secure", "fast", "free", "pro", "ultimate", "lite", "the", "and", "for", "with", "AI", "HD", "4K"}
	devs := []string{"", "Acme", "acme", "Retro Labs", "Pixel Co", "Solo Dev"}
	categories := []contracts.AppCategory{contracts.CategoryGames, contracts.CategoryTools, contracts.CategoryMedia, contracts.CategoryEmulators}
	sources := []string{"src-a", "src-b", "src-c", "src-d", "src-e"}
	phrase := func(k int) string {
		out := make([]string, k)
		for i := range out {
			out[i] = words[rng.Intn(len(words))]
		}
		return strings.Join(out, " ")
	}
	apps := make([]contracts.AppDto, n)
	for i := range apps {
		app := contracts.AppDto{
			ID:       fmt.Sprintf("bundle:com.example.app%d", i),
			Name:     phrase(1 + rng.Intn(3)),
			Category: categories[rng.Intn(len(categories))],
		}
		bundle := fmt.Sprintf("com.example.app%d", i)
		if rng.Intn(15) == 0 && i > 0 {
			bundle = fmt.Sprintf("com.example.app%d", rng.Intn(i)) // shared bundle id
		}
		app.BundleIdentifier = recStr(bundle)
		app.CanonicalID = recStr(app.ID)
		if rng.Intn(3) > 0 {
			app.Description = recStr(phrase(5+rng.Intn(40)) + ". " + phrase(3))
		}
		if rng.Intn(2) == 0 {
			app.Subtitle = recStr(phrase(3))
		}
		if d := devs[rng.Intn(len(devs))]; d != "" {
			app.DeveloperName = recStr(d)
		}
		if rng.Intn(3) == 0 {
			meta := &contracts.AppStoreMetadata{Genres: []string{phrase(1), phrase(1)}}
			if rng.Intn(2) == 0 {
				meta.DeveloperName = recStr(devs[1+rng.Intn(len(devs)-1)])
			}
			app.AppStore = meta
		}
		for k := 0; k < 1+rng.Intn(2); k++ {
			app.DownloadOptions = append(app.DownloadOptions, contracts.AppDownloadOption{SourceID: sources[rng.Intn(len(sources))]})
		}
		apps[i] = app
	}
	return apps
}

func TestRecommendationIndexMatchesReference(t *testing.T) {
	// The reference is the slow algorithm being replaced, so keep this small.
	apps := recommendationFixture(48)
	idx := newRecommendationIndex(nil, apps, time.Now())
	coLists := [][]string{
		nil,
		{"bundle:com.example.app3", "com.example.app7", "missing"},
		{"BUNDLE:COM.EXAMPLE.APP1", "com.example.app2", "bundle:com.example.app5", "com.example.app8", "bundle:com.example.app13", "com.example.app21", "com.example.app34"},
	}
	for i, target := range apps {
		// Alternate the id form and the co-download list across targets.
		appID := target.ID
		if i%2 == 1 {
			appID = *target.BundleIdentifier
		}
		c := i % len(coLists)
		coIDs := coLists[c]
		{
			{
				want, ok := referenceRecommendations(apps, appID, coIDs)
				ti := idx.find(appID)
				if !ok || ti < 0 {
					t.Fatalf("app %d (%s): found=%v index=%d", i, appID, ok, ti)
				}
				got := idx.recommend(ti, coIDs)
				gotJSON, _ := json.Marshal(got)
				wantJSON, _ := json.Marshal(want)
				if string(gotJSON) != string(wantJSON) {
					t.Fatalf("app %d (%s) co-list %d differs:\n got %s\nwant %s", i, appID, c, gotJSON, wantJSON)
				}
			}
		}
	}
	if idx.find("does-not-exist") != -1 {
		t.Fatal("unknown id should not be found")
	}
}

func TestRecommendationsEndpoint(t *testing.T) {
	s := newTestServer(t)
	var apps []contracts.AppDto
	for i := 0; i < 5; i++ {
		bundle := fmt.Sprintf("com.example.rec%d", i)
		apps = append(apps, contracts.AppDto{
			ID: "test-source:" + bundle, SourceID: "test-source", SourceName: "Test Source",
			Name: fmt.Sprintf("Photo Editor %d", i), BundleIdentifier: recStr(bundle),
			Category: contracts.CategoryTools, Screenshots: []string{}, Versions: []contracts.AppVersionBuild{},
			DownloadOptions: []contracts.AppDownloadOption{{SourceID: "test-source", SourceName: "Test Source"}},
		})
	}
	if err := s.Catalog.SyncSourceCatalog("test-source", apps, 0); err != nil {
		t.Fatalf("sync: %v", err)
	}

	get := func(path string) (*httptest.ResponseRecorder, contracts.RecommendationsResponse) {
		w := httptest.NewRecorder()
		s.Routes().ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		var body contracts.RecommendationsResponse
		json.Unmarshal(w.Body.Bytes(), &body)
		return w, body
	}
	w, body := get("/api/apps/com.example.rec0/recommendations")
	if w.Code != 200 || len(body.Sections) != 5 {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
	if n := len(body.Sections[1].Apps); n != 4 {
		t.Fatalf("similar section has %d apps, want the 4 others", n)
	}
	if w, _ := get("/api/apps/nope/recommendations"); w.Code != 404 {
		t.Fatalf("unknown app: status %d", w.Code)
	}

	// A catalog change produces a new snapshot; the next request triggers a background
	// rebuild, after which the new app is recommended.
	extra := apps[0]
	extra.ID, extra.BundleIdentifier, extra.Name = "test-source:com.example.rec9", recStr("com.example.rec9"), "Photo Editor 9"
	if err := s.Catalog.SyncSourceCatalog("test-source", append(apps, extra), 1); err != nil {
		t.Fatalf("sync: %v", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		_, body = get("/api/apps/com.example.rec0/recommendations")
		if len(body.Sections[1].Apps) == 5 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("index not rebuilt after catalog change: %+v", body.Sections[1].Apps)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
