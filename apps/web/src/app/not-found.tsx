import Link from "next/link";
import { NotFoundSearch } from "@/components/not-found-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const popularSearches = ["YouTube", "Instagram", "Spotify", "TikTok"];
const categoryLinks = [
  { href: "/?category=games", label: "Games" },
  { href: "/?category=media", label: "Media apps" },
  { href: "/?category=tools", label: "Tools" },
  { href: "/?ios=16&iosOperator=lte", label: "iOS 16 compatible" }
];

export default function NotFound() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl place-items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="relative w-full overflow-hidden rounded-lg bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-8 lg:p-10">
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <img src="/logo.svg" alt="iappstores logo" className="h-14 w-14 rounded-lg ring-1 ring-foreground/10" />
                <Badge variant="secondary">404 - App route not found</Badge>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Lost IPA signal</p>
                <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
                  This app page slipped out of the repo.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  The link may be old, the app may have been removed from its source, or the bundle ID changed. Search
                  indexed IPA repositories to find direct downloads, tweaked builds, modded apps, and source notes.
                </p>
              </div>

              <NotFoundSearch />

              <div className="flex flex-wrap gap-2">
                {popularSearches.map((search) => (
                  <Button key={search} asChild variant="outline" size="sm">
                    <Link href={`/?q=${encodeURIComponent(search)}`}>{search}</Link>
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild variant="default">
                  <Link href="/">Back to homepage</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/sitemap.xml">Open sitemap</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Try a shortcut</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {categoryLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-lg bg-muted/40 px-4 py-3 text-sm font-medium text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
                    >
                      {link.label}
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <div className="rounded-lg bg-muted/40 p-5 text-sm leading-6 text-muted-foreground ring-1 ring-foreground/10">
                <div className="text-5xl font-black text-foreground">404</div>
                <p className="mt-3">
                  Tip: shareable app URLs work best with bundle IDs, for example
                  <span className="mt-2 block break-all rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                    /apps/com.google.ios.youtube
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
