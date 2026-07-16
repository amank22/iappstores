import { fetchUpdates } from "@/lib/api";
import { atom, FEED_HEADERS } from "@/lib/feeds";
export const dynamic = "force-dynamic";
export async function GET() { const { events } = await fetchUpdates({ type: "all", pageSize: 100 }); return new Response(atom(events), { headers: { ...FEED_HEADERS, "content-type": "application/atom+xml; charset=utf-8" } }); }
