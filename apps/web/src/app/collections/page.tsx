import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COLLECTION_LINKS } from "@/lib/collections";
import { currentIsoWeekKey } from "@/lib/freshness";

export const metadata: Metadata = { title: "IPA App Collections", description: "Browse automatically generated IPA app collections for quality, freshness, popularity, and compatibility.", alternates: { canonical: "/collections" } };
export default function CollectionsPage() { const week = currentIsoWeekKey(); const links = [...COLLECTION_LINKS, { slug: "../updates", title: "Recently Updated", description: "The latest repository version releases." }, { slug: `../updates/weekly/${week}`, title: "Apps Updated This Week", description: `Releases recorded during ${week}.` }]; return <main className="min-h-screen bg-background text-foreground"><SiteHeader /><div className="mx-auto max-w-6xl space-y-6 px-3 py-6 sm:px-6"><section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><h1 className="text-4xl font-bold">IPA App Collections</h1><p className="mt-3 text-muted-foreground">Automatically generated discovery pages based on repository metadata and privacy-limited download activity.</p></section><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{links.map((item) => <Link key={item.title} href={item.slug.startsWith("..") ? item.slug.slice(2) : `/collections/${item.slug}`}><Card className="h-full transition-colors hover:bg-muted/30"><CardHeader><CardTitle>{item.title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{item.description}</CardContent></Card></Link>)}</div></div></main>; }
