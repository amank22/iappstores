import type { Metadata } from "next";
import Link from "next/link";
import type { SponsorsResponse } from "@iappstores/contracts";
import { SponsorForm } from "@/components/sponsor-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSponsors } from "@/lib/api";

export const dynamic = "force-dynamic";

const title = "Sponsor iappstores: put your app on the home page";
const description =
  "Buy one of a few sponsor slots on the iappstores home page. A flat monthly price, shown to everyone browsing IPA apps, cancel any time.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/sponsor" },
  openGraph: { title, description, url: "/sponsor", siteName: "iappstores", type: "website" },
  twitter: { card: "summary", title, description }
};

const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "Where does my listing appear?",
    answer:
      "In the sponsored row on the home page, directly above the app list. Every visitor sees it before they start browsing. Your tile shows an icon, a name and one line of text, and links to your site."
  },
  {
    question: "Is one slot better than another?",
    answer:
      "No. Every slot costs the same, so the order of the row is reshuffled on each page load and each sponsor gets an equal share of first position."
  },
  {
    question: "When does it go live?",
    answer:
      "We look at every listing before it is shown, usually within a day of payment. If we can't accept it, we cancel the subscription and refund the payment."
  },
  {
    question: "How do I cancel?",
    answer:
      "Use the link in your Dodo Payments receipt at any time. Your listing stays up until the end of the month you already paid for, and the slot then goes back on sale."
  },
  {
    question: "What is not allowed?",
    answer:
      "Malware, phishing, adult content, gambling, anything illegal, and listings that pretend to be another app or company. The link must be https."
  }
];

async function loadSponsors(): Promise<SponsorsResponse | null> {
  try {
    return await fetchSponsors();
  } catch {
    return null;
  }
}

export default async function SponsorPage() {
  const sponsors = await loadSponsors();
  const priceUsd = sponsors?.priceUsd ?? 30;
  const available = sponsors?.slots.available ?? 0;
  const total = sponsors?.slots.total ?? 0;
  const canBuy = Boolean(sponsors?.checkoutEnabled) && available > 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-4 sm:px-6 sm:py-8">
        <Button asChild variant="secondary" className="self-start">
          <Link href="/">Back to apps</Link>
        </Button>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Sponsor slots</Badge>
            {sponsors?.checkoutEnabled ? (
              <Badge variant="outline">
                {available > 0 ? `${available} of ${total} available` : `All ${total} slots taken`}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Put your app on the iappstores home page</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            iappstores is where people look for iOS apps to sideload. A sponsor slot puts your app in a row at the top of
            the home page, above the app list, for <span className="font-semibold text-foreground">${priceUsd} a month</span>.
            There are only {total > 0 ? total : "a few"} slots, so the row never turns into a wall of ads.
          </p>
        </header>

        <SponsorForm priceUsd={priceUsd} canBuy={canBuy} soldOut={Boolean(sponsors?.checkoutEnabled) && available === 0} />

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
          <dl className="grid gap-3">
            {FAQ.map((item) => (
              <div key={item.question} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
                <dt className="text-sm font-semibold">{item.question}</dt>
                <dd className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
