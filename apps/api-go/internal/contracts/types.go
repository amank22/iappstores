// Package contracts mirrors the wire format defined by packages/contracts/src/index.ts.
//
// Field-shape conventions (matching the zod schemas exactly):
//   - Nullable string/number/etc fields (zod `.nullable()`) are Go pointers (*string, *int)
//     so `null` marshals correctly, vs a Go zero value which would marshal to `""` or `0`.
//   - Fields with a zod `.default([])` or `.default(null)` are initialized to a non-nil
//     empty slice (never `nil`, which would marshal to JSON `null` rather than `[]`).
//   - Optional fields (zod `.optional()`, key can be entirely absent) use `omitempty` with
//     a pointer where the zero value is meaningful (e.g. SourceDto.AppCount).
package contracts

// AppCategory is the full category enum including the "all" and "recent" pseudo-categories.
type AppCategory string

const (
	CategoryAll          AppCategory = "all"
	CategoryRecent       AppCategory = "recent"
	CategoryGames        AppCategory = "games"
	CategoryEmulators    AppCategory = "emulators"
	CategoryTools        AppCategory = "tools"
	CategoryProductivity AppCategory = "productivity"
	CategoryUtilities    AppCategory = "utilities"
	CategoryMedia        AppCategory = "media"
	CategoryMusic        AppCategory = "music"
	CategoryPhotoVideo   AppCategory = "photo-video"
	CategorySocial       AppCategory = "social"
	CategoryEducation    AppCategory = "education"
	CategoryBooks        AppCategory = "books"
	CategoryDeveloper    AppCategory = "developer"
	CategoryLifestyle    AppCategory = "lifestyle"
)

var AllCategories = []AppCategory{
	CategoryAll, CategoryRecent, CategoryGames, CategoryEmulators, CategoryTools,
	CategoryProductivity, CategoryUtilities, CategoryMedia, CategoryMusic,
	CategoryPhotoVideo, CategorySocial, CategoryEducation, CategoryBooks,
	CategoryDeveloper, CategoryLifestyle,
}

// DerivedAppCategory is the subset an app can actually be categorized as (no "all"/"recent").
type DerivedAppCategory = AppCategory

var DerivedCategories = []AppCategory{
	CategoryGames, CategoryEmulators, CategoryTools, CategoryProductivity, CategoryUtilities,
	CategoryMedia, CategoryMusic, CategoryPhotoVideo, CategorySocial, CategoryEducation,
	CategoryBooks, CategoryDeveloper, CategoryLifestyle,
}

func IsValidCategory(c string) bool {
	for _, v := range AllCategories {
		if string(v) == c {
			return true
		}
	}
	return false
}

type IosVersionOperator string

const (
	IosOpLte IosVersionOperator = "lte"
	IosOpGte IosVersionOperator = "gte"
)

type AppSort string

const (
	SortRecent   AppSort = "recent"
	SortNameAsc  AppSort = "name-asc"
	SortNameDesc AppSort = "name-desc"
)

type CanonicalAppStatus string

const (
	StatusActive   CanonicalAppStatus = "active"
	StatusMissing  CanonicalAppStatus = "missing"
	StatusRemoved  CanonicalAppStatus = "removed"
	StatusRedirect CanonicalAppStatus = "redirect"
)

// SourceDto mirrors SourceDtoSchema. AppCount is optional (key absent unless requested).
type SourceDto struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Subtitle *string `json:"subtitle"`
	URL      string  `json:"url"`
	Website  *string `json:"website"`
	AppCount *int    `json:"appCount,omitempty"`
}

type DeveloperDto struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	AppCount    int      `json:"appCount"`
	Categories  []string `json:"categories"`
	SourceNames []string `json:"sourceNames"`
}

type AppDownloadOption struct {
	SourceID      string  `json:"sourceId"`
	SourceName    string  `json:"sourceName"`
	LatestVersion *string `json:"latestVersion"`
	VersionDate   *string `json:"versionDate"`
	DownloadURL   *string `json:"downloadURL"`
	Size          *int64  `json:"size"`
	MinOSVersion  *string `json:"minOSVersion"`
}

