// Package httpapi implements the HTTP surface ported from apps/api/src/index.ts: every
// route except POST /api/translate (dropped per the migration plan), using the stdlib
// net/http ServeMux (Go 1.22+ method+path patterns) rather than a third-party router.
package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/catalog"
	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/downloads"
	"github.com/iappstores/api-go/internal/normalizer"
	"github.com/iappstores/api-go/internal/repo"
	"github.com/iappstores/api-go/internal/sources"
)

// catalogSearchCandidateCap bounds how many FTS5 matches SearchCatalogIds retrieves before
// category/iosVersion filtering and pagination happen in Go (consistent with every other
// browse/search path, none of which push those filters into SQL). It's a safety valve for
// pathologically broad queries, not the real pagination mechanism -- id+rank rows are cheap,
// so this only needs to be comfortably larger than any realistic result page times a filter
// pass, not tuned to a specific page size. A query matching more than this many apps will
// under-report its true total in Pagination, which is an acceptable, clearly-bounded
// tradeoff against holding the entire catalog_search table in every search response.
const catalogSearchCandidateCap = 2000

type Server struct {
	Catalog   *catalog.Store
	Repo      *repo.Client
	AppStore  *appstore.Client
	Analytics *downloads.AnalyticsStore
	Sources   []sources.SourceDefinition
	HTTP      *http.Client

	collectionMu    sync.Mutex
	collectionCache map[contracts.CollectionSlug]collectionCacheEntry
}

type collectionCacheEntry struct {
	expiresAt time.Time
	response  contracts.CollectionResponse
}

func NewServer(catalogStore *catalog.Store, repoClient *repo.Client, appStoreClient *appstore.Client, analytics *downloads.AnalyticsStore, allSources []sources.SourceDefinition) *Server {
	return &Server{
		Catalog:         catalogStore,
		Repo:            repoClient,
		AppStore:        appStoreClient,
		Analytics:       analytics,
		Sources:         allSources,
		HTTP:            &http.Client{Timeout: 5 * time.Second},
		collectionCache: map[contracts.CollectionSlug]collectionCacheEntry{},
	}
}

// Routes builds the full mux, wired with the CORS / X-Robots-Tag / panic-recovery
// middleware chain that used to be Express `app.use()` calls.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.handleHealth)

	mux.HandleFunc("GET /api/sources", s.handleSources)
	mux.HandleFunc("GET /api/developers", s.handleDevelopers)
	mux.HandleFunc("GET /api/developers/{developerSlug}/apps", s.handleDeveloperApps)
	mux.HandleFunc("GET /api/download", s.handleDownload)
	mux.HandleFunc("GET /api/downloads/stats", s.handleDownloadStats)
	mux.HandleFunc("GET /api/sitemap/apps", s.handleSitemapApps)
	mux.HandleFunc("GET /api/updates", s.handleUpdates)
	mux.HandleFunc("GET /api/updates/archives", s.handleUpdateArchives)
	mux.HandleFunc("GET /api/collections/{slug}", s.handleCollection)
	mux.HandleFunc("GET /api/apps/{appId}/recommendations", s.handleRecommendations)
	mux.HandleFunc("GET /api/apps/{appId}/versions", s.handleAppVersions)
	mux.HandleFunc("GET /api/apps/{appId}/versions/{version}", s.handleAppVersion)
	mux.HandleFunc("GET /api/apps/{appId}/status", s.handleAppStatus)
	mux.HandleFunc("GET /api/apps/{appId}", s.handleAppByID)
	mux.HandleFunc("GET /api/apps", s.handleApps)
	mux.HandleFunc("GET /api/sources/{sourceId}/apps", s.handleSourceApps)
	mux.HandleFunc("GET /api/search", s.handleSearch)

	return s.withMiddleware(mux)
}

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return recoverMiddleware(corsMiddleware(robotsTagMiddleware(next)))
}

func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic handling %s %s: %v", r.Method, r.URL.Path, rec)
				sendError(w, 500, "internal_error", "Internal server error.", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	origin := config.CORSOrigin()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func robotsTagMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") {
			w.Header().Set("X-Robots-Tag", "noindex, follow")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]interface{}{"ok": true, "service": "iappstores-api"})
}

func (s *Server) handleSources(w http.ResponseWriter, r *http.Request) {
	dtos := make([]contracts.SourceDto, 0, len(s.Sources))
	for _, src := range s.Sources {
		dtos = append(dtos, sources.ToDto(src, nil))
	}
	writeJSON(w, 200, contracts.SourcesResponse{Sources: dtos})
}

