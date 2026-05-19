"use client";

import { memo, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { AppDto } from "@iappstores/contracts";
import { ArrowUpRightIcon, StarIcon } from "@phosphor-icons/react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { translateText } from "@/lib/api";

const appBadgeClassName = "h-6 max-w-full px-2.5 text-xs";
const appMetricBadgeClassName = "h-6 max-w-full gap-1 px-2.5 text-xs";

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

function formatRating(rating: number | null | undefined, ratingCount: number | null | undefined): string | null {
  if (rating === null || rating === undefined) {
    return null;
  }

  const countLabel = ratingCount ? `${ratingCount.toLocaleString()}` : "rating";
  return `${rating.toFixed(1)} · ${countLabel}`;
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

function shouldOfferTranslation(text: string | null | undefined): text is string {
  return Boolean(text && /[^\u0000-\u007f]/.test(text));
}

function getTranslateUrl(text: string): string {
  return `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(text)}&op=translate`;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function getScreenshotUrls(app: AppDto): string[] {
  const appStore = app.appStore ?? null;
  return uniqueUrls([
    ...(appStore?.screenshotUrls ?? []),
    ...(appStore?.ipadScreenshotUrls ?? []),
    ...app.screenshots
  ]);
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

function getHueFallbackBackground(bundleIdentifier: string | null, name: string): CSSProperties {
  const hue = hashText(bundleIdentifier ?? name) % 360;
  return {
    background:
      `radial-gradient(circle at 30% 25%, hsl(${hue} 90% 74%), transparent 38%), ` +
      `linear-gradient(135deg, hsl(${hue} 80% 52%), hsl(${(hue + 48) % 360} 78% 32%))`
  };
}

function AppIcon({
  bundleIdentifier,
  iconUrl,
  name
}: {
  bundleIdentifier: string | null;
  iconUrl: string | null;
  name: string;
}) {
  const [hasFailed, setHasFailed] = useState(false);
  const fallbackStyle = getHueFallbackBackground(bundleIdentifier, name);

  useEffect(() => {
    setHasFailed(false);
  }, [iconUrl]);

  if (iconUrl && !hasFailed) {
    return (
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/40 p-1.5 ring-1 ring-foreground/10 sm:h-16 sm:w-16">
        {/* External repository icons are user-provided, so a plain img keeps configuration simple. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt={`${name} icon`}
          className="h-full w-full rounded-md object-cover"
          onError={() => setHasFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/40 p-1.5 ring-1 ring-foreground/10 sm:h-16 sm:w-16"
      title={iconUrl ? "Icon failed to load" : "No icon provided"}
    >
      <span
        className="grid h-full w-full place-items-center rounded-md text-center text-sm font-black tracking-tight text-white"
        style={fallbackStyle}
      >
        <span className="drop-shadow">{getInitials(name)}</span>
      </span>
    </div>
  );
}

function InlineTranslation({ text, compact = false }: { text: string; compact?: boolean }) {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const fallbackUrl = getTranslateUrl(text);

  async function handleTranslate(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsTranslating(true);
    setError(null);

    try {
      const response = await translateText(text);
      setTranslatedText(response.translatedText);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not translate this text.");
    } finally {
      setIsTranslating(false);
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-60"
          disabled={isTranslating}
          type="button"
          onClick={handleTranslate}
        >
          {isTranslating ? "Translating..." : translatedText ? "Translate again" : "Translate to English"}
        </button>
        {error ? (
          <a
            className="text-xs font-medium text-primary hover:underline"
            href={fallbackUrl}
            rel="noreferrer"
            target="_blank"
            onClick={(event) => event.stopPropagation()}
          >
            Open Google Translate
          </a>
        ) : null}
      </div>
      {translatedText ? (
        <p className={compact ? "line-clamp-4 rounded-lg bg-muted/40 p-3 text-sm leading-6 text-foreground" : "whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-foreground"}>
          {translatedText}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function AppDetailsContent({ app }: { app: AppDto }) {
  const appStore = app.appStore ?? null;
  const rating = formatRating(appStore?.averageUserRating, appStore?.userRatingCount);
  const displayName = appStore?.name ?? app.name;
  const primaryGenreName = appStore?.primaryGenreName ?? null;
  const appStoreDescription = appStore?.description ?? null;
  const repositoryNotes = [app.subtitle, app.description].filter(Boolean).join("\n\n");
  const hasRepositoryNotes = repositoryNotes.length > 0;
  const repositoryNotesTranslateUrl = shouldOfferTranslation(repositoryNotes) ? getTranslateUrl(repositoryNotes) : null;
  const hasAppStoreDetails = Boolean(primaryGenreName || rating || appStore?.version || appStore?.minimumOsVersion);
  const screenshotUrls = getScreenshotUrls(app).slice(0, 8);

  return (
    <>
      <div className="space-y-5 text-sm leading-6 text-muted-foreground">
      {hasAppStoreDetails ? (
        <section className="rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10">
          <h4 className="mb-3 text-sm font-semibold text-foreground">App details</h4>
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            {primaryGenreName ? (
              <div>
                <dt className="font-semibold text-foreground">Category</dt>
                <dd>{primaryGenreName}</dd>
              </div>
            ) : null}
            {rating ? (
              <div>
                <dt className="font-semibold text-foreground">Rating</dt>
                <dd className="inline-flex items-center gap-1">
                  <StarIcon className="size-3" weight="fill" />
                  {rating}
                </dd>
              </div>
            ) : null}
            {appStore?.version ? (
              <div>
                <dt className="font-semibold text-foreground">App Store version</dt>
                <dd>{appStore.version}</dd>
              </div>
            ) : null}
            {appStore?.minimumOsVersion ? (
              <div>
                <dt className="font-semibold text-foreground">App Store iOS</dt>
                <dd>{appStore.minimumOsVersion}+</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10">
        <h4 className="mb-3 text-sm font-semibold text-foreground">IPA repository details</h4>
        <dl className="grid gap-3 text-xs">
          <div>
            <dt className="font-semibold text-foreground">Repository title</dt>
            <dd className="break-words">{app.name}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Source</dt>
            <dd>{app.sourceName}</dd>
          </div>
          {app.bundleIdentifier ? (
            <div>
              <dt className="font-semibold text-foreground">Bundle ID</dt>
              <dd className="break-all">{app.bundleIdentifier}</dd>
            </div>
          ) : null}
          {app.latestVersion ? (
            <div>
              <dt className="font-semibold text-foreground">IPA version</dt>
              <dd>{app.latestVersion}</dd>
            </div>
          ) : null}
          {app.minOSVersion ? (
            <div>
              <dt className="font-semibold text-foreground">IPA iOS requirement</dt>
              <dd>{app.minOSVersion}+</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {screenshotUrls.length > 0 ? (
        <section>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Screenshots</h4>
          <PhotoProvider>
            <div className="-mx-1 flex gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2">
              {screenshotUrls.map((screenshotUrl, index) => (
                <PhotoView key={screenshotUrl} src={screenshotUrl}>
                  <button className="shrink-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30" type="button">
                    {/* External App Store/repository screenshots are remote URLs, so img avoids domain config. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotUrl}
                      alt={`${displayName} screenshot ${index + 1}`}
                      className="h-72 w-36 rounded-lg object-cover ring-1 ring-foreground/10 sm:h-80 sm:w-40"
                      loading="lazy"
                    />
                  </button>
                </PhotoView>
              ))}
            </div>
          </PhotoProvider>
        </section>
      ) : null}

      {appStoreDescription ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">App Store description</h4>
          <p className="whitespace-pre-wrap">{appStoreDescription}</p>
        </section>
      ) : null}
      {hasRepositoryNotes ? (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">Repository notes</h4>
          </div>
          {repositoryNotesTranslateUrl ? <InlineTranslation text={repositoryNotes} /> : null}
          {app.name !== displayName ? <p className="mb-3 font-medium text-foreground">{app.name}</p> : null}
          <p className="whitespace-pre-wrap">{repositoryNotes}</p>
        </section>
      ) : null}
      </div>

    </>
  );
}

/** Opaque pills — avoid backdrop-filter here (very costly × many cards while scrolling). */
const overlayBadgeClassName =
  `${appBadgeClassName} border-0 bg-card/92 text-card-foreground shadow-sm ring-1 ring-foreground/12`;

const cardHeroHeightClass = "h-[13rem] sm:h-[15rem]";

function HeroAmbientBackground({
  bundleIdentifier,
  iconUrl,
  name
}: {
  bundleIdentifier: string | null;
  iconUrl: string | null;
  name: string;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setHasFailed(false);
  }, [iconUrl]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 opacity-[0.96]" style={getHueFallbackBackground(bundleIdentifier, name)} />
      {iconUrl && !hasFailed ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconUrl}
            alt=""
            className="absolute left-1/2 top-1/2 min-h-[115%] min-w-[115%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-[0.44] blur-lg saturate-[1.08]"
            loading="lazy"
            onError={() => setHasFailed(true)}
          />
        </>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-card/50 via-card/10 to-card/60" />
    </div>
  );
}

/** Gradients only — backdrop-blur on scrollable lists kills scroll performance. */
function CardHeroBottomFade() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[62%] bg-gradient-to-t from-card to-transparent opacity-[0.92]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[50%] bg-gradient-to-t from-card/85 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[38%] bg-gradient-to-t from-card/55 via-card/15 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-24 bg-gradient-to-t from-card via-card/30 to-transparent sm:h-[6.75rem]"
        aria-hidden
      />
    </>
  );
}

export const AppCard = memo(function AppCard({
  app,
  showShareLink = true,
  showScreenshotHero = true
}: {
  app: AppDto;
  showShareLink?: boolean;
  /** When false, skips the preview strip (e.g. detail page already shows a full gallery). */
  showScreenshotHero?: boolean;
}) {
  const appStore = app.appStore ?? null;
  const fileSize = formatBytes(app.size);
  const rating = formatRating(appStore?.averageUserRating, appStore?.userRatingCount);
  const downloadableOptions = app.downloadOptions.filter((option) => option.downloadURL);
  const hasMultipleSources = app.downloadOptions.length > 1;
  const displayName = appStore?.name ?? app.name;
  const displayDeveloper = appStore?.developerName ?? app.developerName ?? "Unknown developer";
  const displayIconUrl = appStore?.artworkUrl512 ?? appStore?.artworkUrl100 ?? app.iconUrl;
  const primaryGenreName = appStore?.primaryGenreName ?? null;
  const appInfoUrl = appStore?.trackViewUrl ?? app.appStoreUrl ?? getAppStoreSearchUrl(app);
  const primaryDescription = appStore?.description ?? app.description;
  const isRepositoryDescription = !appStore?.description && Boolean(app.description);
  const primaryDescriptionTranslateUrl =
    isRepositoryDescription && shouldOfferTranslation(app.description) ? getTranslateUrl(app.description) : null;
  const appPageId = app.bundleIdentifier ?? (app.id.startsWith("bundle:") ? app.id.slice("bundle:".length) : app.id);
  const appPagePath = `/apps/${encodeURIComponent(appPageId)}`;
  const [isDownloadPickerOpen, setIsDownloadPickerOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  const allScreenshotUrls = getScreenshotUrls(app);
  const previewScreenshotUrls = showScreenshotHero ? allScreenshotUrls.slice(0, 3) : [];
  const hasPreviewScreenshots = previewScreenshotUrls.length > 0;
  const moreScreenshotCount = showScreenshotHero ? allScreenshotUrls.length - previewScreenshotUrls.length : 0;

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
      {/* Shadow/lift on wrapper — ui Card uses overflow-hidden which clips box-shadow. */}
      <div
        className={[
          "app-card-hover-wrap h-full min-h-[23rem] min-w-0 rounded-lg",
          "transition-[transform,box-shadow] duration-200 ease-out",
          "hover:-translate-y-1 hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.38)]",
          "dark:hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.72)]",
          "focus-within:-translate-y-1 focus-within:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.38)]",
          "dark:focus-within:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.72)]"
        ].join(" ")}
      >
        <Card
          className="flex h-full min-h-[23rem] min-w-0 cursor-pointer flex-col [contain:layout_paint]"
          role="button"
        tabIndex={0}
        onClick={() => setIsDescriptionOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsDescriptionOpen(true);
          }
        }}
      >
        {showScreenshotHero ? (
          <div
            className={`relative -mt-4 w-full shrink-0 overflow-hidden bg-muted/45 ${cardHeroHeightClass}`}
          >
            <div className="absolute inset-0 z-0">
              {hasPreviewScreenshots ? (
                <div className="flex h-full w-full divide-x divide-foreground/15">
                  {previewScreenshotUrls.map((url, index) => (
                    <div key={url} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={
                          previewScreenshotUrls.length === 1
                            ? `${displayName} screenshot preview`
                            : `${displayName} screenshot preview ${index + 1}`
                        }
                        className="h-full w-full object-cover object-top"
                        loading="lazy"
                      />
                      {previewScreenshotUrls.length > 1 && index < previewScreenshotUrls.length - 1 ? (
                        <div
                          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-6 bg-gradient-to-l from-background/55 to-transparent sm:w-10"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <HeroAmbientBackground
                  bundleIdentifier={app.bundleIdentifier}
                  iconUrl={displayIconUrl}
                  name={displayName}
                />
              )}
            </div>

            {!hasPreviewScreenshots ? (
              <div className="pointer-events-none absolute inset-0 z-[1] grid place-items-center">
                <div className="rounded-2xl bg-card/95 p-3 shadow-lg ring-1 ring-foreground/12">
                  <AppIcon
                    bundleIdentifier={app.bundleIdentifier}
                    iconUrl={displayIconUrl}
                    name={displayName}
                  />
                </div>
              </div>
            ) : null}

            <CardHeroBottomFade />

            <div className="absolute inset-x-0 bottom-0 z-[3] flex flex-wrap gap-1.5 p-3 pt-5 sm:p-4 sm:pt-6">
              <Badge className={overlayBadgeClassName}>{fileSize ?? "Size unknown"}</Badge>
              <Badge className={overlayBadgeClassName} variant="secondary">
                {app.downloadOptions.length} {app.downloadOptions.length === 1 ? "source" : "sources"}
              </Badge>
              {app.minOSVersion ? (
                <Badge className={overlayBadgeClassName} variant="outline">
                  iOS {app.minOSVersion}+
                </Badge>
              ) : null}
              {app.latestVersion ? (
                <Badge className={overlayBadgeClassName} variant="outline">
                  v{app.latestVersion}
                </Badge>
              ) : null}
              {hasPreviewScreenshots && moreScreenshotCount > 0 ? (
                <Badge className={overlayBadgeClassName} variant="outline">
                  +{moreScreenshotCount} more
                </Badge>
              ) : null}
            </div>
            {showShareLink ? (
              <Button
                asChild
                className="absolute right-3 top-3 z-[4] h-9 w-9 shrink-0 rounded-full border-0 bg-card/92 px-0 shadow-sm ring-1 ring-foreground/12 sm:right-4 sm:top-4"
                variant="outline"
                size="sm"
              >
                <a
                  href={appPagePath}
                  aria-label={`Open share page for ${displayName}`}
                  rel="noreferrer"
                  target="_blank"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ArrowUpRightIcon className="size-4" />
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        <CardHeader className={`relative gap-4 p-4 sm:p-6 ${showScreenshotHero ? "!gap-3 pt-4 sm:pt-5" : ""}`}>
          {!showScreenshotHero && showShareLink ? (
            <Button
              asChild
              className="absolute right-4 top-4 h-9 w-9 shrink-0 rounded-full px-0 sm:right-6 sm:top-6"
              variant="outline"
              size="sm"
            >
              <a
                href={appPagePath}
                aria-label={`Open share page for ${displayName}`}
                rel="noreferrer"
                target="_blank"
                onClick={(event) => event.stopPropagation()}
              >
                <ArrowUpRightIcon className="size-4" />
              </a>
            </Button>
          ) : null}
          {showScreenshotHero ? (
            <div className="min-w-0 space-y-3">
              <div className="min-w-0">
                <CardTitle className="line-clamp-2 break-words text-xl leading-tight">{displayName}</CardTitle>
                <p className="mt-1 truncate text-sm text-muted-foreground">{displayDeveloper}</p>
              </div>
              {(primaryGenreName || rating) ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {primaryGenreName ? (
                    <Badge className={appBadgeClassName} variant="secondary">
                      <span className="truncate">{primaryGenreName}</span>
                    </Badge>
                  ) : null}
                  {rating ? (
                    <Badge className={appMetricBadgeClassName} variant="outline">
                      <StarIcon className="size-3 shrink-0" weight="fill" />
                      <span className="truncate">{rating}</span>
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={showShareLink ? "flex min-w-0 gap-4 pr-12" : "flex min-w-0 gap-4"}>
              <AppIcon bundleIdentifier={app.bundleIdentifier} iconUrl={displayIconUrl} name={displayName} />
              <div className="min-w-0 flex-1 space-y-3 overflow-hidden">
                <div className="min-w-0">
                  <CardTitle className="line-clamp-2 break-words text-xl leading-tight">{displayName}</CardTitle>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{displayDeveloper}</p>
                </div>
                <div className="space-y-2 overflow-hidden">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge className={appBadgeClassName}>{fileSize ?? "Size unknown"}</Badge>
                    <Badge className={appBadgeClassName} variant="secondary">
                      {app.downloadOptions.length} {app.downloadOptions.length === 1 ? "source" : "sources"}
                    </Badge>
                    {app.minOSVersion ? (
                      <Badge className={appBadgeClassName} variant="outline">
                        iOS {app.minOSVersion}+
                      </Badge>
                    ) : null}
                    {app.latestVersion ? (
                      <Badge className={appBadgeClassName} variant="outline">
                        v{app.latestVersion}
                      </Badge>
                    ) : null}
                  </div>
                  {(primaryGenreName || rating) ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {primaryGenreName ? (
                        <Badge className={appBadgeClassName} variant="secondary">
                          <span className="truncate">{primaryGenreName}</span>
                        </Badge>
                      ) : null}
                      {rating ? (
                        <Badge className={appMetricBadgeClassName} variant="outline">
                          <StarIcon className="size-3 shrink-0" weight="fill" />
                          <span className="truncate">{rating}</span>
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-2">
            {!primaryDescription && app.subtitle ? (
              <p className="line-clamp-2 text-sm font-medium">{app.subtitle}</p>
            ) : null}
            {primaryDescription ? (
              <>
                {isRepositoryDescription ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Repository notes</span>
                    {primaryDescriptionTranslateUrl ? (
                      <a
                        className="font-medium text-primary hover:underline"
                        href={primaryDescriptionTranslateUrl}
                        rel="noreferrer"
                        target="_blank"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Translate
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {primaryDescriptionTranslateUrl ? <InlineTranslation compact text={app.description ?? primaryDescription} /> : null}
                <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">{primaryDescription}</p>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No description available from this source. Use App Store search to learn more about this app.
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="grid grid-cols-2 gap-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <Button asChild className="w-full" variant="secondary">
            <a href={appInfoUrl} rel="noreferrer" target="_blank" onClick={(event) => event.stopPropagation()}>
              {appStore?.trackViewUrl || app.appStoreUrl ? "View App Store" : "Search App Store"}
            </a>
          </Button>
          {hasMultipleSources ? (
            <Button
              className="w-full"
              disabled={downloadableOptions.length === 0}
              onClick={(event) => {
                event.stopPropagation();
                setIsDownloadPickerOpen(true);
              }}
            >
              Download IPA
            </Button>
          ) : app.downloadURL ? (
            <Button asChild className="w-full">
              <a href={app.downloadURL} rel="noreferrer" target="_blank" onClick={(event) => event.stopPropagation()}>
                Download IPA
              </a>
            </Button>
          ) : (
            <Button className="w-full" variant="secondary" disabled>
              No IPA
            </Button>
          )}
        </CardFooter>
      </Card>
      </div>

      {isDescriptionOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden overscroll-contain bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${app.id}-description-title`}
          onMouseDown={() => setIsDescriptionOpen(false)}
        >
          <div
            className="flex max-h-[85vh] min-h-0 w-full max-w-2xl flex-col rounded-lg bg-card p-5 text-card-foreground ring-1 ring-foreground/10"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start gap-4">
              <AppIcon bundleIdentifier={app.bundleIdentifier} iconUrl={displayIconUrl} name={displayName} />
              <div className="min-w-0 flex-1">
                <h3 id={`${app.id}-description-title`} className="text-lg font-semibold">
                  {displayName}
                </h3>
                <p className="mt-1 truncate text-sm text-muted-foreground">{displayDeveloper}</p>
              </div>
            </div>

            <div className="mt-5 min-h-0 overflow-y-auto overscroll-contain pr-1">
              <AppDetailsContent app={app} />
            </div>

            <Button className="mt-5 w-full shrink-0" variant="secondary" onClick={() => setIsDescriptionOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {isDownloadPickerOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden overscroll-contain bg-background/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${app.id}-download-title`}
          onMouseDown={() => setIsDownloadPickerOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-card p-5 text-card-foreground ring-1 ring-foreground/10"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <AppIcon bundleIdentifier={app.bundleIdentifier} iconUrl={displayIconUrl} name={displayName} />
              <div className="min-w-0 flex-1">
                <h3 id={`${app.id}-download-title`} className="text-lg font-semibold">
                  Choose download source
                </h3>
                <p className="mt-1 truncate text-sm text-muted-foreground">{displayName}</p>
              </div>
            </div>

            <div className="mt-5 grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
              {downloadableOptions.map((option) => {
                const optionSize = formatBytes(option.size);

                return (
                  <Button
                    key={`${option.sourceId}:${option.downloadURL}`}
                    asChild
                    className="h-auto w-full justify-between gap-4 px-4 py-3 text-left"
                    variant="outline"
                  >
                    <a
                      href={option.downloadURL ?? undefined}
                      rel="noreferrer"
                      target="_blank"
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
                  </Button>
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
});