type AppVersionBuild struct {
	SourceID     string  `json:"sourceId"`
	SourceName   string  `json:"sourceName"`
	Version      string  `json:"version"`
	ReleaseDate  *string `json:"releaseDate"`
	Changelog    *string `json:"changelog"`
	DownloadURL  *string `json:"downloadURL"`
	Size         *int64  `json:"size"`
	MinOSVersion *string `json:"minOSVersion"`
	FirstSeenAt  *string `json:"firstSeenAt"`
	LastSeenAt   *string `json:"lastSeenAt"`
}

type AppVersion struct {
	Version           string            `json:"version"`
	ReleaseDate       *string           `json:"releaseDate"`
	Changelog         *string           `json:"changelog"`
	FirstSeenAt       *string           `json:"firstSeenAt"`
	MetadataUpdatedAt *string           `json:"metadataUpdatedAt"`
	Builds            []AppVersionBuild `json:"builds"`
}

type AppStoreMetadata struct {
	Country                   string   `json:"country"`
	BundleID                  string   `json:"bundleId"`
	TrackID                   int64    `json:"trackId"`
	TrackViewURL              string   `json:"trackViewUrl"`
	Name                      string   `json:"name"`
	DeveloperName             *string  `json:"developerName"`
	Description               *string  `json:"description"`
	ArtworkURL60              *string  `json:"artworkUrl60"`
	ArtworkURL100             *string  `json:"artworkUrl100"`
	ArtworkURL512             *string  `json:"artworkUrl512"`
	ScreenshotUrls            []string `json:"screenshotUrls"`
	IpadScreenshotUrls        []string `json:"ipadScreenshotUrls"`
	Genres                    []string `json:"genres"`
	PrimaryGenreName          *string  `json:"primaryGenreName"`
	AverageUserRating         *float64 `json:"averageUserRating"`
	UserRatingCount           *int64   `json:"userRatingCount"`
	FormattedPrice            *string  `json:"formattedPrice"`
	Price                     *float64 `json:"price"`
	Version                   *string  `json:"version"`
	MinimumOsVersion          *string  `json:"minimumOsVersion"`
	ReleaseNotes              *string  `json:"releaseNotes"`
	CurrentVersionReleaseDate *string  `json:"currentVersionReleaseDate"`
	ContentAdvisoryRating     *string  `json:"contentAdvisoryRating"`
	FetchedAt                 int64    `json:"fetchedAt"`
}

// AppDto mirrors AppDtoSchema. Slices default to [] (never null); AppStore is
// optional+nullable (key can be absent OR present-with-null OR present-with-value),
// modeled with a double pointer isn't necessary since JS never sends the key absent from
// this side (the API always sets it, possibly to nil) -- so we mark it `omitempty` to also
// support routes (e.g. developer apps) that omit AppStore entirely (matching JS behavior
// where enrichAppsWithCachedAppStoreMetadata is not called for that route).
type AppDto struct {
	ID                 string              `json:"id"`
	SourceID           string              `json:"sourceId"`
	SourceName         string              `json:"sourceName"`
	Name               string              `json:"name"`
	BundleIdentifier   *string             `json:"bundleIdentifier"`
	DeveloperName      *string             `json:"developerName"`
	Subtitle           *string             `json:"subtitle"`
	Description        *string             `json:"description"`
	Category           DerivedAppCategory  `json:"category"`
	IconURL            *string             `json:"iconUrl"`
	AppStoreURL        *string             `json:"appStoreUrl"`
	Screenshots        []string            `json:"screenshots"`
	LatestVersion      *string             `json:"latestVersion"`
	VersionDate        *string             `json:"versionDate"`
	VersionDescription *string             `json:"versionDescription"`
	DownloadURL        *string             `json:"downloadURL"`
	Size               *int64              `json:"size"`
	MinOSVersion       *string             `json:"minOSVersion"`
	DownloadOptions    []AppDownloadOption `json:"downloadOptions"`
	Versions           []AppVersionBuild   `json:"versions"`
	FirstSeenAt        *string             `json:"firstSeenAt"`
	LastSeenAt         *string             `json:"lastSeenAt"`
	MetadataUpdatedAt  *string             `json:"metadataUpdatedAt"`
	LastUpdatedAt      *string             `json:"lastUpdatedAt"`
	CanonicalID        *string             `json:"canonicalId"`
	CanonicalStatus    CanonicalAppStatus  `json:"canonicalStatus"`
	AppStore           *AppStoreMetadata   `json:"appStore,omitempty"`
}

