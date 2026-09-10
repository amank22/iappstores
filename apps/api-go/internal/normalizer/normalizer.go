// Package normalizer ports apps/api/src/normalizer.ts: turning raw AltStore-format JSON
// into AppDto values, categorizing them, and the shared filter/sort/group/paginate logic
// used by every browse/search route.
package normalizer

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/sources"
)

func versionTimestamp(version anyMap) int64 {
	if d := asString(version["date"]); d != nil {
		return parseLenientDate(*d)
	}
	return 0
}

// pickLatestVersion mirrors pickLatestVersion(): a stable sort descending by date, taking
// the first element (falls back to the first raw version if the sort somehow yields none).
func pickLatestVersion(app anyMap) anyMap {
	rawVersions, _ := app["versions"].([]interface{})
	versions := make([]anyMap, 0, len(rawVersions))
	for _, v := range rawVersions {
		if m, ok := isRecord(v); ok {
			versions = append(versions, m)
		}
	}
	if len(versions) == 0 {
		return nil
	}

	sorted := make([]anyMap, len(versions))
	copy(sorted, versions)
	sort.SliceStable(sorted, func(i, j int) bool {
		return versionTimestamp(sorted[j]) < versionTimestamp(sorted[i])
	})
	return sorted[0]
}

func appSearchText(app contracts.AppDto) string {
	parts := []string{app.Name}
	if app.BundleIdentifier != nil {
		parts = append(parts, *app.BundleIdentifier)
	}
	if app.DeveloperName != nil {
		parts = append(parts, *app.DeveloperName)
	}
	if app.Subtitle != nil {
		parts = append(parts, *app.Subtitle)
	}
	if app.Description != nil {
		parts = append(parts, *app.Description)
	}
	if app.LatestVersion != nil {
		parts = append(parts, *app.LatestVersion)
	}
	return strings.ToLower(strings.Join(parts, " "))
}

