import type { Metadata } from "next";
import Link from "next/link";
import { CorrectMyPaperCta } from "@/components/correctmypaper-cta";
import { CorrectMyPaperIcon } from "@/components/correctmypaper-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAbsoluteUrl, getCorrectMyPaperUrl } from "@/lib/site";

const title = "CorrectMyPaper: AI Proofreading for Papers & Essays";
const description =
  "CorrectMyPaper uses AI to proofread research papers, essays, and theses — fixing grammar, clarity, and academic tone before you submit.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/correctmypaper"
  },
  openGraph: {
    title,
    description,
    url: "/correctmypaper",
    siteName: "iappstores",
    type: "website"
  },
  twitter: {
    card: "summary",
    title,
    description
  }
};

export default function CorrectMyPaperPage() {
  const ctaHref = getCorrectMyPaperUrl("correctmypaper_landing_page");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CorrectMyPaper",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    description,
    url: getAbsoluteUrl("/correctmypaper"),
    offers: {
      "@type": "Offer",
      price: 0,
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
        <Button asChild variant="secondary" className="self-start">
          <Link href="/">Back to apps</Link>
        </Button>

        <section className="rounded-lg bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-500 ring-1 ring-indigo-500/25">
              <CorrectMyPaperIcon className="size-7" />
            </div>
            <div>
              <Badge variant="secondary">Sponsored</Badge>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">CorrectMyPaper</h1>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
          <div className="mt-5">
            <CorrectMyPaperCta href={ctaHref} placement="correctmypaper_landing_page" />
          </div>
        </section>

        <section className="space-y-3 rounded-lg bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">What CorrectMyPaper does</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Students and researchers use CorrectMyPaper to catch grammar mistakes, awkward phrasing, and tone issues
            in academic writing. Paste in a research paper, essay, or thesis draft and get AI-powered corrections
            and suggestions in seconds, so you can submit polished writing with confidence.
          </p>
        </section>
      </div>
    </main>
  );
}
