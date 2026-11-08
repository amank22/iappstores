package normalizer

import (
	"bytes"
	"sort"

	"github.com/iappstores/api-go/internal/contracts"
)

// SortOrder returns the indexes of apps in the order SortApps(apps, sortOrder) returns
// the apps themselves. Dates are parsed and collation keys built once per app up front,
// so comparisons are plain integer and byte compares: the comparator used to parse
// both apps' dates and run the collation algorithm on every one of its ~n log n calls.
func SortOrder(apps []contracts.AppDto, sortOrder contracts.AppSort) []int32 {
	idx := make([]int32, len(apps))
	for i := range idx {
		idx[i] = int32(i)
	}
	if len(apps) < 2 {
		return idx
	}

	if sortOrder == contracts.SortNameAsc || sortOrder == contracts.SortNameDesc {
		names := make([]string, len(apps))
		ids := make([]string, len(apps))
		for i := range apps {
			names[i] = apps[i].Name
			ids[i] = apps[i].ID
		}
		nameKeys := collationKeys(&baseCollators, names)
		idKeys := collationKeys(&defaultCollators, ids)
		desc := sortOrder == contracts.SortNameDesc
		sort.SliceStable(idx, func(i, j int) bool {
			a, b := idx[i], idx[j]
			if cmp := bytes.Compare(nameKeys[a], nameKeys[b]); cmp != 0 {
				if desc {
					return cmp > 0
				}
				return cmp < 0
			}
			return bytes.Compare(idKeys[a], idKeys[b]) < 0
		})
		return idx
	}

	// Newest first, then by name (sortGroupedApps).
	timestamps := AppTimestamps(apps)
	names := make([]string, len(apps))
	for i := range apps {
		names[i] = apps[i].Name
	}
	nameKeys := collationKeys(&defaultCollators, names)
	sort.SliceStable(idx, func(i, j int) bool {
		a, b := idx[i], idx[j]
		if timestamps[a] != timestamps[b] {
			return timestamps[a] > timestamps[b]
		}
		return bytes.Compare(nameKeys[a], nameKeys[b]) < 0
	})
	return idx
}

// AppTimestamps parses each app's versionDate once (0 when missing or unparseable).
func AppTimestamps(apps []contracts.AppDto) []int64 {
	out := make([]int64, len(apps))
	for i := range apps {
		out[i] = appTimestamp(apps[i])
	}
	return out
}

// Permute returns apps reordered by order (as produced by SortOrder).
func Permute(apps []contracts.AppDto, order []int32) []contracts.AppDto {
	out := make([]contracts.AppDto, len(order))
	for i, k := range order {
		out[i] = apps[k]
	}
	return out
}

// IosFilter is a compiled iOS-version filter: the requested version is parsed once
// instead of once per app.
type IosFilter struct {
	requested []int
	operator  contracts.IosVersionOperator
}

// NewIosFilter returns nil when no version is requested (everything matches). A
// requested version that does not parse matches nothing, as in FilterAppsByIosVersion.
func NewIosFilter(iosVersion *string, operator contracts.IosVersionOperator) *IosFilter {
	if iosVersion == nil {
		return nil
	}
	requested := parseIosVersion(iosVersion)
	if requested == nil {
		requested = []int{}
	}
	return &IosFilter{requested: requested, operator: operator}
}

// Matches reports whether app passes the filter; a nil filter matches every app.
func (f *IosFilter) Matches(app *contracts.AppDto) bool {
	if f == nil {
		return true
	}
	if len(f.requested) == 0 {
		return false
	}
	appMin := parseIosVersion(app.MinOSVersion)
	if appMin == nil {
		return false
	}
	cmp := compareIosVersions(appMin, f.requested)
	if f.operator == contracts.IosOpLte {
		return cmp <= 0
	}
	return cmp >= 0
}

// PageBounds resolves page/pageSize against totalItems exactly like PaginateApps (an
// out-of-range page is clamped to the last page) and returns the [start, end) slice
// bounds of that page together with the pagination block.
func PageBounds(totalItems, page, pageSize int) (int, int, contracts.Pagination) {
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
	return start, end, contracts.Pagination{
		Page:            resolvedPage,
		PageSize:        pageSize,
		TotalItems:      totalItems,
		TotalPages:      totalPages,
		HasNextPage:     resolvedPage < totalPages,
		HasPreviousPage: resolvedPage > 1,
	}
}
