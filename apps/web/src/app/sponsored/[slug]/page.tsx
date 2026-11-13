import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SponsorDto } from "@iappstores/contracts";
import { SponsorIcon } from "@/components/sponsor-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSponsors } from "@/lib/api";
import { getAbsoluteUrl } from "@/lib/site";
import { getSponsorOutboundPath, getSponsorPagePath } from "@/lib/sponsors";

// A sponsor's page exists only while the sponsorship is live, so it is never cached.
export const dynamic = "force-dynamic";

type SponsoredPageProps = {
  params: Promise<{ slug: string }>;
};

/** The live "page" plan sponsor with this slug, or null. */
async function findSponsor(slug: string): Promise<SponsorDto | null> {
  const { sponsors } = await fetchSponsors();
  return sponsors.find((sponsor) => sponsor.plan === "page" && sponsor.slug === slug) ?? null;
}

function metaDescription(sponsor: SponsorDto): string {
  const text = `${sponsor.tagline}. ${sponsor.description ?? ""}`.replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
}

export async function generateMetadata({ params }: SponsoredPageProps): Promise<Metadata> {
  const { slug } = await params;
  const sponsor = await findSponsor(slug).catch(() => null);
  if (!sponsor) {
    return { title: "Sponsor not found", robots: { index: false, follow: false } };
  }

  const title = `${sponsor.name}: ${sponsor.tagline}`;
  const description = metaDescription(sponsor);
  const path = getSponsorPagePath(sponsor) ?? "/";
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: "iappstores", type: "website" },
    twitter: { card: "summary", title, description }
  };
}

export default async function SponsoredPage({ params }: SponsoredPageProps) {
  const { slug } = await params;
  const sponsor = await findSponsor(slug);
  if (!sponsor) {
    notFound();
  }

  const paragraphs = (sponsor.description ?? "").split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  const outboundPath = getSponsorOutboundPath(sponsor);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: sponsor.name,
    description: metaDescription(sponsor),
    url: getAbsoluteUrl(getSponsorPagePath(sponsor) ?? "/"),
    sameAs: sponsor.url,
    ...(sponsor.iconUrl ? { image: sponsor.iconUrl } : {})
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-4 sm:px-6 sm:py-8">
        <Button asChild variant="secondary" className="self-start">
          <Link href="/">Back to apps</Link>
        </Button>

        <header className="flex items-start gap-4">
          <SponsorIcon sponsor={sponsor} className="size-16 rounded-2xl text-2xl sm:size-20" />
          <div className="min-w-0 space-y-2">
            <Badge variant="secondary">Sponsored</Badge>
            <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{sponsor.name}</h1>
            <p className="text-base leading-7 text-muted-foreground">{sponsor.tagline}</p>
          </div>
        </header>

        <Button asChild size="lg" className="h-11 self-start px-5 text-sm">
          {/* Paid links must be marked as such for search engines. */}
          <a href={outboundPath} target="_blank" rel="sponsored nofollow noopener">
            Visit {sponsor.name} →
          </a>
        </Button>

        <section className="space-y-4 text-base leading-7 text-foreground/90">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">About {sponsor.name}</h2>
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </section>

        <p className="rounded-lg bg-muted/40 p-4 text-xs leading-5 text-muted-foreground ring-1 ring-foreground/10">
          This page is a paid placement. The text was written by {sponsor.name}, and iappstores has not tested the
          product.{" "}
          <Link href="/sponsor" className="underline underline-offset-4 hover:text-foreground">
            Sponsor iappstores
          </Link>
        </p>
      </div>
    </main>
  );
}
