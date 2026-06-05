import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDeveloperApps, fetchDevelopers } from "@/lib/api";
import { CATEGORY_LABELS, getAppDescription, getAppDisplayName, getAppPath } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    developerSlug: string;
  }>;
};

async function getDeveloper(slug: string) {
  const developers = await fetchDevelopers();
  return developers.find((developer) => developer.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { developerSlug } = await params;
  const developer = await getDeveloper(developerSlug);
  if (!developer) {
    notFound();
  }

  const description = `Browse ${developer.name} IPA app listings, categories, and repository sources indexed by iappstores.`;

  return {
    title: `${developer.name} IPA Apps`,
    description,
    alternates: {
      canonical: `/developer/${encodeURIComponent(developer.slug)}`
    },
    openGraph: {
      title: `${developer.name} IPA Apps | iappstores`,
      description,
      url: `/developer/${encodeURIComponent(developer.slug)}`
    }
  };
}

export default async function DeveloperPage({ params }: PageProps) {
  const { developerSlug } = await params;
  const [developer, response] = await Promise.all([
    getDeveloper(developerSlug),
    fetchDeveloperApps(developerSlug, { pageSize: 60 }).catch(() => null)
  ]);

  if (!developer || !response) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Developer</Badge>
            <Badge variant="outline">{developer.appCount.toLocaleString()} app pages</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{developer.name}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            App listings, repository sources, and categories for {developer.name} across indexed IPA repositories.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-4 md:grid-cols-2">
            {response.apps.map((app) => (
              <Card key={app.id} className="h-full">
                <CardHeader>
                  <CardTitle className="text-base">
                    <Link href={getAppPath(app)}>{getAppDisplayName(app)}</Link>
                  </CardTitle>
                  <CardDescription>{app.sourceName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p className="line-clamp-3 leading-6">{getAppDescription(app, 220)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{CATEGORY_LABELS[app.category]}</Badge>
                    {app.latestVersion ? <Badge variant="outline">v{app.latestVersion}</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {developer.categories.map((category) => (
                  <Link key={category} href={`/category/${category}`}>
                    <Badge variant="outline">{CATEGORY_LABELS[category]}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {developer.sourceNames.slice(0, 12).map((sourceName) => (
                  <p key={sourceName}>{sourceName}</p>
                ))}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