func (s *Server) handleDevelopers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, contracts.DevelopersResponse{Developers: s.Catalog.ListDevelopers()})
}

func sessionHash(sessionID *string) *string {
	secret := config.AnalyticsSessionSecret()
	if secret == "" || sessionID == nil || len(*sessionID) < 16 || len(*sessionID) > 128 {
		return nil
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(*sessionID))
	h := hex.EncodeToString(mac.Sum(nil))
	return &h
}

// allActiveApps loads the current active catalog as a fresh slice for this single
// request only -- unlike catalogMaterializer.ts, nothing here is retained across
// requests: it's built, used to answer one page/facet/search computation via the same
// ported normalizer logic as before, and then dropped for GC. Catalog rows already store
// one entry per bundle-deduped canonical app (see catalog.Store.rebuildCanonical), so this
// slice is already in "grouped" form and doesn't need groupAppsByBundleId re-applied.
func (s *Server) allActiveApps() []contracts.AppDto {
	return s.Catalog.ListAllActiveApps("")
}

func (s *Server) attachAppStoreMetadata(apps []contracts.AppDto, include bool) []contracts.AppDto {
	if !include {
		return apps
	}
	return s.AppStore.EnrichAppsWithCachedAppStoreMetadata(apps, appstore.Country())
}

func (s *Server) handleApps(w http.ResponseWriter, r *http.Request) {
	q, err := parseBrowseQuery(r.URL.Query())
	if err != nil {
		sendError(w, 400, "invalid_apps_query", "Apps query parameters are invalid.", errDetails(err))
		return
	}

	if q.SourceID != nil {
		src, ok := sources.FindSource(*q.SourceID)
		if !ok {
			sendError(w, 404, "source_not_found", `Unknown source "`+*q.SourceID+`".`, nil)
			return
		}
		allApps, err := s.Repo.GetSourceApps(r.Context(), src, config.RepoCacheTTL())
		if err != nil {
			sendError(w, 502, "apps_fetch_failed", "Could not fetch or parse source repositories.", errDetails(err))
			return
		}
		categorized := normalizer.FilterAppsByCategory(allApps, q.Category)
		filtered := normalizer.FilterAppsByIosVersion(categorized, q.IosVersion, q.IosVersionOperator)
		grouped := normalizer.GroupAppsByBundleId(filtered)
		sorted := normalizer.SortApps(grouped, q.Sort)
		paged, pagination := normalizer.PaginateApps(sorted, q.Page, q.PageSize)
		writeJSON(w, 200, contracts.AppListResponse{
			Apps:       s.attachAppStoreMetadata(paged, q.IncludeAppStore),
			Pagination: pagination,
			Categories: normalizer.GetCategoryFacets(allApps),
		})
		return
	}

	allApps := s.allActiveApps()
	categorized := normalizer.FilterAppsByCategory(allApps, q.Category)
	filtered := normalizer.FilterAppsByIosVersion(categorized, q.IosVersion, q.IosVersionOperator)
	sorted := normalizer.SortApps(filtered, q.Sort)
	paged, pagination := normalizer.PaginateApps(sorted, q.Page, q.PageSize)
	writeJSON(w, 200, contracts.AppListResponse{
		Apps:       s.attachAppStoreMetadata(paged, q.IncludeAppStore),
		Pagination: pagination,
		Categories: s.wholeCatalogCategoryFacets(),
	})
}

// wholeCatalogCategoryFacets computes category facets for the full unfiltered active
// catalog via the indexed SQL GROUP BY (catalog.Store.CountByCategory/TotalActive) instead
// of an in-memory pass over allActiveApps() -- the two are only equivalent for this exact
// "no source, no search query" case, since catalog_apps rows are already one-per-canonical-
// app (no grouping ambiguity) and category is an indexed column. Any filtered set (a single
// source's raw apps, or search results) still needs normalizer.GetCategoryFacets.
func (s *Server) wholeCatalogCategoryFacets() []contracts.AppCategoryFacet {
	return normalizer.BuildCategoryFacets(s.Catalog.CountByCategory(), s.Catalog.TotalActive())
}

