import { fetchApps, searchApps } from "@/lib/api";
import { homeMarkdown } from "@/lib/markdown";
import { ALL_SOURCES, getActiveIosVersion, HOME_PAGE_SIZE, parseHomeUrlState } from "@/lib/home";

function markdownResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept"
    }
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = parseHomeUrlState(url.searchParams);
  const options = {
    sourceId: state.selectedSourceId === ALL_SOURCES ? undefined : state.selectedSourceId,
    category: state.selectedCategory,
    sort: state.sort,
    iosVersion: getActiveIosVersion(state.iosVersion),
    iosVersionOperator: state.iosVersionOperator,
    page: 1,
    pageSize: HOME_PAGE_SIZE
  };

  try {
    const result = state.query ? await searchApps(state.query, options) : await fetchApps(options);
    return markdownResponse(homeMarkdown(result, state.query));
  } catch {
    return new Response("# ProtectedGadvisory\n\nRepository data is temporarily unavailable.", {
      status: 503,
      headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept" }
    });
  }
}
