"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppCategory,
  AppCategoryFacet,
  AppDto,
  AppSort,
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
import { fetchSources, type AppQueryOptions } from "@/lib/api";
import {
  ALL_SOURCES,
  DEFAULT_IOS_OPERATOR,
  DEFAULT_SORT,
  HOME_EMPTY_CATEGORIES,
  HOME_EMPTY_PAGINATION,
  HOME_PAGE_SIZE,
  getActiveIosVersion,
  parseHomeUrlState
} from "@/lib/home";
import {
  DOWNLOADED_APPS_STORAGE_KEY,
  readDownloadedAppIds,
  recordDownloadedApp
} from "@/lib/download-history";

const CATEGORY_LABELS: Record<AppCategory, string> = {
  all: "All",
  recent: "Recent",
  games: "Games",
  emulators: "Emulators",
  tools: "Tools",
  productivity: "Productivity",
  utilities: "Utilities",
  media: "Media",
  music: "Music",
  "photo-video": "Photo & Video",
  social: "Social",
  education: "Education",
  books: "Books",
  developer: "Developer",
  lifestyle: "Lifestyle"
};

const IOS_FILTER_LABELS: Record<IosVersionOperator, string> = {
  lte: "Compatible with iOS",
  gte: "Requires at least iOS"
};

const SORT_LABELS: Record<AppSort, string> = {
  recent: "Recently updated",
  "name-asc": "Name A-Z",
  "name-desc": "Name Z-A"
};

function appTimestamp(app: AppDto): number {
  const value = app.lastUpdatedAt ?? app.versionDate ?? "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortLocalApps(apps: AppDto[], sort: AppSort): AppDto[] {
  if (sort === "name-asc" || sort === "name-desc") {
    return [...apps].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sort === "name-asc" ? comparison : -comparison;
    });
  }

  return [...apps].sort((a, b) => appTimestamp(b) - appTimestamp(a));
}

