import Link from "next/link";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/apps", label: "Apps" },
  { href: "/repositories", label: "Repositories" },
  { href: "/guides", label: "Guides" }
];

export function SiteHeader() {
  return (
    <header className="border-b border-foreground/10 bg-background/95">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href="/" className="flex w-fit items-center gap-2">
          <img src="/logo.svg" alt="iappstores logo" className="h-8 w-8 rounded-lg ring-1 ring-foreground/10" />
          <div>
            <div className="text-sm font-semibold tracking-tight">iappstores</div>
            <div className="text-xs text-muted-foreground">IPA repository browser</div>
          </div>
        </Link>
        <nav className="flex flex-wrap gap-2" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Button key={link.href} asChild variant={link.href === "/" ? "default" : "outline"} size="sm">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
