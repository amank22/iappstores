import { fetchUpdates } from "@/lib/api";
import { FEED_HEADERS, rss } from "@/lib/feeds";
export const dynamic = "force-dynamic";
export async function GET() { const { events } = await fetchUpdates({ type: "new", pageSize: 100 }); return new Response(rss(events, "New IPA Apps", "/feeds/new-apps.xml"), { headers: { ...FEED_HEADERS, "content-type": "application/rss+xml; charset=utf-8" } }); }
