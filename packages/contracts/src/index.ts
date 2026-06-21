import { z } from "zod";

const QueryStringSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}, z.string().min(1));

const QueryPositiveIntegerSchema = (defaultValue: number, maxValue: number) =>
  z.preprocess((value) => {
    const raw = Array.isArray(value) ? value[0] : value;

    if (raw === undefined || raw === null || raw === "") {
      return defaultValue;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }, z.number().int().min(1).max(maxValue));

const QueryBooleanSchema = (defaultValue: boolean) =>
  z.preprocess((value) => {
    const raw = Array.isArray(value) ? value[0] : value;

    if (raw === undefined || raw === null || raw === "") {
      return defaultValue;
    }

    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no"].includes(normalized)) {
        return false;
      }
    }

    return raw;
  }, z.boolean());

export const AppCategorySchema = z.enum(["all", "recent", "games", "tools", "media", "education"]);
export const DerivedAppCategorySchema = z.enum(["games", "tools", "media", "education"]);
export const IosVersionOperatorSchema = z.enum(["lte", "gte"]);
export const AppSortSchema = z.enum(["recent", "name-asc", "name-desc"]);
export const IosVersionQuerySchema = z.preprocess((value) => {
  const raw = Array.isArray(value) ? value[0] : value;

  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().regex(/^\d+(?:\.\d+){0,2}$/).optional());

export const SourceIdParamSchema = z.object({
  sourceId: z.string().trim().min(1)
});

export const DeveloperSlugParamSchema = z.object({
  developerSlug: z.string().trim().min(1)
});

export const AppIdParamSchema = z.object({
  appId: z.string().trim().min(1)
});

export const TranslationRequestSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  from: z.string().trim().toLowerCase().regex(/^(?:[a-z]{2}|auto)$/).default("auto"),
  to: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/).default("en")
});

export const DownloadQuerySchema = z.object({
  appId: QueryStringSchema,
  sourceId: QueryStringSchema
});

export const DownloadStatsQuerySchema = z.object({
  type: z.enum(["popular", "problem-links"]).default("popular"),
  limit: QueryPositiveIntegerSchema(20, 100)
});

export const BrowseAppsQuerySchema = z.object({
  sourceId: QueryStringSchema.optional(),
  page: QueryPositiveIntegerSchema(1, 10_000),
  pageSize: QueryPositiveIntegerSchema(24, 60),
  category: AppCategorySchema.default("all"),
  sort: AppSortSchema.default("recent"),
  iosVersion: IosVersionQuerySchema,
  iosVersionOperator: IosVersionOperatorSchema.default("lte"),
  includeAppStore: QueryBooleanSchema(true)
});

export const SearchAppsQuerySchema = z.object({
  q: QueryStringSchema,
  sourceId: QueryStringSchema.optional(),
  page: QueryPositiveIntegerSchema(1, 10_000),
  pageSize: QueryPositiveIntegerSchema(24, 60),
  category: AppCategorySchema.default("all"),
  sort: AppSortSchema.default("recent"),
  iosVersion: IosVersionQuerySchema,
  iosVersionOperator: IosVersionOperatorSchema.default("lte"),
  includeAppStore: QueryBooleanSchema(true)
});

export const SourceDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  url: z.string().url(),
  website: z.string().url().nullable(),
  appCount: z.number().int().nonnegative().optional()
});

export const DeveloperDtoSchema = z.object({
  slug: z.string(),
  name: z.string(),
  appCount: z.number().int().nonnegative(),
  categories: z.array(DerivedAppCategorySchema),
  sourceNames: z.array(z.string())
});

export const AppDownloadOptionSchema = z.object({
  sourceId: z.string(),
  sourceName: z.string(),
  latestVersion: z.string().nullable(),
  versionDate: z.string().nullable(),
  downloadURL: z.string().url().nullable(),
  size: z.number().int().nonnegative().nullable(),
  minOSVersion: z.string().nullable()
});

export const AppStoreMetadataSchema = z.object({
  country: z.string().length(2),
  bundleId: z.string(),
  trackId: z.number().int().positive(),
  trackViewUrl: z.string().url(),
  name: z.string(),
  developerName: z.string().nullable(),
  description: z.string().nullable(),
  artworkUrl60: z.string().url().nullable(),
  artworkUrl100: z.string().url().nullable(),
  artworkUrl512: z.string().url().nullable(),
  screenshotUrls: z.array(z.string().url()),
  ipadScreenshotUrls: z.array(z.string().url()),
  genres: z.array(z.string()),
  primaryGenreName: z.string().nullable(),
  averageUserRating: z.number().nullable(),
  userRatingCount: z.number().int().nonnegative().nullable(),
  formattedPrice: z.string().nullable(),
  price: z.number().nullable(),
  version: z.string().nullable(),
  minimumOsVersion: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  currentVersionReleaseDate: z.string().nullable(),
  contentAdvisoryRating: z.string().nullable(),
  fetchedAt: z.number().int().nonnegative()
});

