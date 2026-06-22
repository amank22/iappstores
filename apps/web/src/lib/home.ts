import type { AppCategory, AppCategoryFacet, AppDto, AppSort, IosVersionOperator, Pagination, SourceDto } from "@iappstores/contracts";

export const ALL_SOURCES = "all";
export const HOME_PAGE_SIZE = 12;
export const DEFAULT_IOS_OPERATOR: IosVersionOperator = "lte";
export const DEFAULT_SORT: AppSort = "recent";
export const HOME_EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: HOME_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false
};
export const HOME_EMPTY_CATEGORIES: AppCategoryFacet[] = [
  { id: "all", name: "All apps", appCount: 0 },
  { id: "recent", name: "Recently updated", appCount: 0 },
  { id: "games", name: "Games", appCount: 0 },
  { id: "emulators", name: "Emulators", appCount: 0 },
  { id: "tools", name: "Tools", appCount: 0 },
  { id: "productivity", name: "Productivity", appCount: 0 },
  { id: "utilities", name: "Utilities", appCount: 0 },
  { id: "media", name: "Media", appCount: 0 },
  { id: "music", name: "Music", appCount: 0 },
  { id: "photo-video", name: "Photo & Video", appCount: 0 },
  { id: "social", name: "Social", appCount: 0 },
  { id: "education", name: "Education", appCount: 0 },
  { id: "books", name: "Books", appCount: 0 },
  { id: "developer", name: "Developer", appCount: 0 },
  { id: "lifestyle", name: "Lifestyle", appCount: 0 }
];

export type HomeUrlState = {
  selectedSourceId: string;
  selectedCategory: AppCategory;
  sort: AppSort;
  iosVersion: string;
  iosVersionOperator: IosVersionOperator;
  query: string;
};

export type HomeInitialData = {
  urlState: HomeUrlState;
  sources: SourceDto[];
  apps: AppDto[];
  categories: AppCategoryFacet[];
  pagination: Pagination;
  error: string | null;
};

type SearchParamRecord = Record<string, string | string[] | undefined>;

const APP_CATEGORIES = new Set<AppCategory>([
  "all",
  "recent",
  "games",
  "emulators",
  "tools",
  "productivity",
  "utilities",
  "media",
  "music",
  "photo-video",
  "social",
  "education",
  "books",
  "developer",
  "lifestyle"
]);
const IOS_OPERATORS = new Set<IosVersionOperator>(["lte", "gte"]);
const APP_SORTS = new Set<AppSort>(["recent", "name-asc", "name-desc"]);

function getParam(params: URLSearchParams | SearchParamRecord, key: string): string | undefined {
  const value = params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseHomeUrlState(params: URLSearchParams | SearchParamRecord): HomeUrlState {
  const category = getParam(params, "category")?.trim();
  const iosOperator = getParam(params, "iosOperator")?.trim();
  const sort = getParam(params, "sort")?.trim();

  return {
    selectedSourceId: getParam(params, "source")?.trim() || ALL_SOURCES,
    selectedCategory: category && APP_CATEGORIES.has(category as AppCategory) ? (category as AppCategory) : "all",
    sort: sort && APP_SORTS.has(sort as AppSort) ? (sort as AppSort) : DEFAULT_SORT,
    iosVersion: getParam(params, "ios")?.trim() ?? "",
    iosVersionOperator:
      iosOperator && IOS_OPERATORS.has(iosOperator as IosVersionOperator)
        ? (iosOperator as IosVersionOperator)
        : DEFAULT_IOS_OPERATOR,
    query: getParam(params, "q")?.trim() ?? ""
  };
}

export function getActiveIosVersion(iosVersion: string): string | undefined {
  const trimmed = iosVersion.trim();
  return /^\d+(?:\.\d+){0,2}$/.test(trimmed) ? trimmed : undefined;
}
