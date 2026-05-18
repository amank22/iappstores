"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppCategory,
  AppCategoryFacet,
  AppDto,
  IosVersionOperator,
  Pagination,
  SourceDto
} from "@iappstores/contracts";
import { AppCard } from "@/components/app-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchApps, fetchSources, searchApps } from "@/lib/api";

const ALL_SOURCES = "all";
const PAGE_SIZE = 12;
const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false
};

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

const DEFAULT_IOS_OPERATOR: IosVersionOperator = "lte";
const APP_CATEGORIES = new Set<AppCategory>(["all", "recent", "games", "tools", "media", "education"]);
const IOS_OPERATORS = new Set<IosVersionOperator>(["lte", "gte"]);
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
            text: "iappstores is a browser for AltStore and SideStore compatible repositories. It helps users search IPA files, compare repository sources, and view available download options."
          }
        },
        {
          "@type": "Question",
          name: "Can I find tweaked or modded IPA files?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Many indexed repositories include tweaked, modded, patched, or subscription-unlocked IPA listings. Repository notes are preserved so users can understand what changed in each build."
          }
        },
        {
          "@type": "Question",
          name: "Does iappstores host IPA files?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "iappstores indexes third-party repository metadata and links to source download options. It does not modify IPA files or replace repository source notes."
          }
        }
      ]
    }
  ]
};

function readUrlState() {
  if (typeof window === "undefined") {
    return {
      selectedSourceId: ALL_SOURCES,
      selectedCategory: "all" as AppCategory,
      iosVersion: "",
      iosVersionOperator: DEFAULT_IOS_OPERATOR,
      query: ""
    };
  }

  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const iosOperator = params.get("iosOperator");

  return {
    selectedSourceId: params.get("source")?.trim() || ALL_SOURCES,
    selectedCategory: category && APP_CATEGORIES.has(category as AppCategory) ? (category as AppCategory) : "all",
    iosVersion: params.get("ios")?.trim() ?? "",
    iosVersionOperator:
      iosOperator && IOS_OPERATORS.has(iosOperator as IosVersionOperator)
        ? (iosOperator as IosVersionOperator)
        : DEFAULT_IOS_OPERATOR,
    query: params.get("q")?.trim() ?? ""
  };
}

function AppGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex gap-4">
              <Skeleton className="h-14 w-14 rounded-lg sm:h-16 sm:w-16" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
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

export default function Home() {
  const initialUrlState = useMemo(readUrlState, []);
  const [sources, setSources] = useState<SourceDto[]>([]);
  const [apps, setApps] = useState<AppDto[]>([]);
  const [categories, setCategories] = useState<AppCategoryFacet[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [selectedSourceId, setSelectedSourceId] = useState(initialUrlState.selectedSourceId);
  const [selectedCategory, setSelectedCategory] = useState<AppCategory>(initialUrlState.selectedCategory);
  const [iosVersion, setIosVersion] = useState(initialUrlState.iosVersion);
  const [iosVersionOperator, setIosVersionOperator] = useState<IosVersionOperator>(initialUrlState.iosVersionOperator);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(initialUrlState.query);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingNextPageRef = useRef(false);
  const hasSyncedInitialUrl = useRef(false);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId),
    [selectedSourceId, sources]
  );
  const trimmedIosVersion = iosVersion.trim();
  const activeIosVersion = /^\d+(?:\.\d+){0,2}$/.test(trimmedIosVersion) ? trimmedIosVersion : undefined;
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
  }, []);

  useEffect(() => {
    if (requestKey !== currentRequestKey.current) {
      isLoadingNextPageRef.current = false;
      setApps([]);
      setPagination(EMPTY_PAGINATION);
      setPage(1);
    }
  }, [requestKey]);

  useEffect(() => {
    function applyUrlState() {
      const nextState = readUrlState();
      isLoadingNextPageRef.current = false;
      setQuery(nextState.query);
      setSelectedSourceId(nextState.selectedSourceId);
      setSelectedCategory(nextState.selectedCategory);
      setIosVersion(nextState.iosVersion);
      setIosVersionOperator(nextState.iosVersionOperator);
      setApps([]);
      setPagination(EMPTY_PAGINATION);
      setPage(1);
    }

    window.addEventListener("popstate", applyUrlState);
    return () => window.removeEventListener("popstate", applyUrlState);
  }, []);

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
            pageSize: PAGE_SIZE
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
            setPagination(EMPTY_PAGINATION);
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
    window.addEventListener("scroll", maybeLoadNextPage, { passive: true });
    window.addEventListener("resize", maybeLoadNextPage);

    const frame = window.requestAnimationFrame(maybeLoadNextPage);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", maybeLoadNextPage);
      window.removeEventListener("resize", maybeLoadNextPage);
      observer.disconnect();
    };
  }, [loadNextPage, pagination.hasNextPage, apps.length]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.id === "all" || category.appCount > 0),
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
    setPagination(EMPTY_PAGINATION);
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5 lg:px-8">
        <section className="overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:p-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {/* Brand asset lives in public/ so it also works for Docker/Coolify deployments. */}
                <img src="/logo.svg" alt="" className="h-9 w-9 rounded-lg ring-1 ring-foreground/10" />
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
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
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
            <Card>
              <CardHeader>
                <CardTitle>No apps found</CardTitle>
                <CardDescription>Try another search term or source filter.</CardDescription>
              </CardHeader>
            </Card>
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

        <section className="grid gap-4 rounded-lg bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Browse IPA repositories with searchable metadata</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              iappstores indexes iOS app repositories so you can search by app name, bundle ID, developer, source,
              category, and minimum iOS version. Duplicate bundle IDs are grouped into one app card with multiple IPA
              download options, making repeated listings easier to compare.
            </p>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <h3 className="font-semibold text-foreground">Does iappstores host IPA files?</h3>
              <p className="mt-1 leading-6">
                No. The site indexes repository metadata and links to the original source download URLs.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Why show repository notes?</h3>
              <p className="mt-1 leading-6">
                IPA listings often mention tweaks, patches, unlocked features, or installation notes. Those details are
                kept separate from official App Store descriptions.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
