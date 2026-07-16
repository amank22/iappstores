import Link from "next/link";
import type { UpdateEvent } from "@iappstores/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/freshness";
import { getAppPath } from "@/lib/seo";

export function UpdateList({ events }: { events: UpdateEvent[] }) {
  if (events.length === 0) return <p className="rounded-lg bg-card p-6 text-muted-foreground ring-1 ring-foreground/10">No updates were recorded in this period.</p>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => (
    <Card key={event.id}>
      <CardHeader>
        <div className="flex flex-wrap gap-2"><Badge>{event.type === "new" ? "New app" : "Updated"}</Badge><Badge variant="outline">{formatDate(event.occurredAt)}</Badge></div>
        <CardTitle className="pt-2"><Link href={getAppPath(event.app)} className="hover:underline">{event.app.appStore?.name ?? event.app.name}</Link></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {event.version ? <p className="font-medium text-foreground">Version {event.version}</p> : null}
        {event.summary ? <p className="line-clamp-4 whitespace-pre-wrap">{event.summary}</p> : <p>{event.app.sourceName}</p>}
        <Link className="font-medium text-primary hover:underline" href={event.version ? `${getAppPath(event.app)}/versions/${encodeURIComponent(event.version)}` : getAppPath(event.app)}>View details</Link>
      </CardContent>
    </Card>
  ))}</div>;
}
