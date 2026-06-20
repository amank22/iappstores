import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AppDto } from "@iappstores/contracts";
import { AppCard, AppDetailsContent } from "@/components/app-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchApp, fetchApps } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";
import {
  CATEGORY_LABELS,
  getAppDescription,
  getAppDisplayName,
  getAppImage,
  getAppPath,
  getAppUrl,
  getDeveloperSlug,
  getShareId
} from "@/lib/seo";

type AppPageProps = {
  params: Promise<{
    appId: string;
  }>;
};

async function getAppOrNotFound(appId: string): Promise<AppDto> {
  try {
    const response = await fetchApp(appId);
    return response.app;
  } catch {
    notFound();
  }
}

export async function generateMetadata({ params }: AppPageProps): Promise<Metadata> {
  const { appId } = await params;
  const app = await getAppOrNotFound(appId);
  const name = getAppDisplayName(app);
  const description = getAppDescription(app);
  const image = getAppImage(app);
  const path = `/apps/${encodeURIComponent(getShareId(app))}`;

  return {
    title: `${name} IPA Download for iPhone & iPad`,
    description,
    alternates: {
      canonical: path
    },
    openGraph: {
      title: `${name} IPA Download`,
      description,
      url: path,
      siteName: "iappstores",
      images: [
        {
          url: image,
          width: image === "/og.svg" ? 1200 : 512,
          height: image === "/og.svg" ? 630 : 512,
          alt: `${name} app icon`
        }
      ],
      type: "website"
    },
    twitter: {
      card: image === "/og.svg" ? "summary_large_image" : "summary",
      title: `${name} IPA Download`,
      description,
      images: [image]
    }
  };
}

export default async function AppPage({ params }: AppPageProps) {
  const { appId } = await params;
  const app = await getAppOrNotFound(appId);
  const relatedResponse = await fetchApps({ category: app.category, pageSize: 12 }).catch(() => null);
  const relatedApps =
    relatedResponse?.apps
      .filter((candidate) => getShareId(candidate).toLowerCase() !== getShareId(app).toLowerCase())
      .slice(0, 8) ?? [];
  const name = getAppDisplayName(app);
  const shareUrl = getAbsoluteUrl(`/apps/${encodeURIComponent(getShareId(app))}`);
  const developerName = app.appStore?.developerName ?? app.developerName;
  const developerSlug = getDeveloperSlug(app);
  const screenshot = app.appStore?.screenshotUrls[0] ?? app.appStore?.ipadScreenshotUrls[0] ?? app.screenshots[0] ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    applicationCategory: CATEGORY_LABELS[app.category],
    operatingSystem: app.minOSVersion ? `iOS ${app.minOSVersion}+` : "iOS",
    softwareVersion: app.latestVersion ?? app.appStore?.version ?? undefined,
    description: getAppDescription(app, 500),
    image: getAbsoluteUrl(getAppImage(app)),
    screenshot: screenshot ?? undefined,
    url: getAppUrl(app),
    author: developerName
      ? {
          "@type": "Organization",
          name: developerName
        }
      : undefined,
    offers: {
      "@type": "Offer",
      price: app.appStore?.price ?? 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock"
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="secondary">
            <Link href="/">Back to apps</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={shareUrl}>Share link</a>
          </Button>
        </div>

        <section className="rounded-lg bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6">
          <p className="text-sm font-medium text-primary">Shareable app page</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">{name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Direct IPA download details, repository notes, and App Store metadata for this iOS app.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/category/${app.category}`}>{CATEGORY_LABELS[app.category]}</Link>
            </Button>
            {app.sourceId !== "multiple" ? (
              <Button asChild variant="outline">
                <Link href={`/repository/${encodeURIComponent(app.sourceId)}`}>{app.sourceName}</Link>
              </Button>
            ) : null}
            {developerName && developerSlug ? (
              <Button asChild variant="outline">
                <Link href={`/developer/${encodeURIComponent(developerSlug)}`}>{developerName}</Link>
              </Button>
            ) : null}
          </div>
        </section>

        <AppCard app={app} showScreenshotHero={false} showShareLink={false} />

        <Card>
          <CardHeader>
            <CardTitle>Full app details</CardTitle>
          </CardHeader>
          <CardContent>
            <AppDetailsContent app={app} />
          </CardContent>
        </Card>

        {relatedApps.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Similar apps</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {relatedApps.map((relatedApp) => (
                <Link key={relatedApp.id} className="rounded-md p-2 text-sm hover:bg-muted/60" href={getAppPath(relatedApp)}>
                  <span className="font-medium text-foreground">{getAppDisplayName(relatedApp)}</span>
                  <span className="block text-xs text-muted-foreground">{relatedApp.sourceName}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
