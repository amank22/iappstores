import { getAbsoluteUrl, getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const body = `# ProtectedGadvisory crawler policy
# Search indexing is permitted. AI model training and AI-input use are not.
User-Agent: *
Content-Signal: ai-train=no, search=yes, ai-input=no
Allow: /
Disallow: /api/
Disallow: /search?
Disallow: /*?sort=
Disallow: /*?pageSize=
Disallow: /*?includeAppStore=

Sitemap: ${getAbsoluteUrl("/sitemap.xml")}
Host: ${getSiteUrl()}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
