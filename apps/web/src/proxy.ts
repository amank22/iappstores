import { NextResponse, type NextRequest } from "next/server";

const EXCLUDED_PATHS = ["/_next", "/api", "/health", "/__markdown"];

function acceptsMarkdown(value: string | null): boolean {
  if (!value) return false;

  return value.split(",").some((part) => {
    const [mediaType, ...parameters] = part.trim().toLowerCase().split(";");
    if (mediaType !== "text/markdown") return false;

    return !parameters.some((parameter) => parameter.trim() === "q=0" || parameter.trim() === "q=0.0");
  });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (EXCLUDED_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (!acceptsMarkdown(request.headers.get("accept"))) {
    const response = NextResponse.next();
    // Both variants must vary by Accept, otherwise a shared cache can serve HTML to an agent.
    response.headers.set("Vary", "Accept");
    return response;
  }

  const markdownUrl = request.nextUrl.clone();
  markdownUrl.pathname = pathname === "/" ? "/__markdown" : `/__markdown${pathname}`;
  return NextResponse.rewrite(markdownUrl);
}

export const config = {
  // Skip static files by extension only: app routes are bundle IDs that contain dots
  // (/apps/com.example.app), so a blanket "no dot" rule would skip them.
  matcher: ["/((?!_next/|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|map|txt|xml|json|webmanifest|woff2?|ttf)$).*)"]
};
