import Link from "next/link";
import { NotFoundSearch } from "@/components/not-found-search";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
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
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_38rem)]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl place-items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="relative w-full overflow-hidden rounded-[2rem] border border-border/80 bg-card/75 p-5 shadow-2xl backdrop-blur sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-8 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <img src="/logo.svg" alt="" className="h-14 w-14 rounded-2xl shadow-lg shadow-primary/20" />
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
                  <Link
                    key={search}
                    href={`/?q=${encodeURIComponent(search)}`}
                    className={buttonClasses({ variant: "outline", size: "sm" })}
                  >
                    {search}
                  </Link>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/" className={buttonClasses({ className: "rounded-2xl", variant: "default" })}>
                  Back to homepage
                </Link>
                <Link href="/sitemap.xml" className={buttonClasses({ className: "rounded-2xl", variant: "secondary" })}>
                  Open sitemap
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="rounded-3xl border-border/80 bg-background/50">
                <CardHeader>
                  <CardTitle>Try a shortcut</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {categoryLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-2xl border border-border/80 bg-card/60 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      {link.label}
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <div className="rounded-3xl border border-border/80 bg-background/40 p-5 text-sm leading-6 text-muted-foreground">
                <div className="text-5xl font-black text-foreground">404</div>
                <p className="mt-3">
                  Tip: shareable app URLs work best with bundle IDs, for example
                  <span className="mt-2 block break-all rounded-2xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
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
