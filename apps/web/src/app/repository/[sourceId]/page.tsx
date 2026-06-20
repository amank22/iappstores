import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSourceApps, fetchSources } from "@/lib/api";
import { CATEGORY_LABELS, getAppDescription, getAppDisplayName, getAppPath } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    sourceId: string;
  }>;
};

async function getSource(sourceId: string) {
  const sources = await fetchSources();
  return sources.find((source) => source.id === sourceId) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sourceId } = await params;
  const source = await getSource(sourceId);
  if (!source) {
    notFound();
  }

  const description = source.subtitle ?? `Browse IPA app listings from ${source.name}, including versions, categories, and source download links.`;

  return {
    title: `${source.name} IPA Repository`,
    description,
    alternates: {
      canonical: `/repository/${encodeURIComponent(source.id)}`
    },
    openGraph: {
      title: `${source.name} IPA Repository | iappstores`,
      description,
      url: `/repository/${encodeURIComponent(source.id)}`
    }
  };
}

export default async function RepositoryPage({ params }: PageProps) {
  const { sourceId } = await params;
  const [source, response] = await Promise.all([
    getSource(sourceId),
    fetchSourceApps(sourceId).catch(() => null)
  ]);

  if (!source || !response) {
    notFound();
  }

  const visibleCategories = response.categories.filter((category) => category.id !== "all" && category.appCount > 0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Repository</Badge>
            <Badge variant="outline">{response.pagination.totalItems.toLocaleString()} apps</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{source.name}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {source.subtitle ?? `Browse IPA listings from ${source.name}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {source.website ? (
              <Button asChild variant="outline">
                <a href={source.website} rel="noreferrer" target="_blank">Website</a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <a href={source.url} rel="noreferrer" target="_blank">Repository JSON</a>
            </Button>
          </div>
        </section>

        {visibleCategories.length > 0 ? (
          <section className="flex flex-wrap gap-2">
            {visibleCategories.map((category) => (
              <Link key={category.id} href={`/category/${category.id}`}>
                <Badge variant="outline">
                  {CATEGORY_LABELS[category.id]}: {category.appCount.toLocaleString()}
                </Badge>
              </Link>
            ))}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {response.apps.map((app) => (
            <Card key={app.id} className="h-full">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={getAppPath(app)}>{getAppDisplayName(app)}</Link>
                </CardTitle>
                <CardDescription>{CATEGORY_LABELS[app.category]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p className="line-clamp-3 leading-6">{getAppDescription(app, 220)}</p>
                <div className="flex flex-wrap gap-2">
                  {app.latestVersion ? <Badge variant="outline">v{app.latestVersion}</Badge> : null}
                  {app.minOSVersion ? <Badge variant="outline">iOS {app.minOSVersion}+</Badge> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
