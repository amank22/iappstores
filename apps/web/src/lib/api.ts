import {
  AppListResponseSchema,
  AppResponseSchema,
  AppsResponseSchema,
  SearchResponseSchema,
  SitemapAppsResponseSchema,
  SourcesResponseSchema,
  TranslationResponseSchema,
  type AppCategory,
  type AppListResponse,
  type AppResponse,
  type AppsResponse,
  type IosVersionOperator,
  type SearchResponse,
  type SitemapAppsResponse,
  type SourceDto,
  type SourcesResponse,
  type TranslationResponse
} from "@iappstores/contracts";

export type AppQueryOptions = {
  sourceId?: string;
  category?: AppCategory;
  iosVersion?: string;
  iosVersionOperator?: IosVersionOperator;
  page?: number;
  pageSize?: number;
  includeAppStore?: boolean;
};

type Parser<T> = {
  parse: (data: unknown) => T;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  }

  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
}

function parseErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message.trim().length > 0) {
      return error.message;
    }
  }

  return fallback;
}

function summarizeTextBody(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

async function request<T>(path: string, parser: Parser<T>, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await response.text();
  let json: unknown;

  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      const summary = summarizeTextBody(text);
      const message = response.ok
        ? "The API returned an invalid JSON response."
        : `Request failed with ${response.status} ${response.statusText || "error"}${summary ? `: ${summary}` : ""}`;
      throw new Error(message);
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(json, `Request failed with ${response.status} ${response.statusText || "error"}`));
  }

  return parser.parse(json);
}

export async function fetchSources(): Promise<SourceDto[]> {
  const response: SourcesResponse = await request("/api/sources", SourcesResponseSchema);
  return response.sources;
}

export async function fetchSourceApps(sourceId: string): Promise<AppsResponse> {
  return request(`/api/sources/${encodeURIComponent(sourceId)}/apps`, AppsResponseSchema);
}

function toQueryString(options: AppQueryOptions = {}): string {
  const params = new URLSearchParams();
  if (options.sourceId) {
    params.set("sourceId", options.sourceId);
  }
  if (options.category && options.category !== "all") {
    params.set("category", options.category);
  }
  if (options.iosVersion) {
    params.set("iosVersion", options.iosVersion);
    params.set("iosVersionOperator", options.iosVersionOperator ?? "lte");
  }
  if (options.page) {
    params.set("page", String(options.page));
  }
  if (options.pageSize) {
    params.set("pageSize", String(options.pageSize));
  }
  if (options.includeAppStore !== undefined) {
    params.set("includeAppStore", String(options.includeAppStore));
  }

  return params.toString();
}

export async function fetchApps(options: AppQueryOptions = {}): Promise<AppListResponse> {
  const query = toQueryString(options);
  return request(`/api/apps${query ? `?${query}` : ""}`, AppListResponseSchema);
}

export async function fetchSitemapApps(): Promise<SitemapAppsResponse> {
  return request("/api/sitemap/apps", SitemapAppsResponseSchema);
}

export async function fetchApp(appId: string): Promise<AppResponse> {
  return request(`/api/apps/${encodeURIComponent(appId)}`, AppResponseSchema);
}

export async function searchApps(query: string, options: AppQueryOptions = {}): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  const optionParams = toQueryString(options);
  if (optionParams.length > 0) {
    new URLSearchParams(optionParams).forEach((value, key) => params.set(key, value));
  }

  return request(`/api/search?${params.toString()}`, SearchResponseSchema);
}

export async function translateText(text: string, to = "en"): Promise<TranslationResponse> {
  return request("/api/translate", TranslationResponseSchema, {
    method: "POST",
    body: {
      text,
      to
    }
  });
}