// NormalizeAltStoreRepo ports normalizeAltStoreRepo(): parses one AltStore-format repo
// JSON document into a flat []AppDto for the given source.
func NormalizeAltStoreRepo(repoJSON interface{}, source sources.SourceDefinition) []contracts.AppDto {
	root, ok := isRecord(repoJSON)
	if !ok {
		return []contracts.AppDto{}
	}
	rawApps, ok := root["apps"].([]interface{})
	if !ok {
		return []contracts.AppDto{}
	}

	out := []contracts.AppDto{}
	for _, rawApp := range rawApps {
		app, ok := isRecord(rawApp)
		if !ok {
			continue
		}
		namePtr := asString(app["name"])
		if namePtr == nil {
			continue
		}
		name := *namePtr

		latest := pickLatestVersion(app)
		bundleIdentifier := asString(app["bundleIdentifier"])
		bundleOrSlug := slugify(name)
		if bundleIdentifier != nil {
			bundleOrSlug = *bundleIdentifier
		}
		stableID := fmt.Sprintf("%s:%s", source.ID, bundleOrSlug)

		versions := []contracts.AppVersionBuild{}
		if rawVersions, ok := app["versions"].([]interface{}); ok {
			for _, rv := range rawVersions {
				v, ok := isRecord(rv)
				if !ok {
					continue
				}
				versionNumber := asString(v["version"])
				if versionNumber == nil {
					continue
				}
				versions = append(versions, contracts.AppVersionBuild{
					SourceID:     source.ID,
					SourceName:   source.Name,
					Version:      *versionNumber,
					ReleaseDate:  asString(v["date"]),
					Changelog:    asString(firstNonNil(v["localizedDescription"], v["description"])),
					DownloadURL:  asURL(firstNonNil(v["downloadURL"], v["downloadUrl"])),
					Size:         asNumber(v["size"]),
					MinOSVersion: asString(firstNonNil(v["minOSVersion"], v["minOsVersion"])),
					FirstSeenAt:  nil,
					LastSeenAt:   nil,
				})
			}
		}

		var latestVersion, versionDate, versionDescription, downloadURL, minOSVersion *string
		var size *int64
		if latest != nil {
			latestVersion = asString(latest["version"])
			versionDate = asString(latest["date"])
			versionDescription = asString(firstNonNil(latest["localizedDescription"], latest["description"]))
			downloadURL = asURL(firstNonNil(latest["downloadURL"], latest["downloadUrl"]))
			size = asNumber(latest["size"])
			minOSVersion = asString(firstNonNil(latest["minOSVersion"], latest["minOsVersion"]))
		}

		downloadOption := contracts.AppDownloadOption{
			SourceID:      source.ID,
			SourceName:    source.Name,
			LatestVersion: latestVersion,
			VersionDate:   versionDate,
			DownloadURL:   downloadURL,
			Size:          size,
			MinOSVersion:  minOSVersion,
		}

		canonicalID := stableID
		if bundleIdentifier != nil {
			canonicalID = strings.ToLower(*bundleIdentifier)
		}

		out = append(out, contracts.AppDto{
			ID:                 stableID,
			SourceID:           source.ID,
			SourceName:         source.Name,
			Name:               name,
			BundleIdentifier:   bundleIdentifier,
			DeveloperName:      asString(app["developerName"]),
			Subtitle:           asString(app["subtitle"]),
			Description:        asString(firstNonNil(app["localizedDescription"], app["description"])),
			Category:           categorizeApp(app),
			IconURL:            asURL(firstNonNil(app["iconURL"], app["iconUrl"])),
			AppStoreURL:        pickAppStoreURL(app),
			Screenshots:        asURLArray(app["screenshots"]),
			LatestVersion:      latestVersion,
			VersionDate:        versionDate,
			VersionDescription: versionDescription,
			DownloadURL:        downloadURL,
			Size:               size,
			MinOSVersion:       minOSVersion,
			DownloadOptions:    []contracts.AppDownloadOption{downloadOption},
			Versions:           versions,
			FirstSeenAt:        nil,
			LastSeenAt:         nil,
			MetadataUpdatedAt:  nil,
			LastUpdatedAt:      versionDate,
			CanonicalID:        &canonicalID,
			CanonicalStatus:    contracts.StatusActive,
		})
	}

	return out
}

// SearchApps ports searchApps(): every whitespace-separated lowercase term must appear
// as a substring somewhere in the joined searchable text.
func SearchApps(apps []contracts.AppDto, query string) []contracts.AppDto {
	terms := []string{}
	for _, t := range strings.Fields(strings.ToLower(query)) {
		terms = append(terms, t)
	}
	if len(terms) == 0 {
		return apps
	}

	out := []contracts.AppDto{}
	for _, app := range apps {
		text := appSearchText(app)
		matched := true
		for _, term := range terms {
			if !strings.Contains(text, term) {
				matched = false
				break
			}
		}
		if matched {
			out = append(out, app)
		}
	}
	return out
}

func appTimestamp(app contracts.AppDto) int64 {
	if app.VersionDate != nil {
		return parseLenientDate(*app.VersionDate)
	}
	return 0
}

func optionTimestamp(option contracts.AppDownloadOption) int64 {
	if option.VersionDate != nil {
		return parseLenientDate(*option.VersionDate)
	}
	return 0
}

var iosVersionRe = regexpMustCompileIosVersion()

func parseIosVersion(version *string) []int {
	if version == nil {
		return nil
	}
	match := iosVersionRe.FindString(*version)
	if match == "" {
		return nil
	}
	parts := strings.Split(match, ".")
	out := make([]int, len(parts))
	for i, p := range parts {
		n, _ := strconv.Atoi(p)
		out[i] = n
	}
	return out
}

func compareIosVersions(left, right []int) int {
	length := 3
	if len(left) > length {
		length = len(left)
	}
	if len(right) > length {
		length = len(right)
	}
	for i := 0; i < length; i++ {
		l, r := 0, 0
		if i < len(left) {
			l = left[i]
		}
		if i < len(right) {
			r = right[i]
		}
		if l != r {
			return l - r
		}
	}
	return 0
}

