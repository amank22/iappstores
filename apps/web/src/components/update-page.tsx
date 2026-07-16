import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { UpdateList } from "@/components/update-list";
import { Button } from "@/components/ui/button";
import { fetchUpdates } from "@/lib/api";

export async function UpdatePage({ title, description, from, to }: { title: string; description: string; from?: string; to?: string }) {
  const response = await fetchUpdates({ from, to, type: "version", pageSize: 100 });
  return <main className="min-h-screen bg-background text-foreground"><SiteHeader /><div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-6 sm:px-6 lg:px-8">
    <section className="rounded-lg bg-card p-5 ring-1 ring-foreground/10 sm:p-8"><p className="text-sm font-semibold uppercase tracking-wider text-primary">IPA freshness</p><h1 className="mt-2 text-3xl font-bold sm:text-5xl">{title}</h1><p className="mt-3 max-w-3xl text-muted-foreground">{description}</p><div className="mt-5 flex gap-2"><Button asChild variant="outline"><Link href="/updates/archive">Update archive</Link></Button><Button asChild variant="outline"><Link href="/feed.xml">RSS feed</Link></Button></div></section>
    <UpdateList events={response.events} />
  </div></main>;
}
