import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { GUIDES, getGuide } from "@/lib/guides";
import { getAbsoluteUrl } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) {
    notFound();
  }

  return {
    title: guide.title,
    description: guide.description,
    alternates: {
      canonical: `/guides/${guide.slug}`
    },
    openGraph: {
      title: `${guide.title} | iappstores`,
      description: guide.description,
      url: `/guides/${guide.slug}`
    }
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        mainEntityOfPage: getAbsoluteUrl(`/guides/${guide.slug}`),
        publisher: {
          "@type": "Organization",
          name: "iappstores",
          url: getAbsoluteUrl("/")
        }
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      }
    ]
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">Guide</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{guide.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{guide.description}</p>
        </section>

        <article className="space-y-5">
          {guide.sections.map((section) => (
            <section key={section.heading} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </article>

        <Card>
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {guide.faqs.map((faq) => (
              <div key={faq.question}>
                <h2 className="text-sm font-semibold text-foreground">{faq.question}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/guides">All guides</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/apps">Browse apps</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/repositories">Repositories</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
