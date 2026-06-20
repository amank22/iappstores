import { fetchDevelopers, fetchSitemapApps, fetchSources } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";
import { INDEXABLE_CATEGORIES, xmlEscape } from "@/lib/seo";

export const dynamic = "force-dynamic";

const APP_SITEMAP_SIZE = 10_000;

function sitemapEntry(url: string): string {
  return `  <sitemap><loc>${xmlEscape(url)}</loc></sitemap>`;
}

export async function GET() {
  const entries = [
    getAbsoluteUrl("/sitemaps/static.xml")
  ];

  try {
    const [{ apps }, sources, developers] = await Promise.all([
      fetchSitemapApps(),
      fetchSources(),
      fetchDevelopers()
    ]);
    const appSitemapCount = Math.max(1, Math.ceil(apps.length / APP_SITEMAP_SIZE));

    for (let index = 1; index <= appSitemapCount; index += 1) {
      entries.push(getAbsoluteUrl(`/sitemaps/apps-${index}.xml`));
    }

    if (sources.length > 0) {
      entries.push(getAbsoluteUrl("/sitemaps/repositories.xml"));
    }

    if (developers.length > 0) {
      entries.push(getAbsoluteUrl("/sitemaps/developers.xml"));
    }
  } catch {
    entries.push(getAbsoluteUrl("/sitemaps/apps-1.xml"));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(sitemapEntry),
    '</sitemapindex>'
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8"
    }
  });
}
