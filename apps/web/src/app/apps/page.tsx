import type { Metadata } from "next";
import Link from "next/link";
import { fetchApps, fetchSources } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  INDEXABLE_CATEGORIES,
  getAppDisplayName,
  getAppPath
} from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apps Sitemap",
  description: "Browse iappstores app pages by category, recent updates, repository, and alphabetical navigation.",
  alternates: {
    canonical: "/apps"
  },
  openGraph: {
    title: "Apps Sitemap | iappstores",
    description: "Browse crawlable iOS IPA app listings from indexed AltStore and SideStore repositories.",
    url: "/apps"
  }
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default async function AppsSitemapPage() {
  const [recentApps, allApps, sources] = await Promise.all([
    fetchApps({ category: "recent", pageSize: 24, includeAppStore: false }),
    fetchApps({ pageSize: 60, includeAppStore: false }),
    fetchSources()
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">HTML sitemap</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Browse iOS IPA app pages</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Use this crawlable directory to find app pages by category, recent updates, repositories, and app names.
            Each link points to a canonical iappstores page with source details and download options.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Category landing pages with paginated app links.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {INDEXABLE_CATEGORIES.map((category) => (
                <Link
                  key={category}
                  className="rounded-lg bg-muted/40 p-3 text-sm ring-1 ring-foreground/10 hover:bg-muted"
                  href={`/category/${category}`}
                >
                  <span className="font-semibold text-foreground">{CATEGORY_LABELS[category]}</span>
                  <span className="mt-1 line-clamp-2 block text-muted-foreground">{CATEGORY_DESCRIPTIONS[category]}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alphabetical</CardTitle>
              <CardDescription>Jump into app names by first letter.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {LETTERS.map((letter) => (
                <a
                  key={letter}
                  className="grid size-8 place-items-center rounded-md bg-muted/50 text-sm font-semibold ring-1 ring-foreground/10 hover:bg-muted"
                  href={`#letter-${letter}`}
                >
                  {letter}
                </a>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Recently updated apps</CardTitle>
            <CardDescription>Fresh app pages from indexed repositories.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentApps.apps.map((app) => (
              <Link key={app.id} className="rounded-md p-2 text-sm hover:bg-muted/60" href={getAppPath(app)}>
                <span className="font-medium text-foreground">{getAppDisplayName(app)}</span>
                <span className="block text-xs text-muted-foreground">{app.sourceName}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Repositories</CardTitle>
              <CardDescription>Source pages with app listings and category breakdowns.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {sources.slice(0, 40).map((source) => (
                <Link key={source.id} className="rounded-md p-2 text-sm hover:bg-muted/60" href={`/repository/${encodeURIComponent(source.id)}`}>
                  <span className="font-medium text-foreground">{source.name}</span>
                  {source.subtitle ? <span className="line-clamp-1 block text-xs text-muted-foreground">{source.subtitle}</span> : null}
                </Link>
              ))}
              <Link className="rounded-md p-2 text-sm font-medium text-primary hover:bg-muted/60" href="/repositories">
                View all repositories
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>App name index</CardTitle>
              <CardDescription>Representative canonical app pages grouped by first letter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {LETTERS.map((letter) => {
                const apps = allApps.apps
                  .filter((app) => getAppDisplayName(app).toUpperCase().startsWith(letter))
                  .slice(0, 6);
                return apps.length > 0 ? (
                  <div key={letter} id={`letter-${letter}`}>
                    <h2 className="mb-2 text-sm font-semibold text-foreground">{letter}</h2>
                    <div className="grid gap-1">
                      {apps.map((app) => (
                        <Link key={app.id} className="rounded-md p-2 text-sm hover:bg-muted/60" href={getAppPath(app)}>
                          {getAppDisplayName(app)}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null;
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
