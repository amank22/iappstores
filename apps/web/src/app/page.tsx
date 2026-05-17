"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Select } from "@/components/ui/select";
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

function AppGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl sm:h-16 sm:w-16" />
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
  const [sources, setSources] = useState<SourceDto[]>([]);
  const [apps, setApps] = useState<AppDto[]>([]);
  const [categories, setCategories] = useState<AppCategoryFacet[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [selectedSourceId, setSelectedSourceId] = useState(ALL_SOURCES);
  const [selectedCategory, setSelectedCategory] = useState<AppCategory>("all");
  const [iosVersion, setIosVersion] = useState("");
  const [iosVersionOperator, setIosVersionOperator] = useState<IosVersionOperator>("lte");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId),
    [selectedSourceId, sources]
  );
  const trimmedIosVersion = iosVersion.trim();
  const activeIosVersion = /^\d+(?:\.\d+){0,2}$/.test(trimmedIosVersion) ? trimmedIosVersion : undefined;

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
    setPage(1);
  }, [iosVersion, iosVersionOperator, query, selectedCategory, selectedSourceId]);

  useEffect(() => {
    let isCancelled = false;
    const timeout = setTimeout(() => {
      async function loadApps() {
        setIsLoadingApps(true);
        try {
          const trimmedQuery = query.trim();
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
            setApps(nextApps.apps);
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
  }, [activeIosVersion, iosVersionOperator, page, query, selectedCategory, selectedSourceId]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.id === "all" || category.appCount > 0),
    [categories]
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.24),_transparent_36rem)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-8 sm:px-6 sm:py-8 lg:px-8">
        <section className="rounded-3xl border border-border/80 bg-card/70 p-4 shadow-2xl backdrop-blur sm:p-6 md:p-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge variant="secondary">AltStore and SideStore repositories</Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">iappstores</h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-lg">
                Search iOS app store sources and jump straight to IPA downloads.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-80">
              <div className="rounded-2xl border border-border bg-background/50 p-3">
                <div className="text-2xl font-semibold">{isLoadingSources ? "-" : sources.length}</div>
                <div className="text-muted-foreground">Sources</div>
              </div>
              <div className="rounded-2xl border border-border bg-background/50 p-3">
                <div className="text-2xl font-semibold">{pagination.totalItems}</div>
                <div className="text-muted-foreground">{query.trim() ? "Matches" : "Apps"}</div>
              </div>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle>Browse apps</CardTitle>
            <CardDescription>Search, filter by source, or jump into lightweight discovery groups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <Input
                placeholder="Try Delta, emulator, signing..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
                <option value={ALL_SOURCES}>All sources</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
              <Select
                value={iosVersionOperator}
                onChange={(event) => setIosVersionOperator(event.target.value as IosVersionOperator)}
              >
                <option value="lte">Compatible with iOS</option>
                <option value="gte">Requires at least iOS</option>
              </Select>
              <Input
                inputMode="decimal"
                pattern="[0-9]+(\\.[0-9]+){0,2}"
                placeholder="Version, e.g. 16.0"
                value={iosVersion}
                onChange={(event) => setIosVersion(event.target.value)}
              />
              {trimmedIosVersion ? (
                <Button variant="outline" size="sm" className="h-11" onClick={() => setIosVersion("")}>
                  Clear
                </Button>
              ) : null}
            </div>
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
            {selectedSource ? (
              <p className="text-sm text-muted-foreground">
                Browsing {selectedSource.name}. {selectedSource.subtitle}
              </p>
            ) : sources.length > 1 ? (
              <div className="hidden flex-wrap gap-2 lg:flex">
                {sources.map((source) => (
                  <Button
                    key={source.id}
                    variant={selectedSourceId === source.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSourceId(source.id)}
                  >
                    {source.name}
                  </Button>
                ))}
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
                {isLoadingApps
                  ? "Loading apps..."
                  : `${pagination.totalItems} app${pagination.totalItems === 1 ? "" : "s"} found`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {query.trim().length > 0 ? <Badge variant="outline">Search: {query.trim()}</Badge> : null}
              {selectedCategory !== "all" ? <Badge variant="outline">{CATEGORY_LABELS[selectedCategory]}</Badge> : null}
              {trimmedIosVersion ? (
                <Badge variant="outline">
                  {activeIosVersion
                    ? `${IOS_FILTER_LABELS[iosVersionOperator]} ${activeIosVersion}`
                    : "Enter iOS version like 16.0"}
                </Badge>
              ) : null}
              {pagination.totalPages > 0 ? (
                <Badge variant="secondary">
                  Page {pagination.page} of {pagination.totalPages}
                </Badge>
              ) : null}
            </div>
          </div>

          {isLoadingApps ? (
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

          {pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPreviousPage || isLoadingApps}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNextPage || isLoadingApps}
                onClick={() => setPage((currentPage) => currentPage + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