func matchesIosVersion(app contracts.AppDto, iosVersion string, operator contracts.IosVersionOperator) bool {
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

// FilterAppsByCategory ports filterAppsByCategory().
func FilterAppsByCategory(apps []contracts.AppDto, category contracts.AppCategory) []contracts.AppDto {
	if category == contracts.CategoryAll {
		return apps
	}
	if category == contracts.CategoryRecent {
		out := make([]contracts.AppDto, len(apps))
		copy(out, apps)
		sort.SliceStable(out, func(i, j int) bool {
			return appTimestamp(out[j]) < appTimestamp(out[i])
		})
		return out
	}
	out := []contracts.AppDto{}
	for _, app := range apps {
		if app.Category == category {
			out = append(out, app)
		}
	}
	return out
}

// FilterAppsByIosVersion ports filterAppsByIosVersion().
func FilterAppsByIosVersion(apps []contracts.AppDto, iosVersion *string, operator contracts.IosVersionOperator) []contracts.AppDto {
	if iosVersion == nil {
		return apps
	}
	out := []contracts.AppDto{}
	for _, app := range apps {
		if matchesIosVersion(app, *iosVersion, operator) {
			out = append(out, app)
		}
	}
	return out
}

func appGroupKey(app contracts.AppDto) string {
	if app.BundleIdentifier != nil {
		return "bundle:" + strings.ToLower(*app.BundleIdentifier)
	}
	return "app:" + app.ID
}

// sortDownloadOptions ports sortDownloadOptions(): options with a download URL first,
// then by descending version date, then by (locale, default-strength) source name.
func sortDownloadOptions(options []contracts.AppDownloadOption) []contracts.AppDownloadOption {
	out := make([]contracts.AppDownloadOption, len(options))
	copy(out, options)
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		aHas, bHas := a.DownloadURL != nil, b.DownloadURL != nil
		if aHas != bHas {
			return aHas
		}
		dateDiff := optionTimestamp(b) - optionTimestamp(a)
		if dateDiff != 0 {
			return dateDiff < 0
		}
		return DefaultCompare(a.SourceName, b.SourceName) < 0
	})
	return out
}

func dedupeDownloadOptions(options []contracts.AppDownloadOption) []contracts.AppDownloadOption {
	sorted := sortDownloadOptions(options)
	seen := map[string]bool{}
	out := []contracts.AppDownloadOption{}
	for _, o := range sorted {
		key := strings.Join([]string{o.SourceID, derefStr(o.DownloadURL), derefStr(o.LatestVersion)}, "|")
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, o)
	}
	return out
}

func dedupeVersions(versions []contracts.AppVersionBuild) []contracts.AppVersionBuild {
	sorted := make([]contracts.AppVersionBuild, len(versions))
	copy(sorted, versions)
	sort.SliceStable(sorted, func(i, j int) bool {
		ti := int64(0)
		if sorted[i].ReleaseDate != nil {
			ti = parseLenientDate(*sorted[i].ReleaseDate)
		}
		tj := int64(0)
		if sorted[j].ReleaseDate != nil {
			tj = parseLenientDate(*sorted[j].ReleaseDate)
		}
		return tj < ti
	})
	seen := map[string]bool{}
	out := []contracts.AppVersionBuild{}
	for _, v := range sorted {
		key := strings.Join([]string{strings.ToLower(v.Version), v.SourceID, derefStr(v.DownloadURL)}, "|")
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, v)
	}
	return out
}

// sortGroupedApps ports sortGroupedApps(): descending version-date, then default
// (locale, non-base) name compare.
func sortGroupedApps(apps []contracts.AppDto) []contracts.AppDto {
	out := make([]contracts.AppDto, len(apps))
	copy(out, apps)
	sort.SliceStable(out, func(i, j int) bool {
		dateDiff := appTimestamp(out[j]) - appTimestamp(out[i])
		if dateDiff != 0 {
			return dateDiff < 0
		}
		return DefaultCompare(out[i].Name, out[j].Name) < 0
	})
	return out
}