// Clone returns a shallow-ish copy sufficient for safe field mutation (category
// reassignment, grouping, decoration) without aliasing slices/pointers the caller
// still holds a reference to for reads. Slices are not deep copied since normalizer
// logic always reassigns whole new slices rather than mutating in place.
func (a AppDto) Clone() AppDto {
	return a
}

type Pagination struct {
	Page            int  `json:"page"`
	PageSize        int  `json:"pageSize"`
	TotalItems      int  `json:"totalItems"`
	TotalPages      int  `json:"totalPages"`
	HasNextPage     bool `json:"hasNextPage"`
	HasPreviousPage bool `json:"hasPreviousPage"`
}

type AppCategoryFacet struct {
	ID       AppCategory `json:"id"`
	Name     string      `json:"name"`
	AppCount int         `json:"appCount"`
}

type SitemapApp struct {
	ID                string   `json:"id"`
	BundleIdentifier  *string  `json:"bundleIdentifier"`
	VersionDate       *string  `json:"versionDate"`
	MetadataUpdatedAt *string  `json:"metadataUpdatedAt"`
	Versions          []string `json:"versions"`
}

type UpdateEvent struct {
	ID         string  `json:"id"`
	Type       string  `json:"type"` // "new" | "version"
	OccurredAt string  `json:"occurredAt"`
	App        AppDto  `json:"app"`
	Version    *string `json:"version"`
	Title      string  `json:"title"`
	Summary    *string `json:"summary"`
}

type ArchiveSummary struct {
	Kind       string `json:"kind"` // "week" | "month"
	Key        string `json:"key"`
	From       string `json:"from"`
	To         string `json:"to"`
	EventCount int    `json:"eventCount"`
}

type UpdatesResponse struct {
	Events     []UpdateEvent `json:"events"`
	Pagination Pagination    `json:"pagination"`
}

type ArchivesResponse struct {
	Weeks  []ArchiveSummary `json:"weeks"`
	Months []ArchiveSummary `json:"months"`
}

type VersionsResponse struct {
	App      AppDto       `json:"app"`
	Versions []AppVersion `json:"versions"`
}

type VersionResponse struct {
	App     AppDto     `json:"app"`
	Version AppVersion `json:"version"`
}

type RecommendationSection struct {
	ID    string   `json:"id"`
	Title string   `json:"title"`
	Apps  []AppDto `json:"apps"`
}

type RecommendationsResponse struct {
	Sections []RecommendationSection `json:"sections"`
}

type CollectionSlug string

const (
	CollectionBestEmulator     CollectionSlug = "best-emulator-apps"
	CollectionBestMusic        CollectionSlug = "best-music-apps"
	CollectionBestProductivity CollectionSlug = "best-productivity-apps"
	CollectionTrending         CollectionSlug = "trending-apps"
	CollectionNew              CollectionSlug = "new-apps"
	CollectionMostDownloaded   CollectionSlug = "most-downloaded"
	CollectionIos26Compatible  CollectionSlug = "ios-26-compatible"
)

var AllCollectionSlugs = []CollectionSlug{
	CollectionBestEmulator, CollectionBestMusic, CollectionBestProductivity,
	CollectionTrending, CollectionNew, CollectionMostDownloaded, CollectionIos26Compatible,
}

