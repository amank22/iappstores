package httpapi

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/catalog"
	"github.com/iappstores/api-go/internal/contracts"
)

var nonWordRe = regexp.MustCompile(`[^a-z0-9]+`)

// textTokens is the set of lowercase words longer than two characters in an app's name,
// subtitle, description, developer and App Store genres.
func textTokens(app contracts.AppDto) map[string]bool {
	parts := []string{app.Name}
	if app.Subtitle != nil {
		parts = append(parts, *app.Subtitle)
	}
	if app.Description != nil {
		parts = append(parts, *app.Description)
	}
	if app.DeveloperName != nil {
		parts = append(parts, *app.DeveloperName)
	}
	if app.AppStore != nil {
		parts = append(parts, app.AppStore.Genres...)
	}
	text := strings.ToLower(strings.Join(parts, " "))
	words := nonWordRe.Split(text, -1)
	out := map[string]bool{}
	for _, w := range words {
		if len(w) > 2 {
			out[w] = true
		}
	}
	return out
}

func matchesAnyIdentity(app contracts.AppDto, appID string) bool {
	lowered := strings.ToLower(appID)
	for _, id := range appIdentity(app) {
		if strings.ToLower(id) == lowered {
			return true
		}
	}
	return false
}

// recommendationIndex holds everything recommendations need that doesn't depend on the
// target app, computed once per catalog snapshot (and refreshed every
// recommendationIndexTTL for new App Store metadata). Ranking used to tokenize both apps'
// descriptions inside the sort comparator and enrich the whole catalog on every request:
// minutes of CPU per request, which piled up until the API ran out of memory.
type recommendationIndex struct {
	snapshot *catalog.ActiveApps
	builtAt  time.Time

	apps []contracts.AppDto // the snapshot's apps, enriched with cached App Store metadata
	// tokens[i] is textTokens(apps[i]) as sorted, unique token ids.
	tokens [][]uint32
	// devFirst[i] is developerNameFirst(apps[i]) (similarity); devOf[i] is
	// developerNameOf(apps[i]) (same-developer section).
	devFirst []*string
	devOf    []*string
	// byIdentity maps each lowercase appIdentity value to the indexes of the apps that
	// carry it, in catalog order.
	byIdentity map[string][]int32
}

// recommendationIndexTTL bounds how stale the App Store metadata (genres, developer
// names) used for ranking can get between catalog rebuilds.
const recommendationIndexTTL = 30 * time.Minute

func newRecommendationIndex(snapshot *catalog.ActiveApps, apps []contracts.AppDto, now time.Time) *recommendationIndex {
	idx := &recommendationIndex{
		snapshot:   snapshot,
		builtAt:    now,
		apps:       apps,
		tokens:     make([][]uint32, len(apps)),
		devFirst:   make([]*string, len(apps)),
		devOf:      make([]*string, len(apps)),
		byIdentity: make(map[string][]int32, len(apps)*3),
	}
	dictionary := map[string]uint32{}
	for i := range apps {
		set := textTokens(apps[i])
		ids := make([]uint32, 0, len(set))
		for token := range set {
			id, ok := dictionary[token]
			if !ok {
				id = uint32(len(dictionary))
				dictionary[token] = id
			}
			ids = append(ids, id)
		}
		sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })
		idx.tokens[i] = ids
		idx.devFirst[i] = developerNameFirst(apps[i])
		idx.devOf[i] = developerNameOf(apps[i])
		seen := map[string]bool{}
		for _, id := range appIdentity(apps[i]) {
			key := strings.ToLower(id)
			if !seen[key] {
				seen[key] = true
				idx.byIdentity[key] = append(idx.byIdentity[key], int32(i))
			}
		}
	}
	return idx
}

// find returns the index of the first app (in catalog order) with appID among its
// identities, or -1.
func (idx *recommendationIndex) find(appID string) int {
	if matches := idx.byIdentity[strings.ToLower(appID)]; len(matches) > 0 {
		return int(matches[0])
	}
	return -1
}

func sharedTokens(a, b []uint32) int {
	shared, i, j := 0, 0, 0
	for i < len(a) && j < len(b) {
		switch {
		case a[i] == b[j]:
			shared++
			i++
			j++
		case a[i] < b[j]:
			i++
		default:
			j++
		}
	}
	return shared
}

// similarity scores apps[j] against apps[t]: Jaccard similarity of their token sets,
// +0.35 for the same category, +0.25 for the same developer (or neither having one).
func (idx *recommendationIndex) similarity(t, j int) float64 {
	shared := sharedTokens(idx.tokens[t], idx.tokens[j])
	denom := len(idx.tokens[t]) + len(idx.tokens[j]) - shared
	if denom < 1 {
		denom = 1
	}
	score := float64(shared) / float64(denom)
	if idx.apps[t].Category == idx.apps[j].Category {
		score += 0.35
	}
	aDev, bDev := idx.devFirst[t], idx.devFirst[j]
	if aDev != nil && bDev != nil && *aDev == *bDev {
		score += 0.25
	} else if aDev == nil && bDev == nil {
		score += 0.25
	}
	return score
}

