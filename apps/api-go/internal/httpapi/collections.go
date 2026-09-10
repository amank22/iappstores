package httpapi

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/normalizer"
)

type collectionDef struct {
	title       string
	description string
	category    contracts.AppCategory
}

var collectionDefs = map[contracts.CollectionSlug]collectionDef{
	contracts.CollectionBestEmulator:     {"Best Emulator Apps", "Top emulator IPA listings ranked by quality, freshness, availability, and demand.", contracts.CategoryEmulators},
	contracts.CollectionBestMusic:        {"Best Music Apps", "Top music IPA listings ranked by quality, freshness, availability, and demand.", contracts.CategoryMusic},
	contracts.CollectionBestProductivity: {"Best Productivity Apps", "Top productivity IPA listings ranked by quality, freshness, availability, and demand.", contracts.CategoryProductivity},
	contracts.CollectionTrending:         {"Trending Apps", "Apps receiving the most recent non-failing download activity.", ""},
	contracts.CollectionNew:              {"New Apps", "Apps recently observed by iappstores for the first time.", ""},
	contracts.CollectionMostDownloaded:   {"Most Downloaded Apps", "Apps with the most recorded non-failing download attempts.", ""},
	contracts.CollectionIos26Compatible:  {"iOS 26 Compatible Apps", "Metadata-based listings whose stated minimum iOS version is 26.0 or earlier; compatibility is not device-tested.", ""},
}

func isValidCollectionSlug(slug string) bool {
	_, ok := collectionDefs[contracts.CollectionSlug(slug)]
	return ok
}

func metadataCompleteness(app contracts.AppDto) float64 {
	values := []interface{}{app.Description, app.IconURL, developerNameFirst(app), app.LatestVersion, app.VersionDate, app.MinOSVersion, nil, app.DownloadURL}
	if len(app.Screenshots) > 0 {
		values[6] = "yes"
	}
	count := 0
	for _, v := range values {
		if !isNilOrEmpty(v) {
			count++
		}
	}
	return float64(count) / float64(len(values))
}

// developerNameOf mirrors `app.appStore?.developerName ?? app.developerName` (AppStore
// metadata preferred), used by the recommendations "same-developer" section.
func developerNameOf(app contracts.AppDto) *string {
	if app.AppStore != nil && app.AppStore.DeveloperName != nil {
		return app.AppStore.DeveloperName
	}
	return app.DeveloperName
}

// developerNameFirst mirrors `app.developerName ?? app.appStore?.developerName`
// (raw repo metadata preferred), used by metadataCompleteness/similarity scoring.
func developerNameFirst(app contracts.AppDto) *string {
	if app.DeveloperName != nil && *app.DeveloperName != "" {
		return app.DeveloperName
	}
	if app.AppStore != nil {
		return app.AppStore.DeveloperName
	}
	return nil
}

func isNilOrEmpty(v interface{}) bool {
	switch t := v.(type) {
	case nil:
		return true
	case *string:
		return t == nil || *t == ""
	case string:
		return t == ""
	}
	return false
}

func freshness(app contracts.AppDto, now int64) float64 {
	value := app.LastUpdatedAt
	if value == nil {
		value = app.VersionDate
	}
	if value == nil {
		return 0
	}
	ts, ok := normalizer.ParseLenientDateOK(*value)
	if !ok {
		return 0
	}
	year := float64(365 * 24 * 60 * 60 * 1000)
	f := 1 - float64(now-ts)/year
	if f < 0 {
		return 0
	}
	return f
}

func appIdentity(app contracts.AppDto) []string {
	out := []string{app.ID}
	if app.CanonicalID != nil {
		out = append(out, *app.CanonicalID)
	}
	if app.BundleIdentifier != nil {
		out = append(out, *app.BundleIdentifier, "bundle:"+strings.ToLower(*app.BundleIdentifier))
	}
	return out
}

func downloadCountFor(app contracts.AppDto, counts map[string]int) int {
	max := 0
	for _, id := range appIdentity(app) {
		if c, ok := counts[id]; ok && c > max {
			max = c
		}
	}
	return max
}

