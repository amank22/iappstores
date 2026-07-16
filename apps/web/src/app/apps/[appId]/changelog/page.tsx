import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VersionHistory } from "@/components/version-history";
import { fetchAppVersions } from "@/lib/api";
import { getAppDisplayName, getAppPath } from "@/lib/seo";

export const dynamic = "force-dynamic";
async function load(id: string) { try { return await fetchAppVersions(id); } catch { notFound(); } }
export async function generateMetadata({ params }: { params: Promise<{ appId: string }> }): Promise<Metadata> { const { appId } = await params; const { app } = await load(appId); return { title: `${getAppDisplayName(app)} Changelog`, description: `Complete repository changelog for ${getAppDisplayName(app)}.`, alternates: { canonical: `${getAppPath(app)}/changelog` } }; }
export default async function ChangelogPage({ params }: { params: Promise<{ appId: string }> }) { const { appId } = await params; const { app, versions } = await load(appId); return <main className="min-h-screen bg-background text-foreground"><SiteHeader /><div className="mx-auto max-w-4xl space-y-5 px-3 py-6 sm:px-6"><section className="rounded-lg bg-card p-6 ring-1 ring-foreground/10"><p className="text-sm font-medium text-primary">Repository release notes</p><h1 className="mt-2 text-4xl font-bold">{getAppDisplayName(app)} Changelog</h1></section><VersionHistory app={app} versions={versions} showFullChangelog /></div></main>; }