func (s *Server) handleAppByID(w http.ResponseWriter, r *http.Request) {
	appID := strings.TrimSpace(r.PathValue("appId"))
	if appID == "" {
		sendError(w, 400, "invalid_app_id", "App id is required.", nil)
		return
	}

	app := s.Catalog.ReadCatalogApp(appID)
	if app == nil {
		sendError(w, 404, "app_not_found", `Unknown app "`+appID+`".`, nil)
		return
	}
	enriched := s.AppStore.EnrichAppsWithCachedAppStoreMetadata([]contracts.AppDto{*app}, appstore.Country())
	writeJSON(w, 200, contracts.AppResponse{App: enriched[0]})
}

func (s *Server) handleSourceApps(w http.ResponseWriter, r *http.Request) {
	sourceID := strings.TrimSpace(r.PathValue("sourceId"))
	if sourceID == "" {
		sendError(w, 400, "invalid_source_id", "Source id is required.", nil)
		return
	}
	q, err := parseBrowseQuery(r.URL.Query())
	if err != nil {
		sendError(w, 400, "invalid_apps_query", "Apps query parameters are invalid.", errDetails(err))
		return
	}
	src, ok := sources.FindSource(sourceID)
	if !ok {
		sendError(w, 404, "source_not_found", `Unknown source "`+sourceID+`".`, nil)
		return
	}

	allApps, err := s.Repo.GetSourceApps(r.Context(), src, config.RepoCacheTTL())
	if err != nil {
		sendError(w, 502, "source_fetch_failed", "Could not fetch or parse the source repository.", map[string]string{"sourceId": src.ID, "message": err.Error()})
		return
	}
	categorized := normalizer.FilterAppsByCategory(allApps, q.Category)
	filtered := normalizer.FilterAppsByIosVersion(categorized, q.IosVersion, q.IosVersionOperator)
	grouped := normalizer.GroupAppsByBundleId(filtered)
	sorted := normalizer.SortApps(grouped, q.Sort)
	paged, pagination := normalizer.PaginateApps(sorted, q.Page, q.PageSize)
	count := len(allApps)
	writeJSON(w, 200, contracts.AppsResponse{
		Source:     sources.ToDto(src, &count),
		Apps:       s.attachAppStoreMetadata(paged, q.IncludeAppStore),
		Pagination: pagination,
		Categories: normalizer.GetCategoryFacets(allApps),
	})
}

func (s *Server) handleDeveloperApps(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.PathValue("developerSlug"))
	if slug == "" {
		sendError(w, 400, "invalid_developer_slug", "Developer slug is required.", nil)
		return
	}
	q, err := parseBrowseQuery(r.URL.Query())
	if err != nil {
		sendError(w, 400, "invalid_apps_query", "Apps query parameters are invalid.", errDetails(err))
		return
	}

	developerApps, ok := s.Catalog.ListByDeveloperSlug(slug)
	if !ok {
		sendError(w, 404, "developer_not_found", `Unknown developer "`+slug+`".`, nil)
		return
	}

	categorized := normalizer.FilterAppsByCategory(developerApps, q.Category)
	filtered := normalizer.FilterAppsByIosVersion(categorized, q.IosVersion, q.IosVersionOperator)
	sorted := normalizer.SortApps(filtered, q.Sort)
	paged, pagination := normalizer.PaginateApps(sorted, q.Page, q.PageSize)
	writeJSON(w, 200, contracts.AppListResponse{
		Apps:       paged,
		Pagination: pagination,
		Categories: normalizer.GetCategoryFacets(developerApps),
	})
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q, err := parseSearchQuery(r.URL.Query())
	if err != nil {
		sendError(w, 400, "invalid_search_query", "Search query parameter q is required.", errDetails(err))
		return
	}

	if q.SourceID != nil {
		src, ok := sources.FindSource(*q.SourceID)
		if !ok {
			sendError(w, 404, "source_not_found", `Unknown source "`+*q.SourceID+`".`, nil)
			return
		}
		allApps, err := s.Repo.GetSourceApps(r.Context(), src, config.RepoCacheTTL())
		if err != nil {
			sendError(w, 502, "search_failed", "Could not search source repositories.", errDetails(err))
			return
		}
		matched := normalizer.SearchApps(allApps, q.Q)
		categorized := normalizer.FilterAppsByCategory(matched, q.Category)
		filtered := normalizer.FilterAppsByIosVersion(categorized, q.IosVersion, q.IosVersionOperator)
		grouped := normalizer.GroupAppsByBundleId(filtered)
		sorted := normalizer.SortApps(grouped, q.Sort)
		paged, pagination := normalizer.PaginateApps(sorted, q.Page, q.PageSize)
		writeJSON(w, 200, contracts.SearchResponse{
			Query:      q,
			Apps:       s.attachAppStoreMetadata(paged, q.IncludeAppStore),
			Pagination: pagination,
			Categories: normalizer.GetCategoryFacets(matched),
		})
		return
	}

	emptyQuery := strings.TrimSpace(q.Q) == ""
	var matched []contracts.AppDto
	if emptyQuery {
		matched = s.allActiveApps()
	} else if s.Catalog.IsSearchIndexAvailable() {
		ids := s.Catalog.SearchCatalogIds(q.Q, catalogSearchCandidateCap)
		matched = s.Catalog.ListByCanonicalIDs(ids)
	} else {
		matched = normalizer.SearchApps(s.allActiveApps(), q.Q)
	}

	categorized := normalizer.FilterAppsByCategory(matched, q.Category)
	filtered := normalizer.FilterAppsByIosVersion(categorized, q.IosVersion, q.IosVersionOperator)
	sorted := normalizer.SortApps(filtered, q.Sort)
	paged, pagination := normalizer.PaginateApps(sorted, q.Page, q.PageSize)

	// An empty query returns the whole active catalog unfiltered, so its facets are just
	// the whole-catalog facets -- reuse the indexed SQL path instead of an in-memory pass.
	var categories []contracts.AppCategoryFacet
	if emptyQuery {
		categories = s.wholeCatalogCategoryFacets()
	} else {
		categories = normalizer.GetCategoryFacets(matched)
	}
	writeJSON(w, 200, contracts.SearchResponse{
		Query:      q,
		Apps:       s.attachAppStoreMetadata(paged, q.IncludeAppStore),
		Pagination: pagination,
		Categories: categories,
	})
}

