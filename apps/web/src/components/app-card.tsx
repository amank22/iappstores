"use client";

import { useEffect, useState } from "react";
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

function getAppStoreSearchUrl(app: AppDto): string {
  const query = app.name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(?:mod|tweak|hacked|premium|unlocked|cracked)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `https://apps.apple.com/in/iphone/search?term=${encodeURIComponent(query)}`;
}

function hashText(value: string): number {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
}

function getInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 1))
    .join("")
    .toUpperCase();
}

function AppIcon({ app }: { app: AppDto }) {
  const [hasFailed, setHasFailed] = useState(false);
  const hue = hashText(app.bundleIdentifier ?? app.name) % 360;
  const fallbackStyle = {
    background:
      `radial-gradient(circle at 30% 25%, hsl(${hue} 90% 74%), transparent 38%), ` +
      `linear-gradient(135deg, hsl(${hue} 80% 52%), hsl(${(hue + 48) % 360} 78% 32%))`
  };

  if (app.iconUrl && !hasFailed) {
    return (
      // External repository icons are user-provided, so a plain img keeps configuration simple.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.iconUrl}
        alt={`${app.name} icon`}
        className="h-14 w-14 rounded-2xl border border-border object-cover sm:h-16 sm:w-16"
        onError={() => setHasFailed(true)}
      />
    );
  }

  return (
    <div
      className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-border text-center text-sm font-black tracking-tight text-white shadow-inner sm:h-16 sm:w-16"
      style={fallbackStyle}
      title={app.iconUrl ? "Icon failed to load" : "No icon provided"}
    >
      <span className="drop-shadow">{getInitials(app.name)}</span>
    </div>
  );
}

export function AppCard({ app }: { app: AppDto }) {
  const fileSize = formatBytes(app.size);
  const downloadableOptions = app.downloadOptions.filter((option) => option.downloadURL);
  const hasMultipleSources = app.downloadOptions.length > 1;
  const appInfoUrl = app.appStoreUrl ?? getAppStoreSearchUrl(app);
  const [isDownloadPickerOpen, setIsDownloadPickerOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const hasLongDescription = Boolean(app.description && app.description.length > 180);

  useEffect(() => {
    if (!isDescriptionOpen && !isDownloadPickerOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDescriptionOpen, isDownloadPickerOpen]);

  return (
    <>
      <Card className="flex h-full min-h-[30rem] flex-col overflow-hidden rounded-2xl">
        <CardHeader className="gap-4 p-4 sm:p-6">
          <div className="flex gap-4">
            <AppIcon app={app} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="min-w-0">
                <CardTitle className="line-clamp-2 text-xl leading-tight">{app.name}</CardTitle>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {app.developerName ?? "Unknown developer"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                  {fileSize ?? "Size unknown"}
                </span>
                {hasMultipleSources ? <Badge variant="secondary">{app.downloadOptions.length} sources</Badge> : null}
                {app.latestVersion ? <Badge variant="outline">v{app.latestVersion}</Badge> : null}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-2">
            {app.subtitle ? <p className="line-clamp-2 text-sm font-medium">{app.subtitle}</p> : null}
            {app.description ? (
              <>
                <p className="line-clamp-5 text-sm leading-6 text-muted-foreground">{app.description}</p>
                {hasLongDescription ? (
                  <Button
                    className="h-auto px-0 py-0 text-primary hover:bg-transparent hover:text-primary/80"
                    variant="ghost"
                    onClick={() => setIsDescriptionOpen(true)}
                  >
                    Read full description
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No description available from this source. Use App Store search to learn more about this app.
              </p>
            )}
          </div>

          <div className="mt-auto space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{app.sourceName}</Badge>
              {app.minOSVersion ? <Badge variant="outline">iOS {app.minOSVersion}+</Badge> : null}
            </div>
            {app.bundleIdentifier ? (
              <div className="text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">Bundle ID</div>
                <div className="truncate">{app.bundleIdentifier}</div>
              </div>
            ) : null}
          </div>
        </CardContent>

        <CardFooter className="grid grid-cols-2 gap-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <a
            href={appInfoUrl}
            rel="noreferrer"
            target="_blank"
            className={buttonClasses({ className: "w-full", variant: "secondary" })}
          >
            {app.appStoreUrl ? "View App Store" : "Search App Store"}
          </a>
          {hasMultipleSources ? (
            <Button
              className="w-full"
              disabled={downloadableOptions.length === 0}
              onClick={() => setIsDownloadPickerOpen(true)}
            >
              Download IPA
            </Button>
          ) : app.downloadURL ? (
            <a href={app.downloadURL} rel="noreferrer" target="_blank" className={buttonClasses({ className: "w-full" })}>
              Download IPA
            </a>
          ) : (
            <Button className="w-full" variant="secondary" disabled>
              No IPA
            </Button>
          )}
        </CardFooter>
      </Card>

      {isDescriptionOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden overscroll-contain bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${app.id}-description-title`}
          onMouseDown={() => setIsDescriptionOpen(false)}
        >
          <div
            className="flex max-h-[85vh] min-h-0 w-full max-w-2xl flex-col rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start gap-4">
              <AppIcon app={app} />
              <div className="min-w-0 flex-1">
                <h3 id={`${app.id}-description-title`} className="text-lg font-semibold">
                  {app.name}
                </h3>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {app.developerName ?? "Unknown developer"}
                </p>
              </div>
            </div>

            <div className="mt-5 min-h-0 overflow-y-auto overscroll-contain pr-1 text-sm leading-6 text-muted-foreground">
              {app.subtitle ? <p className="mb-4 font-medium text-foreground">{app.subtitle}</p> : null}
              <p className="whitespace-pre-wrap">{app.description}</p>
            </div>

            <Button className="mt-5 w-full shrink-0" variant="secondary" onClick={() => setIsDescriptionOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {isDownloadPickerOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden overscroll-contain bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${app.id}-download-title`}
          onMouseDown={() => setIsDownloadPickerOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <AppIcon app={app} />
              <div className="min-w-0 flex-1">
                <h3 id={`${app.id}-download-title`} className="text-lg font-semibold">
                  Choose download source
                </h3>
                <p className="mt-1 truncate text-sm text-muted-foreground">{app.name}</p>
              </div>
            </div>

            <div className="mt-5 grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
              {downloadableOptions.map((option) => {
                const optionSize = formatBytes(option.size);

                return (
                  <a
                    key={`${option.sourceId}:${option.downloadURL}`}
                    href={option.downloadURL ?? undefined}
                    rel="noreferrer"
                    target="_blank"
                    className={buttonClasses({
                      className: "h-auto w-full justify-between gap-4 px-4 py-3 text-left",
                      variant: "outline"
                    })}
                    onClick={() => setIsDownloadPickerOpen(false)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{option.sourceName}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {[option.latestVersion ? `v${option.latestVersion}` : null, optionSize, option.minOSVersion ? `iOS ${option.minOSVersion}+` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs opacity-80">Download</span>
                  </a>
                );
              })}
            </div>

            <Button className="mt-5 w-full" variant="secondary" onClick={() => setIsDownloadPickerOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
