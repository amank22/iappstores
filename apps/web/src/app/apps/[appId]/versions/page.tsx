import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VersionHistory } from "@/components/version-history";
import { Button } from "@/components/ui/button";
import { fetchAppVersions } from "@/lib/api";
import { getAppDisplayName, getAppPath, getShareId } from "@/lib/seo";

export const dynamic = "force-dynamic";
async function load(id: string) { try { return await fetchAppVersions(id); } catch { notFound(); } }
export async function generateMetadata({ params }: { params: Promise<{ appId: string }> }): Promise<Metadata> { const { appId } = await params; const { app } = await load(appId); const name = getAppDisplayName(app); return { title: `${name} Version History`, description: `Release timeline, versions, source builds, and changelogs for ${name}.`, alternates: { canonical: `${getAppPath(app)}/versions` } }; }
export default async function VersionsPage({ params }: { params: Promise<{ appId: string }> }) { const { appId } = await params; const { app, versions } = await load(appId); if (appId.toLowerCase() !== getShareId(app).toLowerCase()) permanentRedirect(`${getAppPath(app)}/versions`); return <main className="min-h-screen bg-background text-foreground"><SiteHeader /><div className="mx-auto max-w-4xl space-y-5 px-3 py-6 sm:px-6"><section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><p className="text-sm font-medium text-primary">Release timeline</p><h1 className="mt-2 text-4xl font-bold">{getAppDisplayName(app)} Version History</h1><p className="mt-3 text-muted-foreground">Historical versions preserved from repository metadata and future observations.</p><div className="mt-4 flex gap-2"><Button asChild variant="outline"><Link href={getAppPath(app)}>Latest</Link></Button><Button asChild variant="outline"><Link href={`${getAppPath(app)}/changelog`}>Full changelog</Link></Button></div></section><VersionHistory app={app} versions={versions} /></div></main>; }
