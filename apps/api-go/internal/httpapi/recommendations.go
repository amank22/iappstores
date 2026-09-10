package httpapi

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/contracts"
)

var nonWordRe = regexp.MustCompile(`[^a-z0-9]+`)

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

func similarity(a, b contracts.AppDto) float64 {
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

func matchesAnyIdentity(app contracts.AppDto, appID string) bool {
	lowered := strings.ToLower(appID)
	for _, id := range appIdentity(app) {
		if strings.ToLower(id) == lowered {
			return true
		}
	}
	return false
}

func (s *Server) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("appId")
	apps := s.AppStore.EnrichAppsWithCachedAppStoreMetadata(s.allActiveApps(), appstore.Country())

	var target *contracts.AppDto
	for i := range apps {
		if matchesAnyIdentity(apps[i], appID) {
			target = &apps[i]
			break
		}
	}
	if target == nil {
		sendError(w, 404, "app_not_found", "Unknown app.", nil)
		return
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
		return similarity(*target, ranked[j]) < similarity(*target, ranked[i])
	})

	developer := developerNameOf(*target)

	sourceIDs := map[string]bool{}
	for _, opt := range target.DownloadOptions {
		sourceIDs[opt.SourceID] = true
	}

	since := time.Now().Add(-90 * 24 * time.Hour).UnixMilli()
	coIDs := s.Analytics.ReadAlsoDownloaded(target.ID, since, 12)
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

	related := filterByCategory(ranked, target.Category, 6)
	similar := limitSlice(ranked, 6)
	alsoDownloaded := coDownloaded
	if len(alsoDownloaded) < 3 {
		alsoDownloaded = limitSlice(ranked, 6)
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

	writeJSON(w, 200, contracts.RecommendationsResponse{Sections: []contracts.RecommendationSection{
		{ID: "related", Title: "Related Apps", Apps: nonNilApps(related)},
		{ID: "similar", Title: "Similar Apps", Apps: nonNilApps(similar)},
		{ID: "also-downloaded", Title: "Users also downloaded", Apps: nonNilApps(alsoDownloaded)},
		{ID: "same-developer", Title: "More from the same developer", Apps: nonNilApps(sameDeveloper)},
		{ID: "same-repository", Title: "More from the same repository", Apps: nonNilApps(sameRepository)},
	}})
}

func filterByCategory(apps []contracts.AppDto, category contracts.AppCategory, limit int) []contracts.AppDto {
	out := []contracts.AppDto{}
	for _, app := range apps {
		if app.Category == category {
			out = append(out, app)
			if len(out) >= limit {
				break
			}
		}
	}
	return out
}

func limitSlice(apps []contracts.AppDto, limit int) []contracts.AppDto {
	if len(apps) <= limit {
		return apps
	}
	return apps[:limit]
}

func nonNilApps(apps []contracts.AppDto) []contracts.AppDto {
	if apps == nil {
		return []contracts.AppDto{}
	}
	return apps
}
