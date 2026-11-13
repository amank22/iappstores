package httpapi

import (
	"context"
	"fmt"
	"log"
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

// countsTTL is how long download counts are reused across collection builds. Counting
// scans every download event (hundreds of ms once the table has some history), so the
// seven collections share one scan instead of each doing their own.
const countsTTL = 5 * time.Minute

type countsEntry struct {
	counts  map[string]int
	expires time.Time
}

// downloadCounts returns non-failing download counts per app, lifetime or for the last
// seven days. The mutex is held while counting so concurrent builds wait for one scan
// instead of starting their own.
func (s *Server) downloadCounts(weekly bool, now time.Time) map[string]int {
	s.countsMu.Lock()
	defer s.countsMu.Unlock()

	entry := &s.lifetimeSeen
	if weekly {
		entry = &s.weeklySeen
	}
	if entry.counts != nil && entry.expires.After(now) {
		return entry.counts
	}
	var since *int64
	if weekly {
		weekAgo := now.UnixMilli() - 7*24*60*60*1000
		since = &weekAgo
	}
	*entry = countsEntry{counts: s.Analytics.ReadDownloadCounts(since), expires: now.Add(countsTTL)}
	return entry.counts
}

// ranked is an app with its sort keys, computed once. Computing them inside the sort
// comparator re-parsed dates and rescored metadata on every comparison (~n log n times).
type ranked struct {
	app     contracts.AppDto
	primary float64
	// secondary breaks ties for the download collections (freshness).
	secondary float64
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

	nowTime := time.Now()
	now := nowTime.UnixMilli()

	// Only the counts a collection actually ranks by are read: "new" ranks by first-seen
	// time, "trending" by the last week, everything else by lifetime counts.
	var counts map[string]int
	switch slug {
	case contracts.CollectionNew:
	case contracts.CollectionTrending:
		counts = s.downloadCounts(true, nowTime)
	default:
		counts = s.downloadCounts(false, nowTime)
	}

	maxDemand := 1
	for _, app := range apps {
		if c := downloadCountFor(app, counts); c > maxDemand {
			maxDemand = c
		}
	}

	items := make([]ranked, len(apps))
	for i, app := range apps {
		item := ranked{app: app}
		switch slug {
		case contracts.CollectionNew:
			ts, _ := firstSeenTimestamp(app)
			item.primary = float64(ts)
		case contracts.CollectionMostDownloaded, contracts.CollectionTrending:
			item.primary = float64(downloadCountFor(app, counts))
			item.secondary = freshness(app, now)
		default:
			item.primary = qualityScore(app, counts, maxDemand, now)
		}
		items[i] = item
	}
	// Highest first; the stable sort keeps catalog order between equals.
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].primary != items[j].primary {
			return items[i].primary > items[j].primary
		}
		return items[i].secondary > items[j].secondary
	})

	methodology := def.description
	if strings.HasPrefix(string(slug), "best-") {
		methodology = "35% demand, 25% freshness, 20% download availability, and 20% metadata completeness."
	}

	limit := 60
	if len(items) < limit {
		limit = len(items)
	}
	top := make([]contracts.AppDto, limit)
	for i := range top {
		top[i] = items[i].app
	}

	return contracts.CollectionResponse{
		Slug:        slug,
		Title:       def.title,
		Description: def.description,
		Methodology: methodology,
		Apps:        top,
	}
}

func firstSeenTimestamp(app contracts.AppDto) (int64, bool) {
	if app.FirstSeenAt == nil {
		return 0, false
	}
	return normalizer.ParseLenientDateOK(*app.FirstSeenAt)
}

// refreshCollection builds a collection and stores it. Builds for one slug run one at a
// time: concurrent callers share a single build, so the moment a cache entry expires
// can't turn into one catalog-wide rebuild per waiting request. A failed build (it
// shouldn't happen, but this also runs in goroutines no recover middleware covers)
// leaves the previous entry in place.
func (s *Server) refreshCollection(slug contracts.CollectionSlug) (contracts.CollectionResponse, bool) {
	v, _, _ := s.collectionFlight.Do(string(slug), func() (result interface{}, err error) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("collections: build of %s panicked: %v", slug, rec)
				result, err = nil, fmt.Errorf("build panicked")
			}
		}()
		s.collectionBuilds.Add(1)
		response := s.buildCollection(slug)
		s.collectionMu.Lock()
		s.collectionCache[slug] = collectionCacheEntry{expiresAt: time.Now().Add(config.CollectionCacheTTL()), response: response}
		s.collectionMu.Unlock()
		return response, nil
	})
	response, ok := v.(contracts.CollectionResponse)
	return response, ok
}

// getCachedCollection serves a collection from cache. An expired entry is still served,
// and refreshed in the background, so only the very first request for a slug (before
// the warmer has run) ever waits for a build.
func (s *Server) getCachedCollection(slug contracts.CollectionSlug) contracts.CollectionResponse {
	s.collectionMu.Lock()
	entry, ok := s.collectionCache[slug]
	s.collectionMu.Unlock()

	if ok {
		if !entry.expiresAt.After(time.Now()) {
			go s.refreshCollection(slug)
		}
		return entry.response
	}
	response, _ := s.refreshCollection(slug)
	return response
}

// RunCollectionWarmer builds every collection at startup and then again before each
// one expires, so visitors and crawlers always find them cached. Without it the first
// request after every expiry paid for a catalog-wide build.
func (s *Server) RunCollectionWarmer(ctx context.Context) {
	slugs := make([]contracts.CollectionSlug, 0, len(collectionDefs))
	for slug := range collectionDefs {
		slugs = append(slugs, slug)
	}
	sort.Slice(slugs, func(i, j int) bool { return slugs[i] < slugs[j] })

	// Let the first source refresh load the catalog before building from it.
	select {
	case <-ctx.Done():
		return
	case <-time.After(20 * time.Second):
	}
	for {
		for _, slug := range slugs {
			if ctx.Err() != nil {
				return
			}
			s.refreshCollection(slug)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(config.CollectionCacheTTL() / 2):
		}
	}
}

func (s *Server) handleCollection(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !isValidCollectionSlug(slug) {
		sendError(w, 404, "collection_not_found", "Unknown collection.", nil)
		return
	}
	writeJSON(w, 200, s.getCachedCollection(contracts.CollectionSlug(slug)))
}
