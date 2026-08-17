import type { Metadata } from "next";
import Link from "next/link";
import { fetchDevelopers } from "@/lib/api";
import { CATEGORY_LABELS } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "iOS App Developers",
  description: "Browse developers represented in iappstores IPA repository listings.",
  alternates: {
    canonical: "/developers"
  },
  openGraph: {
    title: "iOS App Developers | iappstores",
    description: "Browse developers represented in indexed IPA repositories.",
    url: "/developers"
  }
};

export default async function DevelopersPage() {
  const developers = await fetchDevelopers();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">Developers</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">iOS app developers</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Browse developer pages derived from indexed IPA repository metadata. Developer pages collect canonical app
            links, source names, and categories in one crawlable place.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {developers.map((developer) => (
            <Card key={developer.slug} className="h-full">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/developer/${encodeURIComponent(developer.slug)}`}>{developer.name}</Link>
                </CardTitle>
                <CardDescription>{developer.appCount.toLocaleString()} app pages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {developer.categories.map((category) => (
                    <Badge key={category} variant="outline">{CATEGORY_LABELS[category]}</Badge>
                  ))}
                </div>
                {developer.sourceNames.length > 0 ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    Sources: {developer.sourceNames.slice(0, 4).join(", ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
