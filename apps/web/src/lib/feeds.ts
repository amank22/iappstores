import type { UpdateEvent } from "@iappstores/contracts";
import { getAbsoluteUrl } from "@/lib/site";
import { getAppPath, xmlEscape } from "@/lib/seo";

function eventUrl(event: UpdateEvent): string { return getAbsoluteUrl(event.version ? `${getAppPath(event.app)}/versions/${encodeURIComponent(event.version)}` : getAppPath(event.app)); }
function description(event: UpdateEvent): string { return event.summary ?? (event.version ? `${event.app.name} version ${event.version}` : `${event.app.name} was added to iappstores.`); }

export function rss(events: UpdateEvent[], title = "iappstores activity", selfPath = "/feed.xml"): string {
  const items = events.map((event) => `<item><title>${xmlEscape(event.title)}</title><link>${xmlEscape(eventUrl(event))}</link><guid isPermaLink="false">${xmlEscape(event.id)}</guid><pubDate>${new Date(event.occurredAt).toUTCString()}</pubDate><description>${xmlEscape(description(event))}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xmlEscape(title)}</title><link>${xmlEscape(getAbsoluteUrl("/updates"))}</link><description>IPA repository additions and version releases.</description><atom:link href="${xmlEscape(getAbsoluteUrl(selfPath))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
}

export function atom(events: UpdateEvent[]): string {
  const updated = events[0]?.occurredAt ?? new Date(0).toISOString();
  const entries = events.map((event) => `<entry><id>${xmlEscape(event.id)}</id><title>${xmlEscape(event.title)}</title><link href="${xmlEscape(eventUrl(event))}"/><updated>${new Date(event.occurredAt).toISOString()}</updated><summary>${xmlEscape(description(event))}</summary></entry>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${xmlEscape(getAbsoluteUrl("/"))}</id><title>iappstores activity</title><link href="${xmlEscape(getAbsoluteUrl("/atom.xml"))}" rel="self"/><link href="${xmlEscape(getAbsoluteUrl("/updates"))}"/><updated>${updated}</updated>${entries}</feed>`;
}

export function jsonFeed(events: UpdateEvent[]) {
  return { version: "https://jsonfeed.org/version/1.1", title: "iappstores activity", home_page_url: getAbsoluteUrl("/updates"), feed_url: getAbsoluteUrl("/feed.json"), items: events.map((event) => ({ id: event.id, url: eventUrl(event), title: event.title, content_text: description(event), date_published: event.occurredAt, tags: [event.type] })) };
}

export const FEED_HEADERS = { "cache-control": "public, max-age=900, s-maxage=900, stale-while-revalidate=3600" };
