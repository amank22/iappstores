import { fetchUpdates } from "@/lib/api";
import { FEED_HEADERS, rss } from "@/lib/feeds";
export const dynamic = "force-dynamic";
export async function GET() { const { events } = await fetchUpdates({ type: "version", pageSize: 100 }); return new Response(rss(events, "Recently Updated IPAs", "/feeds/updates.xml"), { headers: { ...FEED_HEADERS, "content-type": "application/rss+xml; charset=utf-8" } }); }