// recommend builds the recommendation sections for apps[t]. coIDs are the ids of apps
// downloaded alongside it, most frequent first.
func (idx *recommendationIndex) recommend(t int, coIDs []string) contracts.RecommendationsResponse {
	target := idx.apps[t]

	// Every other app, in catalog order, ranked by similarity (stable, so ties keep
	// catalog order).
	others := make([]int, 0, len(idx.apps)-1)
	for i := range idx.apps {
		if idx.apps[i].ID != target.ID {
			others = append(others, i)
		}
	}
	scores := make([]float64, len(idx.apps))
	for _, i := range others {
		scores[i] = idx.similarity(t, i)
	}
	ranked := append([]int(nil), others...)
	sort.SliceStable(ranked, func(a, b int) bool { return scores[ranked[a]] > scores[ranked[b]] })

	pick := func(indexes []int) []contracts.AppDto {
		out := make([]contracts.AppDto, len(indexes))
		for k, i := range indexes {
			out[k] = idx.apps[i]
		}
		return out
	}
	limit := func(indexes []int, n int) []int {
		if len(indexes) > n {
			return indexes[:n]
		}
		return indexes
	}

	// Co-downloads: for each id, the last other app (in catalog order) carrying it.
	coDownloaded := []int{}
	for _, id := range coIDs {
		matches := idx.byIdentity[strings.ToLower(id)]
		for k := len(matches) - 1; k >= 0; k-- {
			if m := int(matches[k]); idx.apps[m].ID != target.ID {
				coDownloaded = append(coDownloaded, m)
				break
			}
		}
		if len(coDownloaded) >= 6 {
			break
		}
	}

	related := []int{}
	for _, i := range ranked {
		if idx.apps[i].Category == target.Category {
			related = append(related, i)
			if len(related) >= 6 {
				break
			}
		}
	}
	similar := limit(ranked, 6)
	alsoDownloaded := coDownloaded
	if len(alsoDownloaded) < 3 {
		alsoDownloaded = limit(ranked, 6)
	}

	sameDeveloper := []int{}
	if developer := idx.devOf[t]; developer != nil {
		for _, i := range others {
			if d := idx.devOf[i]; d != nil && *d == *developer {
				sameDeveloper = append(sameDeveloper, i)
				if len(sameDeveloper) >= 6 {
					break
				}
			}
		}
	}

	sourceIDs := map[string]bool{}
	for _, opt := range target.DownloadOptions {
		sourceIDs[opt.SourceID] = true
	}
	sameRepository := []int{}
	for _, i := range others {
		for _, opt := range idx.apps[i].DownloadOptions {
			if sourceIDs[opt.SourceID] {
				sameRepository = append(sameRepository, i)
				break
			}
		}
		if len(sameRepository) >= 6 {
			break
		}
	}

	return contracts.RecommendationsResponse{Sections: []contracts.RecommendationSection{
		{ID: "related", Title: "Related Apps", Apps: pick(related)},
		{ID: "similar", Title: "Similar Apps", Apps: pick(similar)},
		{ID: "also-downloaded", Title: "Users also downloaded", Apps: pick(alsoDownloaded)},
		{ID: "same-developer", Title: "More from the same developer", Apps: pick(sameDeveloper)},
		{ID: "same-repository", Title: "More from the same repository", Apps: pick(sameRepository)},
	}}
}

// recommendationIndexCache keeps the current index. The first request builds it; after
// that a request that finds it outdated (new catalog snapshot, or older than the TTL)
// starts one background rebuild and keeps serving the previous index meanwhile.
type recommendationIndexCache struct {
	mu         sync.Mutex
	current    *recommendationIndex
	rebuilding bool
}

func (s *Server) recommendationIndex() *recommendationIndex {
	snapshot := s.Catalog.ActiveSnapshot()
	now := time.Now()
	cache := &s.recommendations

	cache.mu.Lock()
	current := cache.current
	if current == nil {
		// First use: build synchronously, holding the lock so concurrent first
		// requests wait for this build instead of each starting their own.
		defer cache.mu.Unlock()
		cache.current = s.buildRecommendationIndex(snapshot, now)
		return cache.current
	}
	outdated := current.snapshot != snapshot || now.Sub(current.builtAt) > recommendationIndexTTL
	startRebuild := outdated && !cache.rebuilding
	if startRebuild {
		cache.rebuilding = true
	}
	cache.mu.Unlock()

	if startRebuild {
		go func() {
			next := s.buildRecommendationIndex(s.Catalog.ActiveSnapshot(), time.Now())
			cache.mu.Lock()
			cache.current = next
			cache.rebuilding = false
			cache.mu.Unlock()
		}()
	}
	return current
}

func (s *Server) buildRecommendationIndex(snapshot *catalog.ActiveApps, now time.Time) *recommendationIndex {
	apps := make([]contracts.AppDto, len(snapshot.Apps))
	copy(apps, snapshot.Apps)
	return newRecommendationIndex(snapshot, s.AppStore.EnrichAppsWithCachedAppStoreMetadata(apps, appstore.Country()), now)
}

func (s *Server) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("appId")
	idx := s.recommendationIndex()
	t := idx.find(appID)
	if t < 0 {
		sendError(w, 404, "app_not_found", "Unknown app.", nil)
		return
	}
	since := time.Now().Add(-90 * 24 * time.Hour).UnixMilli()
	coIDs := s.Analytics.ReadAlsoDownloaded(idx.apps[t].ID, since, 12)
	writeJSON(w, 200, idx.recommend(t, coIDs))
}
