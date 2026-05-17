import type { MetadataRoute } from "next";
import { fetchApps } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const SITEMAP_PAGE_SIZE = 60;
const MAX_APP_URLS = 45_000;

function getLastModified(date: string | null): Date {
  if (!date) {
    return new Date();
  }

  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
}

function getShareId(app: { id: string; bundleIdentifier: string | null }): string {
  return app.bundleIdentifier ?? (app.id.startsWith("bundle:") ? app.id.slice("bundle:".length) : app.id);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: getAbsoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1
    }
  ];

  try {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && entries.length <= MAX_APP_URLS) {
      const response = await fetchApps({
        page,
        pageSize: SITEMAP_PAGE_SIZE,
        includeAppStore: false
      });

      totalPages = response.pagination.totalPages;

      for (const app of response.apps) {
        entries.push({
          url: getAbsoluteUrl(`/apps/${encodeURIComponent(getShareId(app))}`),
          lastModified: getLastModified(app.versionDate),
          changeFrequency: "weekly",
          priority: 0.7
        });
      }

      page += 1;
    }
  } catch {
    // If the API is warming up, keep the sitemap valid with the homepage entry.
  }

  return entries;
}
