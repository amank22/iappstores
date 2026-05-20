"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AppCategory,
  AppCategoryFacet,
  AppDto,
  IosVersionOperator,
  SourceDto
} from "@iappstores/contracts";
import { ShieldWarningIcon } from "@phosphor-icons/react";
import { AppCard } from "@/components/app-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchApps, fetchSources, searchApps } from "@/lib/api";
import {
  ALL_SOURCES,
  DEFAULT_IOS_OPERATOR,
  HOME_EMPTY_CATEGORIES,
  HOME_EMPTY_PAGINATION,
  HOME_PAGE_SIZE,
  getActiveIosVersion,
  parseHomeUrlState,
  type HomeInitialData
} from "@/lib/home";

const CATEGORY_LABELS: Record<AppCategory, string> = {
  all: "All",
  recent: "Recent",
  games: "Games",
  tools: "Tools",
  media: "Media",
  education: "Education"
};

const IOS_FILTER_LABELS: Record<IosVersionOperator, string> = {
  lte: "Compatible with iOS",
  gte: "Requires at least iOS"
};

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

const popularSearches = ["YouTube", "Instagram", "Spotify", "TikTok"];
const discoveryLinks = [
  { href: "/?category=games", label: "Games" },
  { href: "/?category=media", label: "Media apps" },
  { href: "/?category=tools", label: "Tools" },
  { href: "/?ios=16&iosOperator=lte", label: "iOS 16 compatible" }
];

function readUrlState(fallback: HomeInitialData["urlState"]) {
  if (typeof window === "undefined") {
    return fallback;
  }

  return parseHomeUrlState(new URLSearchParams(window.location.search));
}

function AppGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <Skeleton className="-mt-4 h-[13rem] w-full shrink-0 rounded-none sm:h-[15rem]" />
          <CardHeader className="gap-3 p-4 pt-4 sm:p-6 sm:pt-5">
            <div className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DiscoveryShortcuts() {
  return (
    <div className="flex flex-wrap gap-2">
      {popularSearches.map((search) => (
        <Button key={search} asChild variant="outline" size="sm">
          <Link href={`/?q=${encodeURIComponent(search)}`}>{search}</Link>
        </Button>
      ))}
      {discoveryLinks.map((link) => (
        <Button key={link.href} asChild variant="secondary" size="sm">
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function EmptyResultsCard({
  hasActiveFilters,
  resetFilters
}: {
  hasActiveFilters: boolean;
  resetFilters: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasActiveFilters ? "No apps match these filters" : "Explore indexed IPA repositories"}</CardTitle>
        <CardDescription>
          {hasActiveFilters
            ? "Try a broader search, another source, or one of the discovery shortcuts below."
            : "Start with a popular search or browse a category while repository data is warming up."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DiscoveryShortcuts />
        {hasActiveFilters ? (
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function HomeClient({ initialData }: { initialData: HomeInitialData }) {
  const initialUrlState = useMemo(() => readUrlState(initialData.urlState), [initialData.urlState]);
  const [sources, setSources] = useState<SourceDto[]>(initialData.sources);
  const [apps, setApps] = useState<AppDto[]>(initialData.apps);
  const [categories, setCategories] = useState<AppCategoryFacet[]>(initialData.categories);
  const [pagination, setPagination] = useState(initialData.pagination);
  const [selectedSourceId, setSelectedSourceId] = useState(initialUrlState.selectedSourceId);
  const [selectedCategory, setSelectedCategory] = useState<AppCategory>(initialUrlState.selectedCategory);
  const [iosVersion, setIosVersion] = useState(initialUrlState.iosVersion);
  const [iosVersionOperator, setIosVersionOperator] = useState<IosVersionOperator>(initialUrlState.iosVersionOperator);
  const [page, setPage] = useState(initialData.pagination.page);
  const [query, setQuery] = useState(initialUrlState.query);
  const [isLoadingSources, setIsLoadingSources] = useState(initialData.sources.length === 0);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [error, setError] = useState<string | null>(initialData.error);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingNextPageRef = useRef(false);
  const hasSyncedInitialUrl = useRef(false);
  const shouldSkipInitialAppsFetch = useRef(true);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId),
    [selectedSourceId, sources]
  );
  const trimmedIosVersion = iosVersion.trim();
  const activeIosVersion = getActiveIosVersion(trimmedIosVersion);
  const trimmedQuery = query.trim();
  const requestKey = useMemo(
    () =>
      JSON.stringify({
        query: trimmedQuery,
        selectedSourceId,
        selectedCategory,
        activeIosVersion,
        iosVersionOperator
      }),
    [activeIosVersion, iosVersionOperator, selectedCategory, selectedSourceId, trimmedQuery]
  );
  const currentRequestKey = useRef(requestKey);
  const hasActiveFilters =
    trimmedQuery.length > 0 ||
    selectedSourceId !== ALL_SOURCES ||
    selectedCategory !== "all" ||
    trimmedIosVersion.length > 0 ||
    iosVersionOperator !== DEFAULT_IOS_OPERATOR;

  useEffect(() => {
    if (sources.length > 0) {
      setIsLoadingSources(false);
      return;
    }

    let isCancelled = false;

    async function loadSources() {
      setIsLoadingSources(true);
      try {
        const nextSources = await fetchSources();
        if (!isCancelled) {
          setSources(nextSources);
          setError(null);
        }
      } catch (caught) {
        if (!isCancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load sources.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSources(false);
        }
      }
    }

    void loadSources();

    return () => {
      isCancelled = true;
    };
  }, [sources.length]);

  useEffect(() => {
    if (requestKey !== currentRequestKey.current) {
      isLoadingNextPageRef.current = false;
      setApps([]);
      setPagination(HOME_EMPTY_PAGINATION);
      setPage(1);
    }
  }, [requestKey]);

  useEffect(() => {
    function applyUrlState() {
      const nextState = readUrlState(initialData.urlState);
      isLoadingNextPageRef.current = false;
      setQuery(nextState.query);
      setSelectedSourceId(nextState.selectedSourceId);
      setSelectedCategory(nextState.selectedCategory);
      setIosVersion(nextState.iosVersion);
      setIosVersionOperator(nextState.iosVersionOperator);
      setApps([]);
      setPagination(HOME_EMPTY_PAGINATION);
      setPage(1);
    }

    window.addEventListener("popstate", applyUrlState);
    return () => window.removeEventListener("popstate", applyUrlState);
  }, [initialData.urlState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (trimmedQuery.length > 0) {
        params.set("q", trimmedQuery);
      }
      if (selectedSourceId !== ALL_SOURCES) {
        params.set("source", selectedSourceId);
      }
      if (selectedCategory !== "all") {
        params.set("category", selectedCategory);
      }
      if (trimmedIosVersion.length > 0) {
        params.set("ios", trimmedIosVersion);
        if (iosVersionOperator !== DEFAULT_IOS_OPERATOR) {
          params.set("iosOperator", iosVersionOperator);
        }
      }

      const nextUrl = params.toString() ? `/?${params.toString()}` : "/";
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        const stateMethod = hasSyncedInitialUrl.current ? "pushState" : "replaceState";
        window.history[stateMethod](null, "", nextUrl);
      }

      hasSyncedInitialUrl.current = true;
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [iosVersionOperator, selectedCategory, selectedSourceId, trimmedIosVersion, trimmedQuery]);

  useEffect(() => {
    if (shouldSkipInitialAppsFetch.current) {
      shouldSkipInitialAppsFetch.current = false;
      return;
    }

    if (requestKey !== currentRequestKey.current && page !== 1) {
      return;
    }

    let isCancelled = false;
    const timeout = setTimeout(() => {
      async function loadApps() {
        setIsLoadingApps(true);
        try {
          const sourceId = selectedSourceId === ALL_SOURCES ? undefined : selectedSourceId;
          const options = {
            sourceId,
            category: selectedCategory,
            iosVersion: activeIosVersion,
            iosVersionOperator,
            page,
            pageSize: HOME_PAGE_SIZE
          };
          const nextApps =
            trimmedQuery.length > 0
              ? await searchApps(trimmedQuery, options)
              : await fetchApps(options);

          if (!isCancelled) {
            currentRequestKey.current = requestKey;
            setApps((currentApps) => {
              if (page === 1) {
                return nextApps.apps;
              }

              const seenIds = new Set(currentApps.map((app) => app.id));
              const newApps = nextApps.apps.filter((app) => !seenIds.has(app.id));
              return [...currentApps, ...newApps];
            });
            setCategories(nextApps.categories);
            setPagination(nextApps.pagination);
            setError(null);
          }
        } catch (caught) {
          if (!isCancelled) {
            setApps([]);
            setPagination(HOME_EMPTY_PAGINATION);
            setError(caught instanceof Error ? caught.message : "Could not load apps.");
          }
        } finally {
          if (!isCancelled) {
            isLoadingNextPageRef.current = false;
            setIsLoadingApps(false);
          }
        }
      }

      void loadApps();
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [activeIosVersion, iosVersionOperator, page, requestKey, selectedCategory, selectedSourceId, trimmedQuery]);

  const loadNextPage = useCallback(() => {
    if (!pagination.hasNextPage || isLoadingApps || isLoadingNextPageRef.current) {
      return;
    }

    isLoadingNextPageRef.current = true;
    setPage((currentPage) => currentPage + 1);
  }, [isLoadingApps, pagination.hasNextPage]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !pagination.hasNextPage) {
      return;
    }
    const observedNode = node;

    function isNodeNearViewport() {
      const rect = observedNode.getBoundingClientRect();
      return rect.top <= window.innerHeight + 600;
    }

    function maybeLoadNextPage() {
      if (isNodeNearViewport()) {
        loadNextPage();
      }
    }

    let scrollRafId = 0;

    function scheduleNearViewportCheck() {
      if (scrollRafId !== 0) {
        return;
      }
      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = 0;
        maybeLoadNextPage();
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadNextPage();
        }
      },
      {
        rootMargin: "600px 0px"
      }
    );

    observer.observe(observedNode);
    window.addEventListener("scroll", scheduleNearViewportCheck, { passive: true });
    window.addEventListener("resize", scheduleNearViewportCheck);

    const frame = window.requestAnimationFrame(maybeLoadNextPage);

    return () => {
      window.cancelAnimationFrame(frame);
      if (scrollRafId !== 0) {
        window.cancelAnimationFrame(scrollRafId);
      }
      window.removeEventListener("scroll", scheduleNearViewportCheck);
      window.removeEventListener("resize", scheduleNearViewportCheck);
      observer.disconnect();
    };
  }, [loadNextPage, pagination.hasNextPage, apps.length]);

  const visibleCategories = useMemo(
    () => (categories.length > 0 ? categories : HOME_EMPTY_CATEGORIES).filter((category) => category.id === "all" || category.appCount > 0),
    [categories]
  );
  const isInitialLoading = isLoadingApps && apps.length === 0;
  const isLoadingMore = isLoadingApps && apps.length > 0;

  function resetFilters() {
    isLoadingNextPageRef.current = false;
    setQuery("");
    setSelectedSourceId(ALL_SOURCES);
    setSelectedCategory("all");
    setIosVersion("");
    setIosVersionOperator(DEFAULT_IOS_OPERATOR);
    setApps([]);
    setPagination(HOME_EMPTY_PAGINATION);
    setPage(1);
  }

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
        <div className="mx-auto flex max-w-7xl gap-3 px-3 py-3 sm:px-6 lg:px-8">
          <ShieldWarningIcon
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
            aria-hidden
          />
          <div className="min-w-0 space-y-1 text-sm leading-snug">
            <p className="font-medium text-amber-100">Third-party sources — judge safety yourself</p>
            <p className="text-amber-50/85">
              IPAs come from many independent repositories we index; we do not host files, verify authenticity, or review
              code for malware or privacy impact. Only install what you trust after checking each source and listing.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5 lg:px-8">
        <section className="overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:p-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {/* Brand asset lives in public/ so it also works for Docker/Coolify deployments. */}
                <img src="/logo.svg" alt="iappstores logo" className="h-9 w-9 rounded-lg ring-1 ring-foreground/10" />
                <Badge variant="secondary">AltStore and SideStore repositories</Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">iappstores</h1>
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                  Browse direct IPA downloads from AltStore and SideStore repositories, including tweaked,
                  modded, and patched iOS apps with App Store context when available.
                </p>
              </div>
              <Input
                className="h-8"
                placeholder="Search apps, bundle IDs, developers..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-1">
              <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10">
                <div className="text-2xl font-semibold">{isLoadingSources ? "-" : sources.length}</div>
                <div className="mt-1 text-muted-foreground">Sources indexed</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10">
                <div className="text-2xl font-semibold">{pagination.totalItems}</div>
                <div className="mt-1 text-muted-foreground">{trimmedQuery ? "Matches" : "Apps available"}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex gap-2 overflow-x-auto pb-1 text-xs text-muted-foreground">
          <Badge variant="outline">Direct IPA downloads</Badge>
          <Badge variant="outline">Tweaked and modded apps</Badge>
          <Badge variant="outline">Repository notes preserved</Badge>
          <Badge variant="outline">App Store metadata when available</Badge>
        </section>

        <Card>
          <CardHeader className="flex gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div>
              <CardTitle>Refine results</CardTitle>
              <CardDescription>Use filters when you need them. Reset anytime.</CardDescription>
            </div>
            <Button
              variant={hasActiveFilters ? "default" : "outline"}
              size="sm"
              disabled={!hasActiveFilters}
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleCategories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {CATEGORY_LABELS[category.id]} {category.id !== "all" ? `(${category.appCount})` : ""}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_11rem]">
              <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SOURCES}>All sources</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={iosVersionOperator}
                onValueChange={(value) => setIosVersionOperator(value as IosVersionOperator)}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Compatible with iOS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lte">Compatible with iOS</SelectItem>
                  <SelectItem value="gte">Requires at least iOS</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-8"
                inputMode="decimal"
                pattern="[0-9]+(\\.[0-9]+){0,2}"
                placeholder="iOS, e.g. 16.0"
                value={iosVersion}
                onChange={(event) => setIosVersion(event.target.value)}
              />
            </div>

            {hasActiveFilters ? (
              <div className="flex flex-wrap gap-2 rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10">
                <span className="self-center text-xs font-medium text-muted-foreground">Active:</span>
                {trimmedQuery ? <Badge variant="outline">Search: {trimmedQuery}</Badge> : null}
                {selectedCategory !== "all" ? <Badge variant="outline">{CATEGORY_LABELS[selectedCategory]}</Badge> : null}
                {selectedSource ? <Badge variant="outline">{selectedSource.name}</Badge> : null}
                {trimmedIosVersion ? (
                  <Badge variant="outline">
                    {activeIosVersion
                      ? `${IOS_FILTER_LABELS[iosVersionOperator]} ${activeIosVersion}`
                      : "Enter iOS version like 16.0"}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardHeader>
              <CardTitle>Repository data is warming up</CardTitle>
              <CardDescription>
                {error} You can still use the shortcuts below or check back in a moment while the index refreshes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DiscoveryShortcuts />
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Apps</h2>
              <p className="text-sm text-muted-foreground">
                {isInitialLoading
                  ? "Loading apps..."
                  : `${apps.length} of ${pagination.totalItems} app${pagination.totalItems === 1 ? "" : "s"} shown`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pagination.totalItems > 0 ? (
                <Badge variant="secondary">
                  {pagination.hasNextPage ? "Scroll for more" : "All results loaded"}
                </Badge>
              ) : null}
            </div>
          </div>

          {isInitialLoading ? (
            <AppGridSkeleton />
          ) : apps.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {apps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          ) : (
            <EmptyResultsCard hasActiveFilters={hasActiveFilters} resetFilters={resetFilters} />
          )}

          {apps.length > 0 ? (
            <div ref={loadMoreRef} className="flex flex-col items-center gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
              {pagination.hasNextPage ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {isLoadingMore ? "Loading more apps..." : `${pagination.totalItems - apps.length} more app${pagination.totalItems - apps.length === 1 ? "" : "s"} available`}
                  </p>
                  <Button
                    variant="outline"
                    disabled={isLoadingApps}
                    onClick={loadNextPage}
                  >
                    {isLoadingMore ? "Loading..." : "Load more"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">You have reached the end of the results.</p>
              )}
            </div>
          ) : null}
        </section>

        <section className="space-y-5 rounded-lg bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Browse IPA repositories with searchable metadata</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              iappstores indexes iOS app repositories so you can search by app name, bundle ID, developer, source,
              category, and minimum iOS version. Duplicate bundle IDs are grouped into one app card with multiple IPA
              download options, making repeated listings easier to compare.
            </p>
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
