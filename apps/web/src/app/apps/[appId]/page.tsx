import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AppDto } from "@iappstores/contracts";
import { AppCard } from "@/components/app-card";
import { buttonClasses } from "@/components/ui/button";
import { fetchApp } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";

type AppPageProps = {
  params: Promise<{
    appId: string;
  }>;
};

function getDisplayName(app: AppDto): string {
  return app.appStore?.name ?? app.name;
}

function getDescription(app: AppDto): string {
  const description =
    app.appStore?.description ??
    app.description ??
    `${getDisplayName(app)} IPA download from ${app.sourceName}. View tweaked, modded, or patched iOS app details and download sources.`;

  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length > 158 ? `${normalized.slice(0, 155)}...` : normalized;
}

function getImage(app: AppDto): string {
  return app.appStore?.artworkUrl512 ?? app.appStore?.artworkUrl100 ?? app.iconUrl ?? "/og.svg";
}

function getShareId(app: AppDto): string {
  return app.bundleIdentifier ?? (app.id.startsWith("bundle:") ? app.id.slice("bundle:".length) : app.id);
}

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
  const name = getDisplayName(app);
  const description = getDescription(app);
  const image = getImage(app);
  const path = `/apps/${encodeURIComponent(getShareId(app))}`;

  return {
    title: `${name} IPA Download`,
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
  const name = getDisplayName(app);
  const shareUrl = getAbsoluteUrl(`/apps/${encodeURIComponent(getShareId(app))}`);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.24),_transparent_36rem)]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Back to apps
          </Link>
          <a href={shareUrl} className={buttonClasses({ variant: "outline" })}>
            Share link
          </a>
        </div>

        <section className="rounded-3xl border border-border/80 bg-card/70 p-4 shadow-2xl backdrop-blur sm:p-6">
          <p className="text-sm font-medium text-primary">Shareable app page</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">{name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Direct IPA download details, repository notes, and App Store metadata for this iOS app.
          </p>
        </section>

        <AppCard app={app} />
      </div>
    </main>
  );
}
