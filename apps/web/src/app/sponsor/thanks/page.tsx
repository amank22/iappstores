import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sponsor payment",
  robots: { index: false, follow: false }
};

type ThanksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Where Dodo Payments sends a sponsor back after checkout (see `return_url` in apps/api-go). */
export default async function SponsorThanksPage({ searchParams }: ThanksPageProps) {
  const params = await searchParams;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const failed = status === "failed" || status === "cancelled";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {failed ? "The payment did not go through" : "Thanks, your slot is booked"}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          {failed
            ? "Nothing was charged and your listing was not saved. You can try again; the slot is still held for you for a few minutes."
            : "We review every listing before it is shown, usually within a day. Once approved it appears in the sponsored row on the home page. Your receipt from Dodo Payments has a link to manage or cancel the subscription."}
        </p>
        <div className="flex gap-2">
          {failed ? (
            <Button asChild>
              <Link href="/sponsor">Try again</Link>
            </Button>
          ) : null}
          <Button asChild variant={failed ? "outline" : "default"}>
            <Link href="/">Back to apps</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
