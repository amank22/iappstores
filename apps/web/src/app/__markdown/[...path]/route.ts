import { fetchApp } from "@/lib/api";
import { appMarkdown, unavailableMarkdown } from "@/lib/markdown";

type MarkdownRouteProps = {
  params: Promise<{ path: string[] }>;
};

function markdownResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept"
    }
  });
}

export async function GET(_request: Request, { params }: MarkdownRouteProps) {
  const { path } = await params;
  if (path.length === 2 && path[0] === "apps") {
    try {
      return markdownResponse(appMarkdown((await fetchApp(path[1]!)).app));
    } catch {
      return markdownResponse("# App not found\n\nThe requested app listing is unavailable.", 404);
    }
  }

  return markdownResponse(unavailableMarkdown(`/${path.map(encodeURIComponent).join("/")}`));
}
