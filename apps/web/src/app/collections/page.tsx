import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCollection } from "@/lib/api";
import { COLLECTION_GROUP_LABELS, COLLECTION_GROUP_ORDER, COLLECTION_LINKS, type CollectionGroup } from "@/lib/collections";
import { currentIsoWeekKey, formatDate } from "@/lib/freshness";

export const metadata: Metadata = { title: "IPA App Collections", description: "Browse automatically generated IPA app collections for quality, freshness, popularity, and compatibility.", alternates: { canonical: "/collections" } };
export const dynamic = "force-dynamic";

type SortMode = "updated" | "name";
type GroupMode = "none" | "theme";
type Entry = { key: string; href: string; title: string; description: string; group: CollectionGroup | "updates"; updatedAt: number };

function latestUpdate(apps: Array<{ lastUpdatedAt?: string | null; versionDate?: string | null }>): number {
  let latest = 0;
  for (const app of apps) {
    const parsed = Date.parse(app.lastUpdatedAt ?? app.versionDate ?? "");
    if (Number.isFinite(parsed) && parsed > latest) latest = parsed;
  }
  return latest;
}

async function loadEntries(week: string): Promise<Entry[]> {
  const now = Date.now();
  const collections = await Promise.all(
    COLLECTION_LINKS.map(async (item): Promise<Entry> => {
      let updatedAt = 0;
      try { updatedAt = latestUpdate((await fetchCollection(item.slug)).apps); } catch { /* keep 0: sorts last */ }
      return { key: item.slug, href: `/collections/${item.slug}`, title: item.title, description: item.description, group: item.group, updatedAt };
    })
  );
  return [
    { key: "updates", href: "/updates", title: "Recently Updated", description: "The latest repository version releases.", group: "updates", updatedAt: now },
    { key: "weekly", href: `/updates/weekly/${week}`, title: "Apps Updated This Week", description: `Releases recorded during ${week}.`, group: "updates", updatedAt: now - 1 },
    ...collections
  ];
}

function sortEntries(entries: Entry[], sort: SortMode): Entry[] {
  return [...entries].sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt));
}

function EntryCard({ entry }: { entry: Entry }) {
  const isLive = entry.group === "updates";
  return <Link href={entry.href}><Card className="h-full transition-colors hover:bg-muted/30"><CardHeader><CardTitle>{entry.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>{entry.description}</p>{!isLive && entry.updatedAt > 0 ? <p className="text-xs">Updated {formatDate(new Date(entry.updatedAt).toISOString())}</p> : null}</CardContent></Card></Link>;
}

function Toggle({ label, options, current, href }: { label: string; options: Array<{ value: string; text: string }>; current: string; href: (value: string) => string }) {
  return <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{label}</span><div className="inline-flex overflow-hidden rounded-md ring-1 ring-foreground/10">{options.map((o) => <Link key={o.value} href={href(o.value)} replace scroll={false} aria-current={o.value === current ? "true" : undefined} className={`px-3 py-1.5 ${o.value === current ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>{o.text}</Link>)}</div></div>;
}

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ sort?: string; group?: string }> }) {
  const params = await searchParams;
  const sort: SortMode = params.sort === "name" ? "name" : "updated";
  const group: GroupMode = params.group === "none" ? "none" : "theme";
  const entries = sortEntries(await loadEntries(currentIsoWeekKey()), sort);
  const href = (next: Partial<{ sort: string; group: string }>) => {
    const query = new URLSearchParams();
    const s = next.sort ?? sort;
    const g = next.group ?? group;
    if (s !== "updated") query.set("sort", s);
    if (g !== "theme") query.set("group", g);
    const qs = query.toString();
    return qs ? `/collections?${qs}` : "/collections";
  };
  const sections = group === "theme"
    ? COLLECTION_GROUP_ORDER.map((id) => ({ id, label: COLLECTION_GROUP_LABELS[id], items: entries.filter((e) => e.group === id) })).filter((s) => s.items.length > 0)
    : [{ id: "all", label: "", items: entries }];
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-6xl space-y-6 px-3 py-6 sm:px-6"><section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><h1 className="text-4xl font-bold">IPA App Collections</h1><p className="mt-3 text-muted-foreground">Automatically generated discovery pages based on repository metadata and privacy-limited download activity.</p></section><div className="flex flex-wrap gap-x-6 gap-y-3"><Toggle label="Sort" current={sort} href={(v) => href({ sort: v })} options={[{ value: "updated", text: "Recently updated" }, { value: "name", text: "Name" }]} /><Toggle label="Group" current={group} href={(v) => href({ group: v })} options={[{ value: "theme", text: "By theme" }, { value: "none", text: "None" }]} /></div>{sections.map((section) => <section key={section.id} className="space-y-3">{section.label ? <h2 className="text-lg font-semibold">{section.label}</h2> : null}<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{section.items.map((entry) => <EntryCard key={entry.key} entry={entry} />)}</div></section>)}</div></main>;
}