export const AppDtoSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  name: z.string(),
  bundleIdentifier: z.string().nullable(),
  developerName: z.string().nullable(),
  subtitle: z.string().nullable(),
  description: z.string().nullable(),
  category: DerivedAppCategorySchema,
  iconUrl: z.string().url().nullable(),
  appStoreUrl: z.string().url().nullable(),
  screenshots: z.array(z.string().url()),
  latestVersion: z.string().nullable(),
  versionDate: z.string().nullable(),
  versionDescription: z.string().nullable(),
  downloadURL: z.string().url().nullable(),
  size: z.number().int().nonnegative().nullable(),
  minOSVersion: z.string().nullable(),
  downloadOptions: z.array(AppDownloadOptionSchema),
  appStore: AppStoreMetadataSchema.nullable().optional()
});

export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean()
});

export const AppCategoryFacetSchema = z.object({
  id: AppCategorySchema,
  name: z.string(),
  appCount: z.number().int().nonnegative()
});

export const SitemapAppSchema = z.object({
  id: z.string(),
  bundleIdentifier: z.string().nullable(),
  versionDate: z.string().nullable()
});

export const SourcesResponseSchema = z.object({
  sources: z.array(SourceDtoSchema)
});

export const DevelopersResponseSchema = z.object({
  developers: z.array(DeveloperDtoSchema)
});

export const AppsResponseSchema = z.object({
  source: SourceDtoSchema,
  apps: z.array(AppDtoSchema),
  pagination: PaginationSchema,
  categories: z.array(AppCategoryFacetSchema)
});

export const AppListResponseSchema = z.object({
  apps: z.array(AppDtoSchema),
  pagination: PaginationSchema,
  categories: z.array(AppCategoryFacetSchema)
});

export const AppResponseSchema = z.object({
  app: AppDtoSchema
});

export const SearchResponseSchema = z.object({
  query: SearchAppsQuerySchema,
  apps: z.array(AppDtoSchema),
  pagination: PaginationSchema,
  categories: z.array(AppCategoryFacetSchema)
});

export const SitemapAppsResponseSchema = z.object({
  apps: z.array(SitemapAppSchema)
});

export const TranslationResponseSchema = z.object({
  sourceText: z.string(),
  translatedText: z.string(),
  from: z.string().nullable(),
  to: z.string()
});

export const PopularDownloadStatsItemSchema = z.object({
  appId: z.string(),
  bundleIdentifier: z.string().nullable(),
  appName: z.string(),
  downloadCount: z.number().int().nonnegative(),
  lastDownloadedAt: z.number().int().nonnegative().nullable()
});

export const ProblemDownloadLinkStatsItemSchema = z.object({
  appId: z.string(),
  bundleIdentifier: z.string().nullable(),
  appName: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  downloadURL: z.string().url(),
  failureCount: z.number().int().nonnegative(),
  lastStatus: z.string(),
  lastStatusCode: z.number().int().nullable(),
  lastFailureAt: z.number().int().nonnegative().nullable()
});

export const DownloadStatsResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("popular"),
    items: z.array(PopularDownloadStatsItemSchema)
  }),
  z.object({
    type: z.literal("problem-links"),
    items: z.array(ProblemDownloadLinkStatsItemSchema)
  })
]);

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export type SourceIdParam = z.infer<typeof SourceIdParamSchema>;
export type DeveloperSlugParam = z.infer<typeof DeveloperSlugParamSchema>;
export type AppIdParam = z.infer<typeof AppIdParamSchema>;
export type TranslationRequest = z.infer<typeof TranslationRequestSchema>;
export type DownloadQuery = z.infer<typeof DownloadQuerySchema>;
export type DownloadStatsQuery = z.infer<typeof DownloadStatsQuerySchema>;
export type AppCategory = z.infer<typeof AppCategorySchema>;
export type DerivedAppCategory = z.infer<typeof DerivedAppCategorySchema>;
export type IosVersionOperator = z.infer<typeof IosVersionOperatorSchema>;
export type AppSort = z.infer<typeof AppSortSchema>;
export type BrowseAppsQuery = z.infer<typeof BrowseAppsQuerySchema>;
export type SearchAppsQuery = z.infer<typeof SearchAppsQuerySchema>;
export type SourceDto = z.infer<typeof SourceDtoSchema>;
export type DeveloperDto = z.infer<typeof DeveloperDtoSchema>;
export type AppDownloadOption = z.infer<typeof AppDownloadOptionSchema>;
export type AppStoreMetadata = z.infer<typeof AppStoreMetadataSchema>;
export type AppDto = z.infer<typeof AppDtoSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type AppCategoryFacet = z.infer<typeof AppCategoryFacetSchema>;
export type SitemapApp = z.infer<typeof SitemapAppSchema>;
export type SourcesResponse = z.infer<typeof SourcesResponseSchema>;
export type DevelopersResponse = z.infer<typeof DevelopersResponseSchema>;
export type AppsResponse = z.infer<typeof AppsResponseSchema>;
export type AppListResponse = z.infer<typeof AppListResponseSchema>;
export type AppResponse = z.infer<typeof AppResponseSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type SitemapAppsResponse = z.infer<typeof SitemapAppsResponseSchema>;
export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;
export type PopularDownloadStatsItem = z.infer<typeof PopularDownloadStatsItemSchema>;
export type ProblemDownloadLinkStatsItem = z.infer<typeof ProblemDownloadLinkStatsItemSchema>;
export type DownloadStatsResponse = z.infer<typeof DownloadStatsResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