func qualityScore(app contracts.AppDto, counts map[string]int, maxDemand int, now int64) float64 {
	demand := 0.0
	if maxDemand > 0 {
		demand = float64(downloadCountFor(app, counts)) / float64(maxDemand)
	}
	availability := 0.0
	if app.DownloadURL != nil {
		availability = 1
	}
	return demand*0.35 + freshness(app, now)*0.25 + availability*0.2 + metadataCompleteness(app)*0.2
}

func (s *Server) buildCollection(slug contracts.CollectionSlug) contracts.CollectionResponse {
	def := collectionDefs[slug]
	apps := s.AppStore.EnrichAppsWithCachedAppStoreMetadata(s.allActiveApps(), appstore.Country())
	if def.category != "" {
		filtered := make([]contracts.AppDto, 0, len(apps))
		for _, app := range apps {
			if app.Category == def.category {
				filtered = append(filtered, app)
			}
		}
		apps = filtered
	}
	if slug == contracts.CollectionIos26Compatible {
		filtered := make([]contracts.AppDto, 0, len(apps))
		for _, app := range apps {
			if app.MinOSVersion == nil {
				continue
			}
			if v, err := strconv.ParseFloat(*app.MinOSVersion, 64); err == nil && v <= 26 {
				filtered = append(filtered, app)
			}
		}
		apps = filtered
	}

	now := time.Now().UnixMilli()
	lifetime := s.Analytics.ReadDownloadCounts(nil)
	weekAgo := now - 7*24*60*60*1000
	recent := s.Analytics.ReadDownloadCounts(&weekAgo)
	counts := lifetime
	if slug == contracts.CollectionTrending {
		counts = recent
	}

	maxDemand := 1
	for _, app := range apps {
		if c := downloadCountFor(app, counts); c > maxDemand {
			maxDemand = c
		}
	}

	sorted := make([]contracts.AppDto, len(apps))
	copy(sorted, apps)
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]
		switch slug {
		case contracts.CollectionNew:
			at, _ := firstSeenTimestamp(a)
			bt, _ := firstSeenTimestamp(b)
			return bt < at
		case contracts.CollectionMostDownloaded, contracts.CollectionTrending:
			ac, bc := downloadCountFor(a, counts), downloadCountFor(b, counts)
			if ac != bc {
				return ac > bc
			}
			return freshness(b, now) < freshness(a, now)
		default:
			return qualityScore(b, counts, maxDemand, now) < qualityScore(a, counts, maxDemand, now)
		}
	})

	methodology := def.description
	if strings.HasPrefix(string(slug), "best-") {
		methodology = "35% demand, 25% freshness, 20% download availability, and 20% metadata completeness."
	}

	limit := 60
	if len(sorted) < limit {
		limit = len(sorted)
	}

	return contracts.CollectionResponse{
		Slug:        slug,
		Title:       def.title,
		Description: def.description,
		Methodology: methodology,
		Apps:        sorted[:limit],
	}
}

func firstSeenTimestamp(app contracts.AppDto) (int64, bool) {
	if app.FirstSeenAt == nil {
		return 0, false
	}
	return normalizer.ParseLenientDateOK(*app.FirstSeenAt)
}

func (s *Server) getCachedCollection(slug contracts.CollectionSlug) contracts.CollectionResponse {
	s.collectionMu.Lock()
	if entry, ok := s.collectionCache[slug]; ok && entry.expiresAt.After(time.Now()) {
		s.collectionMu.Unlock()
		return entry.response
	}
	s.collectionMu.Unlock()

	response := s.buildCollection(slug)

	s.collectionMu.Lock()
	s.collectionCache[slug] = collectionCacheEntry{expiresAt: time.Now().Add(config.CollectionCacheTTL()), response: response}
	s.collectionMu.Unlock()

	return response
}

func (s *Server) handleCollection(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !isValidCollectionSlug(slug) {
		sendError(w, 404, "collection_not_found", "Unknown collection.", nil)
		return
	}
	writeJSON(w, 200, s.getCachedCollection(contracts.CollectionSlug(slug)))
}