func (s *Server) handleAppVersions(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("appId")
	app := s.Catalog.ReadCatalogApp(appID)
	if app == nil {
		sendError(w, 404, "app_not_found", "Unknown app.", nil)
		return
	}
	writeJSON(w, 200, contracts.VersionsResponse{App: *app, Versions: s.Catalog.ReadAppVersions(appID)})
}

func (s *Server) handleAppVersion(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("appId")
	versionParam := r.PathValue("version")
	app := s.Catalog.ReadCatalogApp(appID)
	versions := s.Catalog.ReadAppVersions(appID)
	var found *contracts.AppVersion
	for i := range versions {
		if strings.EqualFold(versions[i].Version, versionParam) {
			found = &versions[i]
			break
		}
	}
	if app == nil || found == nil {
		sendError(w, 404, "version_not_found", "Unknown app version.", nil)
		return
	}
	writeJSON(w, 200, contracts.VersionResponse{App: *app, Version: *found})
}

func (s *Server) handleAppStatus(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("appId")
	writeJSON(w, 200, s.Catalog.ReadAppStatus(appID))
}

func (s *Server) handleSitemapApps(w http.ResponseWriter, r *http.Request) {
	apps := s.allActiveApps()
	out := make([]contracts.SitemapApp, 0, len(apps))
	for _, app := range apps {
		versionSet := map[string]bool{}
		var versionList []string
		for _, v := range app.Versions {
			if !versionSet[v.Version] {
				versionSet[v.Version] = true
				versionList = append(versionList, v.Version)
			}
		}
		if versionList == nil {
			versionList = []string{}
		}
		out = append(out, contracts.SitemapApp{
			ID:                app.ID,
			BundleIdentifier:  app.BundleIdentifier,
			VersionDate:       app.VersionDate,
			MetadataUpdatedAt: app.MetadataUpdatedAt,
			Versions:          versionList,
		})
	}
	writeJSON(w, 200, contracts.SitemapAppsResponse{Apps: out})
}

func paginationOf(page, pageSize, totalItems int) contracts.Pagination {
	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}
	return contracts.Pagination{
		Page: page, PageSize: pageSize, TotalItems: totalItems, TotalPages: totalPages,
		HasNextPage: page < totalPages, HasPreviousPage: page > 1,
	}
}

func parseBoundary(v *string) *int64 {
	if v == nil {
		return nil
	}
	if ms, ok := normalizer.ParseLenientDateOK(*v); ok {
		return &ms
	}
	return nil
}

