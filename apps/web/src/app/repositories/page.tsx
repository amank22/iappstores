import type { Metadata } from "next";
import Link from "next/link";
import { fetchSources } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "IPA Repositories",
  description: "Browse indexed AltStore and SideStore compatible IPA repositories on iappstores.",
  alternates: {
    canonical: "/repositories"
  },
  openGraph: {
    title: "IPA Repositories | iappstores",
    description: "Browse source repositories indexed by iappstores.",
    url: "/repositories"
  }
};

export default async function RepositoriesPage() {
  const sources = await fetchSources();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">Sources</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">IPA repositories</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Browse AltStore and SideStore compatible repositories indexed by iappstores. Repository pages show source
            details, category coverage, and canonical app links.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <Card key={source.id} className="h-full">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/repository/${encodeURIComponent(source.id)}`}>{source.name}</Link>
                </CardTitle>
                <CardDescription className="line-clamp-2">{source.subtitle ?? source.url}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p className="break-all">{source.url}</p>
                {source.website ? (
                  <a className="font-medium text-primary hover:underline" href={source.website} rel="noreferrer" target="_blank">
                    Source website
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
