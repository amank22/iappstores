"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { Pagination, SourceDto } from "@iappstores/contracts";
import { ShieldWarningIcon } from "@phosphor-icons/react";
import { AppBrowser } from "@/components/app-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchApps, searchApps, type AppQueryOptions } from "@/lib/api";
import { HOME_PAGE_SIZE, type HomeInitialData } from "@/lib/home";
import { SEO_LANDING_PAGES } from "@/lib/seo-landing-pages";

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "iappstores",
      url: "https://iappstores.com/",
      description:
        "Browse direct IPA downloads from AltStore and SideStore repositories, including tweaked, modded, and patched iOS apps.",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://iappstores.com/?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is iappstores?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "iappstores is a searchable browser for AltStore and SideStore-compatible repositories. It helps users find IPA listings, compare source notes, and view download options."
          }
        },
        {
          "@type": "Question",
          name: "How are repositories indexed?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "iappstores fetches configured third-party repository JSON, normalizes AltStore-style app metadata, groups duplicate bundle identifiers, and serves cached results while background refreshes run."
          }
        },
        {
          "@type": "Question",
          name: "How should users evaluate IPA source safety?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Users should verify the repository, compare source notes, check bundle identifiers and version details, and only install apps from sources they trust. iappstores indexes metadata and does not review IPA files for malware or privacy impact."
          }
        }
      ]
    }
  ]
} as const;

export default function HomeClient({ initialData }: { initialData: HomeInitialData }) {
  const [sources, setSources] = useState<SourceDto[]>(initialData.sources);
  const [pagination, setPagination] = useState<Pagination>(initialData.pagination);

  const fetchList = useCallback((options: AppQueryOptions & { query?: string }) => {
    const { query, ...rest } = options;
    return query && query.trim().length > 0 ? searchApps(query, rest) : fetchApps(rest);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
      />
      <div
        role="region"
        aria-label="Third-party software notice"
        className="border-b border-amber-500/25 bg-amber-500/[0.07]"
      >
        <div className="mx-auto flex max-w-7xl gap-2 px-3 py-2 sm:px-6 lg:px-8">
          <ShieldWarningIcon
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden
          />
          <p className="min-w-0 text-xs leading-5 text-amber-50/85">
            <span className="font-medium text-amber-100">Third-party sources:</span> we index repositories, but do not
            host or verify IPA files. Check each source before installing.
          </p>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <section className="overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10">
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* Brand asset lives in public/ so it also works for Docker/Coolify deployments. */}
                <img src="/logo.svg" alt="iappstores logo" className="h-8 w-8 rounded-lg ring-1 ring-foreground/10" />
                <Badge variant="secondary">AltStore and SideStore repositories</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{sources.length} sources</Badge>
                <Badge variant="outline">{pagination.totalItems.toLocaleString()} apps</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Find iOS IPA apps</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Search app names, bundle IDs, developers, and repositories. Compare source notes before opening an IPA download.
              </p>
            </div>
          </div>
        </section>

        <AppBrowser
          fetchList={fetchList}
          initialApps={initialData.apps}
          initialPagination={initialData.pagination}
          initialCategories={initialData.categories}
          initialSources={initialData.sources}
          syncUrl
          pageSize={HOME_PAGE_SIZE}
          title="Apps"
          onSourcesChange={setSources}
          onPaginationChange={setPagination}
        />

        <section className="space-y-5 rounded-lg bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Browse IPA repositories with searchable metadata</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              iappstores indexes iOS app repositories so you can search by app name, bundle ID, developer, source,
              category, and minimum iOS version. Duplicate bundle IDs are grouped into one app card with multiple IPA
              download options, making repeated listings easier to compare.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto rounded-lg bg-muted/40 p-2 text-xs ring-1 ring-foreground/10" aria-label="Popular IPA search pages">
            <span className="shrink-0 px-2 py-1 font-medium text-muted-foreground">Popular searches</span>
            {SEO_LANDING_PAGES.map((page) => (
              <Button key={page.slug} asChild variant="outline" size="sm" className="shrink-0">
                <Link href={`/${page.slug}`}>{page.eyebrow}</Link>
              </Button>
            ))}
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground lg:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/10">
              <h3 className="font-semibold text-foreground">What is iappstores?</h3>
              <p className="mt-2 leading-6">
                iappstores is a searchable browser for AltStore and SideStore-compatible repositories. It helps users
                find IPA listings, compare source notes, and view download options.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/10">
              <h3 className="font-semibold text-foreground">How are repositories indexed?</h3>
              <p className="mt-2 leading-6">
                The API fetches configured third-party repository JSON, normalizes AltStore-style app metadata, groups
                duplicate bundle identifiers, and serves cached results while background refreshes run.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/10">
              <h3 className="font-semibold text-foreground">How fresh is the index?</h3>
              <p className="mt-2 leading-6">
                Repository cache entries refresh roughly every 24 hours by default. Stale data can remain visible while
                new source data is fetched, which keeps browsing usable during upstream outages.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/10">
              <h3 className="font-semibold text-foreground">How should users evaluate IPA source safety?</h3>
              <p className="mt-2 leading-6">
                Verify the repository, compare source notes, check bundle identifiers and version details, and only
                install apps from sources you trust. iappstores indexes metadata and does not review IPA files for
                malware or privacy impact.
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/10 lg:col-span-2">
              <h3 className="font-semibold text-foreground">Does iappstores host IPA files?</h3>
              <p className="mt-2 leading-6">
                No. The site indexes repository metadata and links to original source download URLs. Repository notes
                are kept separate from official App Store descriptions because they often mention tweaks, patches,
                unlocked features, or installation details.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
