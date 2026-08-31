import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppBrowser } from "@/components/app-browser";
import { fetchCollection } from "@/lib/api";
import { isCollectionSlug } from "@/lib/collections";

export const dynamic = "force-dynamic";
async function load(slug: string) { if (!isCollectionSlug(slug)) notFound(); try { return await fetchCollection(slug); } catch { notFound(); } }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const collection = await load(slug); return { title: collection.title, description: collection.description, alternates: { canonical: `/collections/${collection.slug}` } }; }
export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const collection = await load(slug); return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl space-y-6 px-3 py-6 sm:px-6 lg:px-8"><section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><p className="text-sm font-semibold uppercase tracking-wider text-primary">Auto-generated collection</p><h1 className="mt-2 text-4xl font-bold">{collection.title}</h1><p className="mt-3 max-w-3xl text-muted-foreground">{collection.description}</p><p className="mt-3 text-xs text-muted-foreground">Methodology: {collection.methodology}</p></section><AppBrowser localApps={collection.apps} showSourceFilter={false} showIosVersionFilter={false} title={collection.title} /></div></main>; }
