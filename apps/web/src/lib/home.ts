import type { AppCategory, AppCategoryFacet, AppDto, IosVersionOperator, Pagination, SourceDto } from "@iappstores/contracts";

export const ALL_SOURCES = "all";
export const HOME_PAGE_SIZE = 12;
export const DEFAULT_IOS_OPERATOR: IosVersionOperator = "lte";
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
  { id: "tools", name: "Tools", appCount: 0 },
  { id: "media", name: "Media", appCount: 0 },
  { id: "education", name: "Education", appCount: 0 }
];

export type HomeUrlState = {
  selectedSourceId: string;
  selectedCategory: AppCategory;
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

const APP_CATEGORIES = new Set<AppCategory>(["all", "recent", "games", "tools", "media", "education"]);
const IOS_OPERATORS = new Set<IosVersionOperator>(["lte", "gte"]);

function getParam(params: URLSearchParams | SearchParamRecord, key: string): string | undefined {
  const value = params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseHomeUrlState(params: URLSearchParams | SearchParamRecord): HomeUrlState {
  const category = getParam(params, "category")?.trim();
  const iosOperator = getParam(params, "iosOperator")?.trim();

  return {
    selectedSourceId: getParam(params, "source")?.trim() || ALL_SOURCES,
    selectedCategory: category && APP_CATEGORIES.has(category as AppCategory) ? (category as AppCategory) : "all",
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
