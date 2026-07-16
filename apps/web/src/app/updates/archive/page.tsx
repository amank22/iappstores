import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchUpdateArchives } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "IPA Update Archive", description: "Permanent weekly and monthly IPA update archives.", alternates: { canonical: "/updates/archive" } };
export default async function ArchivePage() {
  const archives = await fetchUpdateArchives();
  return <main className="min-h-screen bg-background text-foreground"><SiteHeader /><div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:px-6">
    <section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><h1 className="text-4xl font-bold">IPA Update Archive</h1><p className="mt-3 text-muted-foreground">Permanent UTC archives generated from observed app release history.</p></section>
    <div className="grid gap-5 md:grid-cols-2"><Card><CardHeader><CardTitle>Weekly archives</CardTitle></CardHeader><CardContent className="grid gap-2">{archives.weeks.map((archive) => <Link key={archive.key} className="rounded-md bg-muted/40 p-3 hover:bg-muted" href={`/updates/weekly/${archive.key}`}>{archive.key} · {archive.eventCount} updates</Link>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Monthly archives</CardTitle></CardHeader><CardContent className="grid gap-2">{archives.months.map((archive) => <Link key={archive.key} className="rounded-md bg-muted/40 p-3 hover:bg-muted" href={`/updates/${archive.key}`}>{archive.key} · {archive.eventCount} updates</Link>)}</CardContent></Card></div>
  </div></main>;
}
