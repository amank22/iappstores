import { fetchDevelopers, fetchSitemapApps, fetchSources } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";
import { SEO_LANDING_PAGES } from "@/lib/seo-landing-pages";
import {
  INDEXABLE_CATEGORIES,
  getAppUrl,
  getLastModified,
  xmlEscape
} from "@/lib/seo";

export const dynamic = "force-dynamic";

const APP_SITEMAP_SIZE = 10_000;

function urlEntry(url: string, lastModified = new Date()): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(url)}</loc>`,
    `    <lastmod>${lastModified.toISOString()}</lastmod>`,
    "  </url>"
  ].join("\n");
}

function xmlResponse(entries: string[]) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>'
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (name === "static.xml") {
    return xmlResponse([
      urlEntry(getAbsoluteUrl("/")),
      urlEntry(getAbsoluteUrl("/apps")),
      urlEntry(getAbsoluteUrl("/repositories")),
      urlEntry(getAbsoluteUrl("/developers")),
      urlEntry(getAbsoluteUrl("/guides")),
      ...SEO_LANDING_PAGES.map((page) => urlEntry(getAbsoluteUrl(`/${page.slug}`))),
      ...INDEXABLE_CATEGORIES.map((category) => urlEntry(getAbsoluteUrl(`/category/${category}`))),
      urlEntry(getAbsoluteUrl("/guides/install-altstore")),
      urlEntry(getAbsoluteUrl("/guides/install-sidestore")),
      urlEntry(getAbsoluteUrl("/guides/what-is-an-ipa-file")),
      urlEntry(getAbsoluteUrl("/guides/how-to-sideload-apps")),
      urlEntry(getAbsoluteUrl("/guides/altstore-vs-sidestore"))
    ]);
  }

  if (name === "repositories.xml") {
    const sources = await fetchSources();
    return xmlResponse(sources.map((source) => urlEntry(getAbsoluteUrl(`/repository/${encodeURIComponent(source.id)}`))));
  }

  if (name === "developers.xml") {
    const developers = await fetchDevelopers();
    return xmlResponse(
      developers
        .filter((developer) => developer.appCount > 0)
        .map((developer) => urlEntry(getAbsoluteUrl(`/developer/${encodeURIComponent(developer.slug)}`)))
    );
  }

  const appMatch = name.match(/^apps-(\d+)\.xml$/);
  if (appMatch) {
    const page = Number(appMatch[1]);
    if (!Number.isInteger(page) || page < 1) {
      return new Response("Not found", { status: 404 });
    }

    const { apps } = await fetchSitemapApps();
    const start = (page - 1) * APP_SITEMAP_SIZE;
    const pageApps = apps.slice(start, start + APP_SITEMAP_SIZE);
    if (pageApps.length === 0 && page > 1) {
      return new Response("Not found", { status: 404 });
    }

    return xmlResponse(
      pageApps.map((app) => urlEntry(getAppUrl(app), getLastModified(app.versionDate)))
    );
  }

  return new Response("Not found", { status: 404 });
}
