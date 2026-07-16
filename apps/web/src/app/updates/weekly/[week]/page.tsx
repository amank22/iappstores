import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpdatePage } from "@/components/update-page";
import { isoWeekRange } from "@/lib/freshness";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ week: string }> }): Promise<Metadata> { const { week } = await params; return { title: `IPAs Updated ${week}`, description: `IPA releases recorded during UTC week ${week}.`, alternates: { canonical: `/updates/weekly/${week}` } }; }
export default async function WeeklyUpdates({ params }: { params: Promise<{ week: string }> }) { const { week } = await params; const range = isoWeekRange(week); if (!range) notFound(); return <UpdatePage title={`IPAs Updated ${week}`} description={`Version releases recorded during ISO week ${week} (UTC).`} {...range} />; }
