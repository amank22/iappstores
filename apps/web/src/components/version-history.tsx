import Link from "next/link";
import type { AppDto, AppVersion } from "@iappstores/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/freshness";
import { getAppPath } from "@/lib/seo";

export function VersionHistory({ app, versions, showFullChangelog = false }: { app: AppDto; versions: AppVersion[]; showFullChangelog?: boolean }) {
  return <div className="space-y-4">{versions.map((version, index) => <Card key={version.version}>
    <CardHeader><div className="flex flex-wrap items-center gap-2"><Badge>{index === 0 ? "Latest" : "Release"}</Badge><Badge variant="outline">{formatDate(version.releaseDate ?? version.firstSeenAt)}</Badge></div><CardTitle className="pt-2"><Link className="hover:underline" href={`${getAppPath(app)}/versions/${encodeURIComponent(version.version)}`}>Version {version.version}</Link></CardTitle></CardHeader>
    <CardContent className="space-y-3 text-sm text-muted-foreground">{version.changelog ? <p className={showFullChangelog ? "whitespace-pre-wrap" : "line-clamp-4 whitespace-pre-wrap"}>{version.changelog}</p> : <p>No changelog was supplied.</p>}<p>{version.builds.length} source {version.builds.length === 1 ? "build" : "builds"}</p></CardContent>
  </Card>)}</div>;
}
