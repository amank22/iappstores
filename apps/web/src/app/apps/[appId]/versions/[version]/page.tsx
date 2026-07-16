import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAppVersion } from "@/lib/api";
import { formatDate } from "@/lib/freshness";
import { getAppDisplayName, getAppPath } from "@/lib/seo";

export const dynamic = "force-dynamic";
async function load(id: string, version: string) { try { return await fetchAppVersion(id, version); } catch { notFound(); } }
export async function generateMetadata({ params }: { params: Promise<{ appId: string; version: string }> }): Promise<Metadata> { const { appId, version } = await params; const data = await load(appId, version); return { title: `${getAppDisplayName(data.app)} ${data.version.version}`, description: data.version.changelog ?? `Source builds and release details for version ${data.version.version}.`, alternates: { canonical: `${getAppPath(data.app)}/versions/${encodeURIComponent(data.version.version)}` } }; }
export default async function VersionPage({ params }: { params: Promise<{ appId: string; version: string }> }) { const { appId, version } = await params; const data = await load(appId, version); return <main className="min-h-screen bg-background text-foreground"><SiteHeader /><div className="mx-auto max-w-4xl space-y-5 px-3 py-6 sm:px-6"><section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><Badge>{formatDate(data.version.releaseDate ?? data.version.firstSeenAt)}</Badge><h1 className="mt-3 text-4xl font-bold">{getAppDisplayName(data.app)} {data.version.version}</h1><Link className="mt-3 inline-block text-primary hover:underline" href={`${getAppPath(data.app)}/versions`}>All versions</Link>{data.version.changelog ? <p className="mt-5 whitespace-pre-wrap text-muted-foreground">{data.version.changelog}</p> : null}</section><div className="grid gap-4">{data.version.builds.map((build) => <Card key={`${build.sourceId}:${build.downloadURL}`}><CardHeader><CardTitle>{build.sourceName}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>{build.minOSVersion ? `iOS ${build.minOSVersion}+` : "iOS requirement unavailable"}</p>{build.size ? <p>{build.size.toLocaleString()} bytes</p> : null}{build.changelog && build.changelog !== data.version.changelog ? <p className="whitespace-pre-wrap">{build.changelog}</p> : null}{build.downloadURL ? <a className="font-medium text-primary hover:underline" href={`/api/download?appId=${encodeURIComponent(data.app.id)}&sourceId=${encodeURIComponent(build.sourceId)}`}>Download from source</a> : null}</CardContent></Card>)}</div></div></main>; }
