import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Public API documentation",
  description: "Reference for the public iappstores API."
};

const endpoints = [
  ["GET", "/api/apps", "Browse grouped app listings."],
  ["GET", "/api/apps/{appId}", "Get an app and its download options."],
  ["GET", "/api/search", "Search app listings."],
  ["GET", "/api/sources", "List repository sources."],
  ["GET", "/api/developers", "List developers."],
  ["GET", "/api/collections/{slug}", "Get a curated collection."],
  ["GET", "/api/updates", "List new and updated apps."],
  ["POST", "/api/translate", "Translate repository text."],
  ["GET", "/api/download", "Record then redirect to an original source download."],
  ["GET", "/health", "Check service health."]
];

export default function ApiDocsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-10 text-foreground">
      <h1 className="text-3xl font-bold">iappstores Public API</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        Public, read-mostly access to grouped iOS app repository metadata. Download URLs redirect to original third-party sources.
      </p>
      <p className="mt-4">
        <a className="text-primary underline" href={getAbsoluteUrl("/openapi.json")}>Download the OpenAPI 3.1 specification</a>
      </p>
      <h2 className="mt-10 text-xl font-semibold">Endpoints</h2>
      <ul className="mt-4 space-y-4">
        {endpoints.map(([method, path, description]) => (
          <li key={`${method}-${path}`}>
            <code className="font-semibold">{method} {path}</code>
            <p className="text-muted-foreground">{description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