// SortApps ports sortApps(): base-sensitivity locale compare for name-asc/name-desc
// (case/accent-insensitive, like localeCompare(..., {sensitivity: "base"})), tie-broken
// by a plain (default-strength) id compare; otherwise falls back to sortGroupedApps.
func SortApps(apps []contracts.AppDto, sortOrder contracts.AppSort) []contracts.AppDto {
	if sortOrder == contracts.SortNameAsc || sortOrder == contracts.SortNameDesc {
		out := make([]contracts.AppDto, len(apps))
		copy(out, apps)
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
	return sortGroupedApps(apps)
}

// GroupAppsByBundleId ports groupAppsByBundleId() line for line: apps sharing a bundle
// identifier (or, lacking one, sharing an id) are merged into a single representative
// AppDto with deduplicated/merged download options and version history.
func GroupAppsByBundleId(apps []contracts.AppDto) []contracts.AppDto {
	order := []string{}
	groups := map[string][]contracts.AppDto{}
	for _, app := range apps {
		key := appGroupKey(app)
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], app)
	}

	merged := make([]contracts.AppDto, 0, len(order))
	for _, key := range order {
		group := groups[key]
		sortedGroup := sortGroupedApps(group)
		representative := sortedGroup[0]

		allOptions := []contracts.AppDownloadOption{}
		allVersions := []contracts.AppVersionBuild{}
		for _, app := range group {
			allOptions = append(allOptions, app.DownloadOptions...)
			allVersions = append(allVersions, app.Versions...)
		}
		downloadOptions := dedupeDownloadOptions(allOptions)
		versions := dedupeVersions(allVersions)

		var preferred *contracts.AppDownloadOption
		if len(downloadOptions) > 0 {
			preferred = &downloadOptions[0]
		}

		canonicalID := representative.ID
		if representative.BundleIdentifier != nil {
			canonicalID = strings.ToLower(*representative.BundleIdentifier)
		}

		next := representative
		if len(downloadOptions) == 1 {
			next.SourceID = representative.SourceID
			next.SourceName = representative.SourceName
		} else {
			next.SourceID = "multiple"
			next.SourceName = fmt.Sprintf("%d sources", len(downloadOptions))
		}
		if preferred != nil {
			if preferred.LatestVersion != nil {
				next.LatestVersion = preferred.LatestVersion
			}
			if preferred.VersionDate != nil {
				next.VersionDate = preferred.VersionDate
			}
			if preferred.DownloadURL != nil {
				next.DownloadURL = preferred.DownloadURL
			}
			if preferred.Size != nil {
				next.Size = preferred.Size
			}
			if preferred.MinOSVersion != nil {
				next.MinOSVersion = preferred.MinOSVersion
			}
		}
		next.ID = representative.ID
		if representative.BundleIdentifier != nil {
			next.ID = "bundle:" + strings.ToLower(*representative.BundleIdentifier)
		}

		appStoreURL := representative.AppStoreURL
		if appStoreURL == nil {
			for _, app := range group {
				if app.AppStoreURL != nil {
					appStoreURL = app.AppStoreURL
					break
				}
			}
		}
		next.AppStoreURL = appStoreURL
		next.DownloadOptions = downloadOptions
		next.Versions = versions
		next.CanonicalID = &canonicalID

		firstSeen := sortedNonNilStrings(group, func(a contracts.AppDto) *string { return a.FirstSeenAt })
		lastSeen := sortedNonNilStrings(group, func(a contracts.AppDto) *string { return a.LastSeenAt })
		metadataUpdated := sortedNonNilStrings(group, func(a contracts.AppDto) *string { return a.MetadataUpdatedAt })

		if len(firstSeen) > 0 {
			next.FirstSeenAt = &firstSeen[0]
		} else {
			next.FirstSeenAt = nil
		}
		if len(lastSeen) > 0 {
			v := lastSeen[len(lastSeen)-1]
			next.LastSeenAt = &v
		} else {
			next.LastSeenAt = nil
		}
		if len(metadataUpdated) > 0 {
			v := metadataUpdated[len(metadataUpdated)-1]
			next.MetadataUpdatedAt = &v
		} else {
			next.MetadataUpdatedAt = nil
		}

		if preferred != nil && preferred.VersionDate != nil {
			next.LastUpdatedAt = preferred.VersionDate
		} else if len(metadataUpdated) > 0 {
			v := metadataUpdated[len(metadataUpdated)-1]
			next.LastUpdatedAt = &v
		} else {
			next.LastUpdatedAt = nil
		}

		merged = append(merged, next)
	}

	return sortGroupedApps(merged)
}

