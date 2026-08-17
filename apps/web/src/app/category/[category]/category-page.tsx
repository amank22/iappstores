import Link from "next/link";
import { notFound } from "next/navigation";
import type { IndexableCategory } from "@/lib/seo";
import { AppCard } from "@/components/app-card";
import { SiteHeader } from "@/components/site-header";
import { fetchApps } from "@/lib/api";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  isIndexableCategory
} from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 24;

type CategoryPageContentProps = {
  category: string;
  page: number;
};

export async function CategoryPageContent({ category, page }: CategoryPageContentProps) {
  if (!isIndexableCategory(category) || page < 1) {
    notFound();
  }

  const response = await fetchApps({ category, page, pageSize: PAGE_SIZE });
  const label = CATEGORY_LABELS[category];
  const description = CATEGORY_DESCRIPTIONS[category];
  const canonicalPath = page === 1 ? `/category/${category}` : `/category/${category}/page/${page}`;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Category</Badge>
            <Badge variant="outline">{response.pagination.totalItems.toLocaleString()} apps</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{label}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {response.apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </section>

        <nav className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10" aria-label={`${label} pagination`}>
          <div className="text-sm text-muted-foreground">
            Page {response.pagination.page.toLocaleString()} of {response.pagination.totalPages.toLocaleString()}
          </div>
          <div className="flex gap-2">
            {response.pagination.hasPreviousPage ? (
              <Button asChild variant="outline">
                <Link href={page - 1 === 1 ? `/category/${category}` : `/category/${category}/page/${page - 1}`}>Previous</Link>
              </Button>
            ) : null}
            {response.pagination.hasNextPage ? (
              <Button asChild>
                <Link href={`/category/${category}/page/${page + 1}`}>Next</Link>
              </Button>
            ) : null}
          </div>
        </nav>

        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">More ways to browse</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/apps">Apps sitemap</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/repositories">Repositories</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/guides">Guides</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={canonicalPath}>Canonical page</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

export function getCategoryMetadata(category: IndexableCategory, page = 1) {
  const label = CATEGORY_LABELS[category];
  const pageSuffix = page > 1 ? ` - Page ${page}` : "";
  const path = page === 1 ? `/category/${category}` : `/category/${category}/page/${page}`;

  return {
    title: `${label}${pageSuffix}`,
    description: CATEGORY_DESCRIPTIONS[category],
    alternates: {
      canonical: path
    },
    openGraph: {
      title: `${label}${pageSuffix} | iappstores`,
      description: CATEGORY_DESCRIPTIONS[category],
      url: path
    }
  };
}
