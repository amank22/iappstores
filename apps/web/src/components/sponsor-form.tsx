"use client";

import { useState, type FormEvent } from "react";
import { SponsorCheckoutRequestSchema } from "@iappstores/contracts";
import { SponsorTile } from "@/components/sponsor-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinSponsorWaitlist, startSponsorCheckout } from "@/lib/api";

type FieldName = "name" | "tagline" | "url" | "iconUrl" | "email";

const FIELD_ERRORS: Record<FieldName, string> = {
  name: "Use 2 to 40 characters.",
  tagline: "Use 10 to 90 characters.",
  url: "Enter a full link that starts with https://",
  iconUrl: "Enter an image link that starts with https://, or leave it empty.",
  email: "Enter a valid email address."
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

export function SponsorForm({ priceUsd, canBuy, soldOut }: { priceUsd: number; canBuy: boolean; soldOut: boolean }) {
  const [values, setValues] = useState<Record<FieldName, string>>({ name: "", tagline: "", url: "", iconUrl: "", email: "" });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!canBuy) {
    return <WaitlistForm soldOut={soldOut} />;
  }

  function set(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const parsed = SponsorCheckoutRequestSchema.safeParse({
      ...values,
      iconUrl: values.iconUrl.trim() === "" ? undefined : values.iconUrl
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

      <div className="space-y-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview</span>
        <div className="flex max-w-sm">
          <SponsorTile
            href={values.url.trim().startsWith("https://") ? values.url.trim() : "#"}
            sponsor={{
              id: "preview",
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
