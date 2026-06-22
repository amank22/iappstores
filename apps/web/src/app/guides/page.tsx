import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { GUIDES } from "@/lib/guides";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "iOS Sideloading Guides",
  description: "Guides for AltStore, SideStore, IPA files, and browsing iOS app repositories.",
  alternates: {
    canonical: "/guides"
  }
};

export default function GuidesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">Guides</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">iOS sideloading guides</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Learn the basics of IPA files, AltStore, SideStore, sideloading workflows, and how to evaluate repository
            metadata before opening external download sources.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <Card key={guide.slug} className="h-full">
              <CardHeader>
                <CardTitle>
                  <Link href={`/guides/${guide.slug}`}>{guide.title}</Link>
                </CardTitle>
                <CardDescription>{guide.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link className="text-sm font-medium text-primary hover:underline" href={`/guides/${guide.slug}`}>
                  Read guide
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
