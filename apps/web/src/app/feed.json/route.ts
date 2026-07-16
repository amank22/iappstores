import { fetchUpdates } from "@/lib/api";
import { FEED_HEADERS, jsonFeed } from "@/lib/feeds";
export const dynamic = "force-dynamic";
export async function GET() { const { events } = await fetchUpdates({ type: "all", pageSize: 100 }); return Response.json(jsonFeed(events), { headers: { ...FEED_HEADERS, "content-type": "application/feed+json; charset=utf-8" } }); }
