import { fetchUpdates } from "@/lib/api";
import { FEED_HEADERS, rss } from "@/lib/feeds";
export const dynamic = "force-dynamic";
export async function GET() { const { events } = await fetchUpdates({ type: "all", pageSize: 100 }); return new Response(rss(events), { headers: { ...FEED_HEADERS, "content-type": "application/rss+xml; charset=utf-8" } }); }
