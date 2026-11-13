import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchApps } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";
import { CATEGORY_LABELS, DIRECTORY_PAGE_SIZE, getAppDisplayName, getAppPath } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Plain, server-rendered links to every app: the app pages are otherwise reachable only
// through the sitemap, because the home page loads more apps with JavaScript.

type PageProps = { params: Promise<{ page: string }> };

function parsePage(value: string): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 0;
}

function directoryPath(page: number): string {
  return `/directory/${page}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePage((await params).page);
  if (page < 1) notFound();
  const path = directoryPath(page);
  return {
    title: `IPA App Directory - Page ${page}`,
    description: `Alphabetical directory of iOS IPA apps from AltStore and SideStore repositories, page ${page}.`,
    alternates: { canonical: path },
    openGraph: { title: `IPA App Directory - Page ${page} | iappstores`, url: path }
  };
}

function pageWindow(current: number, total: number): number[] {
  const pages = new Set<number>([1, total]);
  for (let page = current - 3; page <= current + 3; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export default async function DirectoryPage({ params }: PageProps) {
  const page = parsePage((await params).page);
  if (page < 1) notFound();

  const response = await fetchApps({ sort: "name-asc", page, pageSize: DIRECTORY_PAGE_SIZE, includeAppStore: false }).catch(() => null);
  if (!response) throw new Error("The app directory is temporarily unavailable.");
  const { apps, pagination } = response;
  // The API clamps an out-of-range page to the last one; that would be a duplicate page.
  if (apps.length === 0 || page > pagination.totalPages) notFound();
  const total = pagination.totalPages;
  const first = apps[0] ? getAppDisplayName(apps[0]) : "";
  const last = apps[apps.length - 1] ? getAppDisplayName(apps[apps.length - 1]!) : "";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Apps", item: getAbsoluteUrl("/apps") },
              { "@type": "ListItem", position: 2, name: `Directory page ${page}`, item: getAbsoluteUrl(directoryPath(page)) }
            ]
          })
        }}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">App directory</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">IPA apps A–Z, page {page}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {first} to {last}. Page {page} of {total}, {pagination.totalItems.toLocaleString("en-US")} apps in total.
          </p>
        </section>

        <ul className="divide-y divide-foreground/10 rounded-lg bg-card ring-1 ring-foreground/10">
          {apps.map((app) => (
            <li key={app.id}>
              <Link className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3 text-sm hover:bg-muted/60 sm:px-5" href={getAppPath(app)}>
                <span className="font-medium text-foreground">{getAppDisplayName(app)}</span>
                <span className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[app.category]}
                  {app.latestVersion ? ` · v${app.latestVersion}` : ""}
                  {app.developerName ? ` · ${app.developerName}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <nav aria-label="Directory pages" className="flex flex-wrap items-center gap-2 text-sm">
          {page > 1 ? (
            <Link rel="prev" className="rounded-md px-3 py-1.5 ring-1 ring-foreground/10 hover:bg-muted" href={directoryPath(page - 1)}>
              Previous
            </Link>
          ) : null}
          {pageWindow(page, total).map((target) => (
            <Link
              key={target}
              aria-current={target === page ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 ring-1 ring-foreground/10 hover:bg-muted ${target === page ? "bg-muted font-semibold" : ""}`}
              href={directoryPath(target)}
            >
              {target}
            </Link>
          ))}
          {page < total ? (
            <Link rel="next" className="rounded-md px-3 py-1.5 ring-1 ring-foreground/10 hover:bg-muted" href={directoryPath(page + 1)}>
              Next
            </Link>
          ) : null}
        </nav>
        <Link className="text-sm text-primary hover:underline" href="/apps">
          Back to all apps
        </Link>
      </div>
    </main>
  );
}