type CollectionResponse struct {
	Slug        CollectionSlug `json:"slug"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Methodology string         `json:"methodology"`
	Apps        []AppDto       `json:"apps"`
}

type AppStatusResponse struct {
	Status        CanonicalAppStatus `json:"status"`
	RequestedID   string             `json:"requestedId"`
	CanonicalID   *string            `json:"canonicalId"`
	ReplacementID *string            `json:"replacementId"`
	App           *AppDto            `json:"app"`
	MissingSince  *string            `json:"missingSince"`
	RemovedAt     *string            `json:"removedAt"`
}

type SourcesResponse struct {
	Sources []SourceDto `json:"sources"`
}

type DevelopersResponse struct {
	Developers []DeveloperDto `json:"developers"`
}

type AppsResponse struct {
	Source     SourceDto          `json:"source"`
	Apps       []AppDto           `json:"apps"`
	Pagination Pagination         `json:"pagination"`
	Categories []AppCategoryFacet `json:"categories"`
}

type AppListResponse struct {
	Apps       []AppDto           `json:"apps"`
	Pagination Pagination         `json:"pagination"`
	Categories []AppCategoryFacet `json:"categories"`
}

type AppResponse struct {
	App AppDto `json:"app"`
}

type SearchResponse struct {
	Query      SearchAppsQuery    `json:"query"`
	Apps       []AppDto           `json:"apps"`
	Pagination Pagination         `json:"pagination"`
	Categories []AppCategoryFacet `json:"categories"`
}

type SitemapAppsResponse struct {
	Apps []SitemapApp `json:"apps"`
}

type PopularDownloadStatsItem struct {
	AppID            string  `json:"appId"`
	BundleIdentifier *string `json:"bundleIdentifier"`
	AppName          string  `json:"appName"`
	DownloadCount    int64   `json:"downloadCount"`
	LastDownloadedAt *int64  `json:"lastDownloadedAt"`
}

type ProblemDownloadLinkStatsItem struct {
	AppID            string  `json:"appId"`
	BundleIdentifier *string `json:"bundleIdentifier"`
	AppName          string  `json:"appName"`
	SourceID         string  `json:"sourceId"`
	SourceName       string  `json:"sourceName"`
	DownloadURL      string  `json:"downloadURL"`
	FailureCount     int64   `json:"failureCount"`
	LastStatus       string  `json:"lastStatus"`
	LastStatusCode   *int64  `json:"lastStatusCode"`
	LastFailureAt    *int64  `json:"lastFailureAt"`
}

// DownloadStatsResponse mirrors the zod discriminatedUnion("type", [...]).
type DownloadStatsResponse struct {
	Type  string      `json:"type"` // "popular" | "problem-links"
	Items interface{} `json:"items"`
}

type ApiError struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

type ApiErrorResponse struct {
	Error ApiError `json:"error"`
}

// BrowseAppsQuery / SearchAppsQuery mirror the parsed (post-zod-coercion) query shape.
type BrowseAppsQuery struct {
	SourceID           *string            `json:"sourceId,omitempty"`
	Page               int                `json:"page"`
	PageSize           int                `json:"pageSize"`
	Category           AppCategory        `json:"category"`
	Sort               AppSort            `json:"sort"`
	IosVersion         *string            `json:"iosVersion,omitempty"`
	IosVersionOperator IosVersionOperator `json:"iosVersionOperator"`
	IncludeAppStore    bool               `json:"includeAppStore"`
}

type SearchAppsQuery struct {
	Q                  string             `json:"q"`
	SourceID           *string            `json:"sourceId,omitempty"`
	Page               int                `json:"page"`
	PageSize           int                `json:"pageSize"`
	Category           AppCategory        `json:"category"`
	Sort               AppSort            `json:"sort"`
	IosVersion         *string            `json:"iosVersion,omitempty"`
	IosVersionOperator IosVersionOperator `json:"iosVersionOperator"`
	IncludeAppStore    bool               `json:"includeAppStore"`
}

// Helper constructors for pointer fields, used throughout normalizer/catalog/etc.
func StrPtr(s string) *string {
	return &s
}

func StrPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func Int64Ptr(v int64) *int64 {
	return &v
}
