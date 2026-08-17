import { getAbsoluteUrl } from "@/lib/site";

const RFC_9727_PROFILE = "https://www.rfc-editor.org/info/rfc9727";

function catalogHeaders(): Headers {
  return new Headers({
    "content-type": `application/linkset+json; profile="${RFC_9727_PROFILE}"`,
    "cache-control": "public, max-age=3600",
    link: `</.well-known/api-catalog>; rel="api-catalog"`
  });
}

export function GET(): Response {
  const specification = getAbsoluteUrl("/openapi.json");
  const documentation = getAbsoluteUrl("/api-docs");
  const status = getAbsoluteUrl("/health");
  const api = (path: string) => ({
    anchor: getAbsoluteUrl(path),
    "service-desc": [{ href: specification, type: "application/vnd.oai.openapi+json;version=3.1" }],
    "service-doc": [{ href: documentation, type: "text/html" }],
    status: [{ href: status, type: "application/json" }]
  });

  return Response.json(
    {
      linkset: [
        api("/api/apps"),
        api("/api/search"),
        api("/api/sources"),
        api("/api/developers"),
        api("/api/collections"),
        api("/api/updates"),
        api("/api/translate"),
        api("/api/download")
      ]
    },
    { headers: catalogHeaders() }
  );
}

export function HEAD(): Response {
  return new Response(null, { headers: catalogHeaders() });
}
