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

export const SourceIdParamSchema = z.object({
  sourceId: z.string().trim().min(1)
});

export const SearchAppsQuerySchema = z.object({
  q: QueryStringSchema,
  sourceId: QueryStringSchema.optional()
});

export const SourceDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  url: z.string().url(),
  website: z.string().url().nullable(),
  appCount: z.number().int().nonnegative().optional()
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
  iconUrl: z.string().url().nullable(),
  screenshots: z.array(z.string().url()),
  latestVersion: z.string().nullable(),
  versionDate: z.string().nullable(),
  versionDescription: z.string().nullable(),
  downloadURL: z.string().url().nullable(),
  size: z.number().int().nonnegative().nullable(),
  minOSVersion: z.string().nullable()
});

export const SourcesResponseSchema = z.object({
  sources: z.array(SourceDtoSchema)
});

export const AppsResponseSchema = z.object({
  source: SourceDtoSchema,
  apps: z.array(AppDtoSchema)
});

export const SearchResponseSchema = z.object({
  query: SearchAppsQuerySchema,
  apps: z.array(AppDtoSchema)
});

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export type SourceIdParam = z.infer<typeof SourceIdParamSchema>;
export type SearchAppsQuery = z.infer<typeof SearchAppsQuerySchema>;
export type SourceDto = z.infer<typeof SourceDtoSchema>;
export type AppDto = z.infer<typeof AppDtoSchema>;
export type SourcesResponse = z.infer<typeof SourcesResponseSchema>;
export type AppsResponse = z.infer<typeof AppsResponseSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