// sortedNonNilStrings collects the non-nil values of `pick` across group, sorted
// ascending as plain strings (matching JS `.filter(Boolean).sort()` on ISO date strings,
// which sort correctly lexicographically).
func sortedNonNilStrings(group []contracts.AppDto, pick func(contracts.AppDto) *string) []string {
	out := []string{}
	for _, app := range group {
		if v := pick(app); v != nil && *v != "" {
			out = append(out, *v)
		}
	}
	sort.Strings(out)
	return out
}

type categoryDef struct {
	id   contracts.AppCategory
	name string
}

var categoryDefs = []categoryDef{
	{contracts.CategoryAll, "All apps"},
	{contracts.CategoryRecent, "Recently updated"},
	{contracts.CategoryGames, "Games"},
	{contracts.CategoryEmulators, "Emulators"},
	{contracts.CategoryTools, "Tools"},
	{contracts.CategoryProductivity, "Productivity"},
	{contracts.CategoryUtilities, "Utilities"},
	{contracts.CategoryMedia, "Media"},
	{contracts.CategoryMusic, "Music"},
	{contracts.CategoryPhotoVideo, "Photo & Video"},
	{contracts.CategorySocial, "Social"},
	{contracts.CategoryEducation, "Education"},
	{contracts.CategoryBooks, "Books"},
	{contracts.CategoryDeveloper, "Developer"},
	{contracts.CategoryLifestyle, "Lifestyle"},
}

// GetCategoryFacets ports getCategoryFacets(): appCount per category is the number of
// *grouped* (deduped-by-bundle-id) apps, matching the JS implementation exactly.
func GetCategoryFacets(apps []contracts.AppDto) []contracts.AppCategoryFacet {
	out := make([]contracts.AppCategoryFacet, 0, len(categoryDefs))
	for _, def := range categoryDefs {
		filtered := FilterAppsByCategory(apps, def.id)
		grouped := GroupAppsByBundleId(filtered)
		out = append(out, contracts.AppCategoryFacet{ID: def.id, Name: def.name, AppCount: len(grouped)})
	}
	return out
}

// PaginateApps ports paginateApps().
func PaginateApps(apps []contracts.AppDto, page, pageSize int) ([]contracts.AppDto, contracts.Pagination) {
	totalItems := len(apps)
	totalPages := 0
	if totalItems > 0 {
		totalPages = (totalItems + pageSize - 1) / pageSize
	}
	resolvedPage := page
	maxPage := totalPages
	if maxPage < 1 {
		maxPage = 1
	}
	if resolvedPage > maxPage {
		resolvedPage = maxPage
	}
	start := (resolvedPage - 1) * pageSize
	end := start + pageSize
	if start > totalItems {
		start = totalItems
	}
	if end > totalItems {
		end = totalItems
	}
	pagedApps := apps[start:end]

	return pagedApps, contracts.Pagination{
		Page:            resolvedPage,
		PageSize:        pageSize,
		TotalItems:      totalItems,
		TotalPages:      totalPages,
		HasNextPage:     resolvedPage < totalPages,
		HasPreviousPage: resolvedPage > 1,
	}
}
