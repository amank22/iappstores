"use client";

import { useState, type FormEvent } from "react";
import { SponsorCheckoutRequestSchema, type SponsorPlan } from "@iappstores/contracts";
import { SponsorTile } from "@/components/sponsor-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinSponsorWaitlist, startSponsorCheckout } from "@/lib/api";
import { cn } from "@/lib/utils";

type FieldName = "name" | "tagline" | "url" | "iconUrl" | "email" | "description";

const DESCRIPTION_MIN = 200;
const DESCRIPTION_MAX = 3000;

const FIELD_ERRORS: Record<FieldName, string> = {
  name: "Use 2 to 40 characters.",
  tagline: "Use 10 to 90 characters.",
  url: "Enter a full link that starts with https://",
  iconUrl: "Enter an image link that starts with https://, or leave it empty.",
  email: "Enter a valid email address.",
  description: `Write ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`
};

export type SponsorPlanOffer = {
  plan: SponsorPlan;
  priceUsd: number;
  title: string;
  points: string[];
};

const inputClass = "h-10 text-sm md:text-sm";

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-xs text-destructive">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function WaitlistForm({ soldOut }: { soldOut: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      await joinSponsorWaitlist(email.trim());
      setState("done");
    } catch (caught) {
      setState("idle");
      setError(caught instanceof Error ? caught.message : "Could not join the waitlist.");
    }
  }

  return (
    <section className="space-y-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">
        {soldOut ? "Every slot is taken right now" : "Sponsor slots open soon"}
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        {soldOut
          ? "Leave your email and we will write to you when a slot frees up, in the order people signed up."
          : "Leave your email and we will write to you when slots go on sale."}
      </p>
      {state === "done" ? (
        <p role="status" className="text-sm font-medium text-emerald-400">
          You are on the list. We will email you when a slot is free.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            required
            aria-label="Email address"
            placeholder="you@example.com"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" className="h-10 shrink-0 px-4" disabled={state === "sending"}>
            {state === "sending" ? "Joining..." : "Join the waitlist"}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** The booking form. `offers` are the plans on sale; with none, it becomes the waitlist form. */
export function SponsorForm({ offers, soldOut }: { offers: SponsorPlanOffer[]; soldOut: boolean }) {
  const [plan, setPlan] = useState<SponsorPlan>(offers[0]?.plan ?? "slot");
  const [values, setValues] = useState<Record<FieldName, string>>({
    name: "",
    tagline: "",
    url: "",
    iconUrl: "",
    email: "",
    description: ""
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const offer = offers.find((candidate) => candidate.plan === plan);
  if (!offer) {
    return <WaitlistForm soldOut={soldOut} />;
  }
  const priceUsd = offer.priceUsd;

  function set(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const parsed = SponsorCheckoutRequestSchema.safeParse({
      ...values,
      plan,
      iconUrl: values.iconUrl.trim() === "" ? undefined : values.iconUrl,
      description: plan === "page" ? values.description : undefined
    });
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        next[field] = FIELD_ERRORS[field];
      }
      setErrors(next);
      return;
    }

    setIsSubmitting(true);
    try {
      // Leaves the site for Dodo's hosted checkout; the slot is held meanwhile.
      window.location.assign(await startSponsorCheckout(parsed.data));
    } catch (caught) {
      setIsSubmitting(false);
      setSubmitError(caught instanceof Error ? caught.message : "Could not start checkout.");
    }
  }

  return (
    <section className="space-y-4 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Book a slot</h2>
        <p className="text-sm text-muted-foreground">
          Fill in your listing, then pay ${priceUsd}/month on the next page. Your slot is held for 30 minutes while you
          check out.
        </p>
      </div>

      {offers.length > 1 ? (
        <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2">
          {offers.map((candidate) => {
            const selected = candidate.plan === plan;
            return (
              <button
                key={candidate.plan}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlan(candidate.plan)}
                className={cn(
                  "flex flex-col gap-2 rounded-lg p-4 text-left ring-1 transition-colors",
                  selected ? "bg-primary/10 ring-primary/60" : "bg-muted/30 ring-foreground/10 hover:bg-muted/60"
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{candidate.title}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    ${candidate.priceUsd}
                    <span className="font-normal text-muted-foreground">/mo</span>
                  </span>
                </span>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                  {candidate.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview</span>
        <div className="flex max-w-sm">
          <SponsorTile
            href={values.url.trim().startsWith("https://") ? values.url.trim() : "#"}
            sponsor={{
              id: "preview",
              plan: "slot",
              slug: null,
              description: null,
              name: values.name.trim() || "Your app",
              tagline: values.tagline.trim() || "One line about what it does",
              url: values.url,
              iconUrl: values.iconUrl.trim().startsWith("https://") ? values.iconUrl.trim() : null
            }}
          />
        </div>
      </div>

      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="App name" error={errors.name}>
          <Input
            className={inputClass}
            maxLength={40}
            aria-invalid={Boolean(errors.name)}
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field label="Link" hint="Where a click should go." error={errors.url}>
          <Input
            className={inputClass}
            type="url"
            placeholder="https://"
            aria-invalid={Boolean(errors.url)}
            value={values.url}
            onChange={(event) => set("url", event.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Tagline" hint={`${values.tagline.trim().length}/90 characters`} error={errors.tagline}>
            <Input
              className={inputClass}
              maxLength={90}
              aria-invalid={Boolean(errors.tagline)}
              value={values.tagline}
              onChange={(event) => set("tagline", event.target.value)}
            />
          </Field>
        </div>
        {plan === "page" ? (
          <div className="sm:col-span-2">
            <Field
              label="Page text"
              hint={`${values.description.trim().length.toLocaleString("en-US")}/${DESCRIPTION_MAX.toLocaleString("en-US")} characters, at least ${DESCRIPTION_MIN}. Plain text; leave a blank line between paragraphs.`}
              error={errors.description}
            >
              <textarea
                rows={8}
                maxLength={DESCRIPTION_MAX}
                aria-invalid={Boolean(errors.description)}
                placeholder="What the app does, who it is for, what makes it different, how to get it."
                className="w-full rounded-md border border-input bg-input/20 px-2 py-2 text-sm leading-6 outline-hidden transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30"
                value={values.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <Field label="Icon link (optional)" hint="A square PNG or JPG, at least 72 px." error={errors.iconUrl}>
          <Input
            className={inputClass}
            type="url"
            placeholder="https://"
            aria-invalid={Boolean(errors.iconUrl)}
            value={values.iconUrl}
            onChange={(event) => set("iconUrl", event.target.value)}
          />
        </Field>
        <Field label="Your email" hint="For the receipt and questions about your listing." error={errors.email}>
          <Input
            className={inputClass}
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
          />
        </Field>

        <div className="space-y-2 sm:col-span-2">
          <Button type="submit" size="lg" className="h-10 px-5" disabled={isSubmitting}>
            {isSubmitting ? "Opening checkout..." : `Continue to payment · $${priceUsd}/month`}
          </Button>
          {submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Payment is handled by Dodo Payments. Listings are reviewed before they go live.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