func (s *Server) handleUpdates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, err := queryPositiveInt(q, "page", 1, 10_000)
	if err != nil {
		sendError(w, 400, "invalid_updates_query", "Update query parameters are invalid.", errDetails(err))
		return
	}
	pageSize, err := queryPositiveInt(q, "pageSize", 24, 100)
	if err != nil {
		sendError(w, 400, "invalid_updates_query", "Update query parameters are invalid.", errDetails(err))
		return
	}
	from := queryOptionalString(q, "from")
	to := queryOptionalString(q, "to")
	eventType := "all"
	if v := firstQueryValue(q, "type"); v != nil && strings.TrimSpace(*v) != "" {
		val := strings.TrimSpace(*v)
		if val != "all" && val != "new" && val != "version" {
			sendError(w, 400, "invalid_updates_query", "Update query parameters are invalid.", map[string]string{"message": "invalid type"})
			return
		}
		eventType = val
	}

	events := s.Catalog.ReadUpdateEvents(parseBoundary(from), parseBoundary(to), eventType, 20_000)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(events) {
		start = len(events)
	}
	if end > len(events) {
		end = len(events)
	}
	writeJSON(w, 200, contracts.UpdatesResponse{
		Events:     events[start:end],
		Pagination: paginationOf(page, pageSize, len(events)),
	})
}

func (s *Server) handleUpdateArchives(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.Catalog.ReadArchives())
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	appID, ok1 := queryString(q, "appId")
	sourceID, ok2 := queryString(q, "sourceId")
	if !ok1 || !ok2 {
		sendError(w, 400, "invalid_download_query", "Download query parameters are invalid.", nil)
		return
	}
	sessionID := queryOptionalString(q, "sessionId")

	app := s.Catalog.ReadCatalogApp(appID)
	if app == nil {
		sendError(w, 404, "app_not_found", `Unknown app "`+appID+`".`, nil)
		return
	}
	target, targetErr := downloads.ResolveDownloadTarget([]contracts.AppDto{*app}, appID, sourceID)
	if targetErr != nil {
		sendError(w, targetErr.Status, targetErr.Code, targetErr.Message, nil)
		return
	}

	probe := downloads.ProbeDownloadURL(r.Context(), s.HTTP, *target.Option.DownloadURL, 2500*time.Millisecond)

	appName := target.App.Name
	if target.App.AppStore != nil {
		appName = target.App.AppStore.Name
	}
	if err := s.Analytics.RecordDownloadAttempt(downloads.AnalyticsInput{
		AppID:            target.App.ID,
		BundleIdentifier: target.App.BundleIdentifier,
		AppName:          appName,
		SourceID:         target.Option.SourceID,
		SourceName:       target.Option.SourceName,
		DownloadURL:      *target.Option.DownloadURL,
		ProbeStatus:      downloads.ProbeStatus(probe.Status),
		ProbeStatusCode:  intPtrFrom(probe.StatusCode),
		ProbeError:       probe.Error,
		CreatedAt:        time.Now().UnixMilli(),
		SessionHash:      sessionHash(sessionID),
	}); err != nil {
		log.Printf("Could not record download analytics: %v", err)
	}

	decision := downloads.DecideDownloadRedirect(*target.Option.DownloadURL, probe)
	if !decision.ShouldRedirect {
		sendError(w, decision.Status, decision.Code, decision.Message, map[string]interface{}{
			"statusCode": decision.StatusCode, "error": decision.Error,
		})
		return
	}
	http.Redirect(w, r, decision.DownloadURL, http.StatusFound)
}

func intPtrFrom(v *int) *int {
	return v
}

func (s *Server) handleDownloadStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	statType := "popular"
	if v := firstQueryValue(q, "type"); v != nil && strings.TrimSpace(*v) != "" {
		val := strings.TrimSpace(*v)
		if val != "popular" && val != "problem-links" {
			sendError(w, 400, "invalid_download_stats_query", "Download stats query parameters are invalid.", nil)
			return
		}
		statType = val
	}
	limit, err := queryPositiveInt(q, "limit", 20, 100)
	if err != nil {
		sendError(w, 400, "invalid_download_stats_query", "Download stats query parameters are invalid.", errDetails(err))
		return
	}

	if statType == "popular" {
		writeJSON(w, 200, contracts.DownloadStatsResponse{Type: "popular", Items: s.Analytics.ReadPopularDownloadStats(limit)})
	} else {
		writeJSON(w, 200, contracts.DownloadStatsResponse{Type: "problem-links", Items: s.Analytics.ReadProblemDownloadLinkStats(limit)})
	}
}
