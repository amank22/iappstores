"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppDto, SourceDto } from "@iappstores/contracts";
import { AppCard } from "@/components/app-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllApps, fetchSourceApps, fetchSources, searchApps } from "@/lib/api";

const ALL_SOURCES = "all";

function AppGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <div className="flex gap-4">
              <Skeleton className="h-16 w-16 rounded-2xl" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
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
  const [selectedSourceId, setSelectedSourceId] = useState(ALL_SOURCES);
  const [query, setQuery] = useState("");
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId),
    [selectedSourceId, sources]
  );

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
    if (sources.length === 0) {
      setApps([]);
      setIsLoadingApps(false);
      return;
    }

    let isCancelled = false;
    const timeout = setTimeout(() => {
      async function loadApps() {
        setIsLoadingApps(true);
        try {
          const trimmedQuery = query.trim();
          const sourceId = selectedSourceId === ALL_SOURCES ? undefined : selectedSourceId;
          const nextApps =
            trimmedQuery.length > 0
              ? (await searchApps(trimmedQuery, sourceId)).apps
              : sourceId
                ? (await fetchSourceApps(sourceId)).apps
                : await fetchAllApps(sources);

          if (!isCancelled) {
            setApps(nextApps);
            setError(null);
          }
        } catch (caught) {
          if (!isCancelled) {
            setApps([]);
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
  }, [query, selectedSourceId, sources]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.24),_transparent_36rem)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="space-y-6 rounded-3xl border border-border/80 bg-card/70 p-6 shadow-2xl backdrop-blur md:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <Badge variant="secondary">AltStore and SideStore repositories</Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">iappstores</h1>
                <p className="text-lg text-muted-foreground">
                  Browse manually configured iOS app store sources, search across repositories, and jump straight to
                  IPA downloads when a source exposes them.
                </p>
              </div>
            </div>
            <Card className="lg:w-80">
              <CardHeader>
                <CardTitle>Sources</CardTitle>
                <CardDescription>
                  {isLoadingSources
                    ? "Loading configured repositories..."
                    : `${sources.length} configured source${sources.length === 1 ? "" : "s"}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sources.map((source) => (
                  <div key={source.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium">{source.name}</div>
                    <div className="mt-1 text-muted-foreground">{source.subtitle}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            <CardHeader>
              <CardTitle>Search apps</CardTitle>
              <CardDescription>
                Search by app name, bundle id, developer, subtitle, or description.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Try Delta, emulator, signing..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source filter</CardTitle>
              <CardDescription>{selectedSource ? selectedSource.name : "All configured sources"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
                <option value={ALL_SOURCES}>All sources</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </Select>
              <div className="hidden flex-wrap gap-2 lg:flex">
                <Button
                  variant={selectedSourceId === ALL_SOURCES ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSourceId(ALL_SOURCES)}
                >
                  All
                </Button>
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
            </CardContent>
          </Card>
        </section>

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
                {isLoadingApps ? "Loading apps..." : `${apps.length} app${apps.length === 1 ? "" : "s"} shown`}
              </p>
            </div>
            {query.trim().length > 0 ? <Badge variant="outline">Search: {query.trim()}</Badge> : null}
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
        </section>
      </div>
    </main>
  );
}
