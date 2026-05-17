import {
  AppsResponseSchema,
  SearchResponseSchema,
  SourcesResponseSchema,
  type AppDto,
  type AppsResponse,
  type SearchResponse,
  type SourceDto,
  type SourcesResponse
} from "@iappstores/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Parser<T> = {
  parse: (data: unknown) => T;
};

async function request<T>(path: string, parser: Parser<T>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      accept: "application/json"
    }
  });
  const json = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error?: { message?: unknown } }).error?.message ?? "Request failed")
        : "Request failed";
    throw new Error(message);
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

export async function searchApps(query: string, sourceId?: string): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (sourceId) {
    params.set("sourceId", sourceId);
  }

  return request(`/api/search?${params.toString()}`, SearchResponseSchema);
}

export async function fetchAllApps(sources: SourceDto[]): Promise<AppDto[]> {
  const responses = await Promise.all(sources.map((source) => fetchSourceApps(source.id)));
  return responses.flatMap((response) => response.apps);
}
