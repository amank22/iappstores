import type { AppDto } from "@iappstores/contracts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

function formatBytes(size: number | null): string | null {
  if (size === null) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function AppCard({ app }: { app: AppDto }) {
  const fileSize = formatBytes(app.size);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="gap-4">
        <div className="flex gap-4">
          {app.iconUrl ? (
            // External repository icons are user-provided, so a plain img keeps configuration simple.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.iconUrl}
              alt={`${app.name} icon`}
              className="h-16 w-16 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-border bg-secondary text-xl font-bold">
              {app.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{app.name}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{app.developerName ?? "Unknown developer"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{app.sourceName}</Badge>
          {app.latestVersion ? <Badge variant="outline">v{app.latestVersion}</Badge> : null}
          {app.minOSVersion ? <Badge variant="outline">iOS {app.minOSVersion}+</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {app.subtitle ? <p className="text-sm font-medium">{app.subtitle}</p> : null}
        {app.description ? <p className="line-clamp-4 text-sm text-muted-foreground">{app.description}</p> : null}
        <dl className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
          {app.bundleIdentifier ? (
            <div>
              <dt className="font-semibold text-foreground">Bundle ID</dt>
              <dd className="truncate">{app.bundleIdentifier}</dd>
            </div>
          ) : null}
          {fileSize ? (
            <div>
              <dt className="font-semibold text-foreground">Size</dt>
              <dd>{fileSize}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
      <CardFooter>
        {app.downloadURL ? (
          <a href={app.downloadURL} rel="noreferrer" target="_blank" className={buttonClasses({ className: "w-full" })}>
            Download IPA
          </a>
        ) : (
          <Button className="w-full" variant="secondary" disabled>
            No download link
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
