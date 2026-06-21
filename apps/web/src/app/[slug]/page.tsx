import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SEO_LANDING_PAGES, getSeoLandingPage } from "@/lib/seo-landing-pages";
import { getAbsoluteUrl } from "@/lib/site";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return SEO_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPage(slug);
  if (!page) {
    notFound();
  }

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `/${page.slug}`
    },
    openGraph: {
      title: `${page.title} | iappstores`,
      description: page.description,
      url: `/${page.slug}`,
      type: "article"
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: ["/og.svg"]
    }
  };
}

export default async function SeoLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getSeoLandingPage(slug);
  if (!page) {
    notFound();
  }

  const pageUrl = getAbsoluteUrl(`/${page.slug}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: page.title,
        description: page.description,
        mainEntityOfPage: pageUrl,
        publisher: {
          "@type": "Organization",
          name: "iappstores",
          url: getAbsoluteUrl("/")
        }
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: getAbsoluteUrl("/")
          },
          {
            "@type": "ListItem",
            position: 2,
            name: page.title,
            item: pageUrl
          }
        ]
      }
    ]
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8">
        <section className="overflow-hidden rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <Badge variant="secondary">{page.eyebrow}</Badge>
          <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">{page.title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{page.intro}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={page.primaryCta.href}>{page.primaryCta.label}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={page.secondaryCta.href}>{page.secondaryCta.label}</Link>
            </Button>
          </div>
        </section>

        <article className="grid gap-4">
          {page.sections.map((section) => (
            <section key={section.heading} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </article>

        <section className="grid gap-4 md:grid-cols-3">
          {page.relatedLinks.map((relatedLink) => (
            <Card key={relatedLink.href} className="h-full">
              <CardHeader>
                <CardTitle>
                  <Link href={relatedLink.href}>{relatedLink.label}</Link>
                </CardTitle>
                <CardDescription>{relatedLink.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link className="text-sm font-medium text-primary hover:underline" href={relatedLink.href}>
                  Open page
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {page.faqs.map((faq) => (
              <div key={faq.question}>
                <h2 className="text-sm font-semibold text-foreground">{faq.question}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
