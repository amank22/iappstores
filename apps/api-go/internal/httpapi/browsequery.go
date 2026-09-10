package httpapi

import (
	"fmt"
	"net/url"

	"github.com/iappstores/api-go/internal/contracts"
)

type parsedBrowseQuery struct {
	contracts.BrowseAppsQuery
}

// parseBrowseQuery mirrors BrowseAppsQuerySchema.safeParse(): validates and coerces every
// field, returning the first validation error found (an aggregate would be more
// zod-flatten-faithful, but every call site here only reports a single "invalid_apps_query"
// error either way).
func parseBrowseQuery(q url.Values) (contracts.BrowseAppsQuery, error) {
	var out contracts.BrowseAppsQuery
	out.SourceID = queryOptionalString(q, "sourceId")

	page, err := queryPositiveInt(q, "page", 1, 10_000)
	if err != nil {
		return out, err
	}
	out.Page = page

	pageSize, err := queryPositiveInt(q, "pageSize", 24, 60)
	if err != nil {
		return out, err
	}
	out.PageSize = pageSize

	category, err := queryCategory(q, "category")
	if err != nil {
		return out, err
	}
	out.Category = contracts.AppCategory(category)

	sortOrder, err := querySort(q, "sort")
	if err != nil {
		return out, err
	}
	out.Sort = contracts.AppSort(sortOrder)

	iosVersion, err := queryIosVersion(q, "iosVersion")
	if err != nil {
		return out, err
	}
	out.IosVersion = iosVersion

	operator, err := queryIosOperator(q, "iosVersionOperator")
	if err != nil {
		return out, err
	}
	out.IosVersionOperator = contracts.IosVersionOperator(operator)

	includeAppStore, err := queryBool(q, "includeAppStore", true)
	if err != nil {
		return out, err
	}
	out.IncludeAppStore = includeAppStore

	return out, nil
}

// parseSearchQuery mirrors SearchAppsQuerySchema.safeParse(): same as browse, plus a
// required non-empty `q`.
func parseSearchQuery(q url.Values) (contracts.SearchAppsQuery, error) {
	var out contracts.SearchAppsQuery
	query, ok := queryString(q, "q")
	if !ok {
		return out, fmt.Errorf("q is required")
	}
	out.Q = query

	browse, err := parseBrowseQuery(q)
	if err != nil {
		return out, err
	}
	out.SourceID = browse.SourceID
	out.Page = browse.Page
	out.PageSize = browse.PageSize
	out.Category = browse.Category
	out.Sort = browse.Sort
	out.IosVersion = browse.IosVersion
	out.IosVersionOperator = browse.IosVersionOperator
	out.IncludeAppStore = browse.IncludeAppStore

	return out, nil
}
