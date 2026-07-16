import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpdatePage } from "@/components/update-page";
import { monthRange } from "@/lib/freshness";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ year: string; month: string }> }): Promise<Metadata> { const { year, month } = await params; return { title: `IPA Updates ${year}/${month}`, description: `IPA releases recorded during ${year}/${month}.`, alternates: { canonical: `/updates/${year}/${month}` } }; }
export default async function MonthlyUpdates({ params }: { params: Promise<{ year: string; month: string }> }) { const { year, month } = await params; const range = monthRange(year, month); if (!range) notFound(); return <UpdatePage title={`IPA Updates — ${year}/${month}`} description={`Version releases recorded during ${year}/${month} (UTC).`} {...range} />; }