function appSearchText(app: AppDto): string {
  return [app.name, app.bundleIdentifier, app.developerName, app.subtitle, app.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function facetsFromApps(apps: AppDto[]): AppCategoryFacet[] {
  const counts = new Map<AppCategory, number>();
  for (const app of apps) {
    counts.set(app.category, (counts.get(app.category) ?? 0) + 1);
  }

  return HOME_EMPTY_CATEGORIES.map((facet) => ({
    ...facet,
    appCount: facet.id === "all" ? apps.length : facet.id === "recent" ? apps.length : counts.get(facet.id) ?? 0
  }));
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

export type AppBrowserFetchResult = {
  apps: AppDto[];
  pagination: Pagination;
  categories?: AppCategoryFacet[];
};

export type AppBrowserProps = {
  /** Remote mode: called whenever filters/page change. Receives the query text under `query`. */
  fetchList?: (options: AppQueryOptions & { query?: string }) => Promise<AppBrowserFetchResult>;
  /** Local mode: a fixed, already-fetched list filtered/sorted entirely client-side, no further requests. */
  localApps?: AppDto[];
  initialApps?: AppDto[];
  initialPagination?: Pagination;
  initialCategories?: AppCategoryFacet[];
  initialSources?: SourceDto[];
  showSearch?: boolean;
  showCategoryFilter?: boolean;
  showSourceFilter?: boolean;
  showSortFilter?: boolean;
  showIosVersionFilter?: boolean;
  /** Only the home page (still living at `/`) should enable this. */
  syncUrl?: boolean;
  pageSize?: number;
  title?: string;
  /** Optional: lets a parent mirror sources/pagination for its own display (e.g. hero badges). */
  onSourcesChange?: (sources: SourceDto[]) => void;
  onPaginationChange?: (pagination: Pagination) => void;
};

export function AppBrowser({
  fetchList,
  localApps,
  initialApps = [],
  initialPagination = HOME_EMPTY_PAGINATION,
  initialCategories = [],
  initialSources = [],
  showSearch = true,
  showCategoryFilter = true,
  showSourceFilter = true,
  showSortFilter = true,
  showIosVersionFilter = true,
  syncUrl = false,
  pageSize = HOME_PAGE_SIZE,
  title = "Apps",
  onSourcesChange,
  onPaginationChange
}: AppBrowserProps) {
  const isLocal = localApps !== undefined;
  const initialUrlState = useMemo(
    () => (syncUrl && typeof window !== "undefined" ? parseHomeUrlState(new URLSearchParams(window.location.search)) : null),
    [syncUrl]
  );

  const [sources, setSources] = useState<SourceDto[]>(initialSources);
  const [isLoadingSources, setIsLoadingSources] = useState(showSourceFilter && !isLocal && initialSources.length === 0);
  const [remoteApps, setRemoteApps] = useState<AppDto[]>(initialApps);
  const [categories, setCategories] = useState<AppCategoryFacet[]>(initialCategories);
  const [pagination, setPagination] = useState<Pagination>(initialPagination);
  const [selectedSourceId, setSelectedSourceId] = useState(initialUrlState?.selectedSourceId ?? ALL_SOURCES);
  const [selectedCategory, setSelectedCategory] = useState<AppCategory>(initialUrlState?.selectedCategory ?? "all");
  const [sort, setSort] = useState<AppSort>(initialUrlState?.sort ?? DEFAULT_SORT);
  const [iosVersion, setIosVersion] = useState(initialUrlState?.iosVersion ?? "");
  const [iosVersionOperator, setIosVersionOperator] = useState<IosVersionOperator>(
    initialUrlState?.iosVersionOperator ?? DEFAULT_IOS_OPERATOR
  );
  const [page, setPage] = useState(initialPagination.page);
  const [query, setQuery] = useState(initialUrlState?.query ?? "");
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedAppIds, setDownloadedAppIds] = useState<Set<string>>(() => new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isLoadingNextPageRef = useRef(false);
  const hasSyncedInitialUrl = useRef(false);
  const shouldSkipInitialAppsFetch = useRef(!isLocal);

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
        sort,
        activeIosVersion,
        iosVersionOperator
      }),
    [activeIosVersion, iosVersionOperator, selectedCategory, selectedSourceId, sort, trimmedQuery]
  );
  const currentRequestKey = useRef(requestKey);
  const hasActiveFilters =
    trimmedQuery.length > 0 ||
    selectedSourceId !== ALL_SOURCES ||
    selectedCategory !== "all" ||
    sort !== DEFAULT_SORT ||
    trimmedIosVersion.length > 0 ||
    iosVersionOperator !== DEFAULT_IOS_OPERATOR;

  // Local mode: filter/sort the fixed app list in memory, no network calls.
  const localFiltered = useMemo(() => {
    if (!isLocal) {
      return [];
    }

    let filtered = localApps ?? [];
    if (selectedCategory !== "all") {
      filtered = filtered.filter((app) => app.category === selectedCategory);
    }
    if (trimmedQuery.length > 0) {
      const terms = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);
      filtered = filtered.filter((app) => terms.every((term) => appSearchText(app).includes(term)));
    }
    return sortLocalApps(filtered, sort);
  }, [isLocal, localApps, selectedCategory, sort, trimmedQuery]);

  const apps = isLocal ? localFiltered : remoteApps;
  const effectivePagination: Pagination = isLocal
    ? {
        page: 1,
        pageSize: apps.length,
        totalItems: apps.length,
        totalPages: apps.length > 0 ? 1 : 0,
        hasNextPage: false,
        hasPreviousPage: false
      }
    : pagination;
  const effectiveCategories = isLocal ? facetsFromApps(localApps ?? []) : categories.length > 0 ? categories : HOME_EMPTY_CATEGORIES;

  useEffect(() => {
    onSourcesChange?.(sources);
  }, [onSourcesChange, sources]);

  useEffect(() => {
    onPaginationChange?.(effectivePagination);
  }, [onPaginationChange, effectivePagination]);

  // Fetch sources for the source filter, unless already provided.
  useEffect(() => {
    if (isLocal || !showSourceFilter || sources.length > 0) {
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
        }
      } catch {
        // Non-fatal: source filter just stays empty.
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
  }, [isLocal, showSourceFilter, sources.length]);

  // Reset paging when filters change.
  useEffect(() => {
    if (isLocal) {
      return;
    }

    if (requestKey !== currentRequestKey.current) {
      isLoadingNextPageRef.current = false;
      setRemoteApps([]);
      setPagination(HOME_EMPTY_PAGINATION);
      setPage(1);
    }
  }, [isLocal, requestKey]);

  // Optional URL sync (home page only).
  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") {
      return;
    }

    function applyUrlState() {
      const nextState = parseHomeUrlState(new URLSearchParams(window.location.search));
      isLoadingNextPageRef.current = false;
      setQuery(nextState.query);
      setSelectedSourceId(nextState.selectedSourceId);
      setSelectedCategory(nextState.selectedCategory);
      setSort(nextState.sort);
      setIosVersion(nextState.iosVersion);
      setIosVersionOperator(nextState.iosVersionOperator);
      setRemoteApps([]);
      setPagination(HOME_EMPTY_PAGINATION);
      setPage(1);
    }

    window.addEventListener("popstate", applyUrlState);
    return () => window.removeEventListener("popstate", applyUrlState);
  }, [syncUrl]);

  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") {
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
      if (sort !== DEFAULT_SORT) {
        params.set("sort", sort);
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
  }, [syncUrl, iosVersionOperator, selectedCategory, selectedSourceId, sort, trimmedIosVersion, trimmedQuery]);

  // Remote fetch on filter/page change.
  useEffect(() => {
    if (isLocal || !fetchList) {
      return;
    }
    const runFetchList = fetchList;

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
          const result = await runFetchList({
            sourceId,
            category: selectedCategory,
            sort,
            iosVersion: activeIosVersion,
            iosVersionOperator,
            page,
            pageSize,
            query: trimmedQuery.length > 0 ? trimmedQuery : undefined
          });

          if (!isCancelled) {
            currentRequestKey.current = requestKey;
            setRemoteApps((currentApps) => {
              if (page === 1) {
                return result.apps;
              }

              const seenIds = new Set(currentApps.map((app) => app.id));
              const newApps = result.apps.filter((app) => !seenIds.has(app.id));
              return [...currentApps, ...newApps];
            });
            if (result.categories) {
              setCategories(result.categories);
            }
            setPagination(result.pagination);
            setError(null);
          }
        } catch (caught) {
          if (!isCancelled) {
            setRemoteApps([]);
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
  }, [
    isLocal,
    fetchList,
    activeIosVersion,
    iosVersionOperator,
    page,
    pageSize,
    requestKey,
    selectedCategory,
    selectedSourceId,
    sort,
    trimmedQuery
  ]);

  useEffect(() => {
    function syncDownloadedApps(event?: StorageEvent) {
      if (event && event.key !== DOWNLOADED_APPS_STORAGE_KEY && event.key !== null) {
        return;
      }

      setDownloadedAppIds(readDownloadedAppIds());
    }

    syncDownloadedApps();
    window.addEventListener("storage", syncDownloadedApps);

    return () => window.removeEventListener("storage", syncDownloadedApps);
  }, []);

  const handleDownloadStarted = useCallback(
    (download: { appId: string; appName: string; sourceId: string; sourceName: string }) => {
      const record = recordDownloadedApp(download);
      if (!record) {
        return;
      }

      setDownloadedAppIds((currentIds) => new Set(currentIds).add(record.appId));
    },
    []
  );

  const loadNextPage = useCallback(() => {
    if (isLocal || !effectivePagination.hasNextPage || isLoadingApps || isLoadingNextPageRef.current) {
      return;
    }

    isLoadingNextPageRef.current = true;
    setPage((currentPage) => currentPage + 1);
  }, [isLocal, isLoadingApps, effectivePagination.hasNextPage]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (isLocal || !node || !effectivePagination.hasNextPage) {
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
      { rootMargin: "600px 0px" }
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
  }, [isLocal, loadNextPage, effectivePagination.hasNextPage, apps.length]);

  const visibleCategories = useMemo(
    () => effectiveCategories.filter((category) => category.id === "all" || category.appCount > 0),
    [effectiveCategories]
  );
  const isInitialLoading = !isLocal && isLoadingApps && apps.length === 0;
  const isLoadingMore = !isLocal && isLoadingApps && apps.length > 0;

  function resetFilters() {
    isLoadingNextPageRef.current = false;
    setQuery("");
    setSelectedSourceId(ALL_SOURCES);
    setSelectedCategory("all");
    setSort(DEFAULT_SORT);
    setIosVersion("");
    setIosVersionOperator(DEFAULT_IOS_OPERATOR);
    setRemoteApps([]);
    setPagination(HOME_EMPTY_PAGINATION);
    setPage(1);
  }

  const showFilterCard = showSearch || showCategoryFilter || showSourceFilter || showSortFilter || showIosVersionFilter;

  return (
    <div className="space-y-4">
      {showFilterCard ? (
        <Card>
          <CardHeader className="flex gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Filter apps</CardTitle>
              <CardDescription className="hidden sm:block">Choose a category, source, sort, or iOS version.</CardDescription>
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
          <CardContent className="space-y-3 p-3 pt-0">
            {showSearch ? (
              <Input
                className="h-9"
                placeholder="Search apps, bundle IDs, developers..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            ) : null}

            {showCategoryFilter ? (
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
            ) : null}

            {showSourceFilter || showSortFilter || showIosVersionFilter ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_14rem_11rem]">
                {showSourceFilter ? (
                  <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder={isLoadingSources ? "Loading sources..." : "All sources"} />
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
                ) : null}
                {showSortFilter ? (
                  <Select value={sort} onValueChange={(value) => setSort(value as AppSort)}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Sort results" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">{SORT_LABELS.recent}</SelectItem>
                      <SelectItem value="name-asc">{SORT_LABELS["name-asc"]}</SelectItem>
                      <SelectItem value="name-desc">{SORT_LABELS["name-desc"]}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {showIosVersionFilter ? (
                  <>
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
                  </>
                ) : null}
              </div>
            ) : null}

            {hasActiveFilters ? (
              <div className="flex flex-wrap gap-2 rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10">
                <span className="self-center text-xs font-medium text-muted-foreground">Active:</span>
                {trimmedQuery ? <Badge variant="outline">Search: {trimmedQuery}</Badge> : null}
                {selectedCategory !== "all" ? <Badge variant="outline">{CATEGORY_LABELS[selectedCategory]}</Badge> : null}
                {selectedSource ? <Badge variant="outline">{selectedSource.name}</Badge> : null}
                {sort !== DEFAULT_SORT ? <Badge variant="outline">Sort: {SORT_LABELS[sort]}</Badge> : null}
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
      ) : null}

      {error ? (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardHeader>
            <CardTitle>Could not load apps</CardTitle>
            <CardDescription>{error} You can try adjusting filters or checking back in a moment.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {isInitialLoading
                ? "Loading apps..."
                : `${apps.length} of ${effectivePagination.totalItems} app${effectivePagination.totalItems === 1 ? "" : "s"} shown`}
            </p>
          </div>
        </div>

        {isInitialLoading ? (
          <AppGridSkeleton />
        ) : apps.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                isDownloaded={downloadedAppIds.has(app.id)}
                onDownloadStarted={handleDownloadStarted}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{hasActiveFilters ? "No apps match these filters" : "No apps to show"}</CardTitle>
              <CardDescription>
                {hasActiveFilters ? "Try a broader search or another filter." : "Check back in a moment."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}

        {!isLocal && apps.length > 0 ? (
          <div ref={loadMoreRef} className="flex flex-col items-center gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            {effectivePagination.hasNextPage ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {isLoadingMore
                    ? "Loading more apps..."
                    : `${effectivePagination.totalItems - apps.length} more app${
                        effectivePagination.totalItems - apps.length === 1 ? "" : "s"
                      } available`}
                </p>
                <Button variant="outline" disabled={isLoadingApps} onClick={loadNextPage}>
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">You have reached the end of the results.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
