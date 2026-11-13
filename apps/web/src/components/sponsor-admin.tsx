"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SponsorAdminItem, SponsorAdminResponse, SponsorStatus } from "@iappstores/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchSponsorAdmin, runSponsorAdminAction } from "@/lib/api";

const TOKEN_KEY = "iappstores.sponsorAdminToken";

const STATUS_LABELS: Record<SponsorStatus, string> = {
  checkout: "Paying",
  pending_review: "Needs review",
  live: "Live",
  queued: "Paid, no free slot",
  paused: "Payment failed",
  ended: "Ended",
  rejected: "Rejected"
};

type Action = "approve" | "reject" | "end";

const ACTIONS: Record<SponsorStatus, Action[]> = {
  checkout: [],
  pending_review: ["approve", "reject"],
  live: ["end"],
  queued: ["approve", "reject"],
  paused: ["end"],
  ended: [],
  rejected: []
};

const ACTION_LABELS: Record<Action, string> = { approve: "Approve", reject: "Reject", end: "End" };

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Review queue for paid sponsor listings. The token is SPONSOR_ADMIN_TOKEN on the API. */
export function SponsorAdmin() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [data, setData] = useState<SponsorAdminResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextToken: string) => {
    try {
      setData(await fetchSponsorAdmin(nextToken));
      setToken(nextToken);
      setError(null);
      try {
        window.sessionStorage.setItem(TOKEN_KEY, nextToken);
      } catch {
        // Storage can be blocked; the token then just isn't remembered.
      }
    } catch (caught) {
      setData(null);
      setToken("");
      setError(caught instanceof Error ? caught.message : "Could not load sponsors.");
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      saved = null;
    }
    if (saved) {
      void load(saved);
    }
  }, [load]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    void load(tokenInput.trim());
  }

  async function run(sponsor: SponsorAdminItem, action: Action) {
    if (action !== "approve" && !window.confirm(`${ACTION_LABELS[action]} "${sponsor.name}"? This also cancels its subscription.`)) {
      return;
    }
    setBusyId(sponsor.id);
    try {
      setData(await runSponsorAdminAction(token, sponsor.id, action));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the listing.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Sponsor listings</h1>

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive ring-1 ring-destructive/30">
            {error}
          </p>
        ) : null}
        {data?.warning ? (
          <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200 ring-1 ring-amber-500/30">
            {data.warning}
          </p>
        ) : null}

        {!data ? (
          <form onSubmit={signIn} className="flex max-w-md gap-2">
            <Input
              type="password"
              aria-label="Admin token"
              placeholder="Admin token"
              className="h-10 text-sm md:text-sm"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            <Button type="submit" className="h-10 px-4">
              Open
            </Button>
          </form>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {data.slots.total - data.slots.available} of {data.slots.total} slots in use. Refunds are issued in the Dodo
              Payments dashboard.
            </p>

            {data.sponsors.length === 0 ? <p className="text-sm text-muted-foreground">No listings yet.</p> : null}
            <ul className="grid gap-3">
              {data.sponsors.map((sponsor) => (
                <li key={sponsor.id} className="space-y-2 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{sponsor.name}</span>
                    <Badge variant={sponsor.status === "pending_review" || sponsor.status === "queued" ? "default" : "outline"}>
                      {STATUS_LABELS[sponsor.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(sponsor.createdAt)} · {sponsor.clicks.toLocaleString()} clicks
                      {sponsor.endsAt ? ` · ends ${formatDate(sponsor.endsAt)}` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{sponsor.tagline}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    <a href={sponsor.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
                      {sponsor.url}
                    </a>
                    {" · "}
                    {sponsor.email}
                    {sponsor.subscriptionId ? ` · ${sponsor.subscriptionId}` : ""}
                  </p>
                  {sponsor.iconUrl ? (
                    <img src={sponsor.iconUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-lg ring-1 ring-foreground/10" />
                  ) : null}
                  {ACTIONS[sponsor.status].length > 0 ? (
                    <div className="flex gap-2">
                      {ACTIONS[sponsor.status].map((action) => (
                        <Button
                          key={action}
                          size="sm"
                          variant={action === "approve" ? "default" : "outline"}
                          disabled={busyId === sponsor.id}
                          onClick={() => void run(sponsor, action)}
                        >
                          {ACTION_LABELS[action]}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold tracking-tight">Waitlist</h2>
              {data.waitlist.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is waiting.</p>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {data.waitlist.map((entry) => (
                    <li key={entry.email}>
                      {entry.email} <span className="text-muted-foreground">· {formatDate(entry.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
