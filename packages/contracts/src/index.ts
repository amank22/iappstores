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

export const AppCategorySchema = z.enum(["all", "recent", "games", "tools", "media", "education"]);
export const DerivedAppCategorySchema = z.enum(["games", "tools", "media", "education"]);
export const IosVersionOperatorSchema = z.enum(["lte", "gte"]);
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

export const BrowseAppsQuerySchema = z.object({
  sourceId: QueryStringSchema.optional(),
  page: QueryPositiveIntegerSchema(1, 10_000),
  pageSize: QueryPositiveIntegerSchema(24, 60),
  category: AppCategorySchema.default("all"),
  iosVersion: IosVersionQuerySchema,
  iosVersionOperator: IosVersionOperatorSchema.default("lte")
});

export const SearchAppsQuerySchema = z.object({
  q: QueryStringSchema,
  sourceId: QueryStringSchema.optional(),
  page: QueryPositiveIntegerSchema(1, 10_000),
  pageSize: QueryPositiveIntegerSchema(24, 60),
  category: AppCategorySchema.default("all"),
  iosVersion: IosVersionQuerySchema,
  iosVersionOperator: IosVersionOperatorSchema.default("lte")
});

export const SourceDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  url: z.string().url(),
  website: z.string().url().nullable(),
  appCount: z.number().int().nonnegative().optional()
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

export const SourcesResponseSchema = z.object({
  sources: z.array(SourceDtoSchema)
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

export const SearchResponseSchema = z.object({
  query: SearchAppsQuerySchema,
  apps: z.array(AppDtoSchema),
  pagination: PaginationSchema,
  categories: z.array(AppCategoryFacetSchema)
});

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export type SourceIdParam = z.infer<typeof SourceIdParamSchema>;
export type AppCategory = z.infer<typeof AppCategorySchema>;
export type DerivedAppCategory = z.infer<typeof DerivedAppCategorySchema>;
export type IosVersionOperator = z.infer<typeof IosVersionOperatorSchema>;
export type BrowseAppsQuery = z.infer<typeof BrowseAppsQuerySchema>;
export type SearchAppsQuery = z.infer<typeof SearchAppsQuerySchema>;
export type SourceDto = z.infer<typeof SourceDtoSchema>;
export type AppDownloadOption = z.infer<typeof AppDownloadOptionSchema>;
export type AppStoreMetadata = z.infer<typeof AppStoreMetadataSchema>;
export type AppDto = z.infer<typeof AppDtoSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type AppCategoryFacet = z.infer<typeof AppCategoryFacetSchema>;
export type SourcesResponse = z.infer<typeof SourcesResponseSchema>;
export type AppsResponse = z.infer<typeof AppsResponseSchema>;
export type AppListResponse = z.infer<typeof AppListResponseSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
