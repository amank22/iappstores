import { getAbsoluteUrl } from "@/lib/site";

const jsonResponse = { content: { "application/json": { schema: { type: "object" } } } };

export function GET(): Response {
  const document = {
    openapi: "3.1.0",
    info: {
      title: "iappstores Public API",
      version: "1.0.0",
      description: "Public API for browsing iOS IPA repository metadata. Data is sourced from third-party repositories; download URLs are redirects to the original source."
    },
    servers: [{ url: getAbsoluteUrl("/"), description: "Production server" }],
    paths: {
      "/health": { get: { summary: "Service health", responses: { "200": jsonResponse } } },
      "/api/sources": { get: { summary: "List repository sources", responses: { "200": jsonResponse } } },
      "/api/developers": { get: { summary: "List developers", responses: { "200": jsonResponse } } },
      "/api/apps": { get: { summary: "Browse grouped app listings", responses: { "200": jsonResponse } } },
      "/api/apps/{appId}": {
        get: {
          summary: "Get an app listing",
          parameters: [{ name: "appId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse, "404": jsonResponse }
        }
      },
      "/api/apps/{appId}/recommendations": {
        get: {
          summary: "Get app recommendations",
          parameters: [{ name: "appId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse }
        }
      },
      "/api/apps/{appId}/versions": {
        get: {
          summary: "List app versions",
          parameters: [{ name: "appId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse }
        }
      },
      "/api/apps/{appId}/versions/{version}": {
        get: {
          summary: "Get an app version",
          parameters: [
            { name: "appId", in: "path", required: true, schema: { type: "string" } },
            { name: "version", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: { "200": jsonResponse }
        }
      },
      "/api/apps/{appId}/status": {
        get: {
          summary: "Get canonical app status",
          parameters: [{ name: "appId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse }
        }
      },
      "/api/sources/{sourceId}/apps": {
        get: {
          summary: "List apps from a source",
          parameters: [{ name: "sourceId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse }
        }
      },
      "/api/developers/{developerSlug}/apps": {
        get: {
          summary: "List a developer's apps",
          parameters: [{ name: "developerSlug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse }
        }
      },
      "/api/search": { get: { summary: "Search app listings", responses: { "200": jsonResponse } } },
      "/api/collections/{slug}": {
        get: {
          summary: "Get a curated collection",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": jsonResponse }
        }
      },
      "/api/updates": { get: { summary: "List app update events", responses: { "200": jsonResponse } } },
      "/api/updates/archives": { get: { summary: "List update archives", responses: { "200": jsonResponse } } },
      "/api/downloads/stats": { get: { summary: "Get public download statistics", responses: { "200": jsonResponse } } },
      "/api/sitemap/apps": { get: { summary: "List compact app sitemap data", responses: { "200": jsonResponse } } },
      "/api/download": {
        get: {
          summary: "Record and redirect to a source download URL",
          parameters: [
            { name: "appId", in: "query", required: true, schema: { type: "string" } },
            { name: "sourceId", in: "query", required: true, schema: { type: "string" } }
          ],
          responses: { "302": { description: "Redirect to the original download" }, "404": jsonResponse }
        }
      },
      "/api/translate": {
        post: {
          summary: "Translate repository text",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: { text: { type: "string" }, from: { type: "string" }, to: { type: "string" } }
                }
              }
            }
          },
          responses: { "200": jsonResponse }
        }
      }
    }
  };

  return Response.json(document, {
    headers: {
      "content-type": "application/vnd.oai.openapi+json;version=3.1",
      "cache-control": "public, max-age=3600"
    }
  });
}
