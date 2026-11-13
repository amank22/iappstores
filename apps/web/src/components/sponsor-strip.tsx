"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, MegaphoneIcon, NotePencilIcon } from "@phosphor-icons/react";
import type { SponsorDto } from "@iappstores/contracts";
import { trackCrossPromoClick, trackSponsorClick } from "@/lib/analytics";
import { getSponsorOutboundPath, getSponsorPagePath, layoutSponsorStrip, type SponsorStripData } from "@/lib/sponsors";
import { getCorrectMyPaperUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const tileClass =
  "group flex min-w-[15rem] max-w-xl flex-1 items-center gap-3 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring";

export function SponsorIcon({
  sponsor,
  className = "size-9 rounded-lg text-sm"
}: {
  sponsor: Pick<SponsorDto, "name" | "iconUrl">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A server-rendered image can fail before React attaches onError, so also check once
  // on mount whether it already loaded as broken.
  const checkLoaded = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);

  if (sponsor.iconUrl && !failed) {
    return (
      <img
        ref={checkLoaded}
        src={sponsor.iconUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("shrink-0 object-cover ring-1 ring-foreground/10", className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-muted font-semibold text-muted-foreground ring-1 ring-foreground/10",
        className
      )}
    >
      {sponsor.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function TileText({ name, tagline }: { name: string; tagline: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold leading-5">{name}</span>
      <span className="block truncate text-xs leading-4 text-muted-foreground">{tagline}</span>
    </span>
  );
}

/**
 * One sponsor tile. A sponsor with a dedicated page links to it; the others link out
 * through the click counter. `href` overrides both (used for the form's preview).
 */
export function SponsorTile({ sponsor, href }: { sponsor: SponsorDto; href?: string }) {
  const pagePath = href ? null : getSponsorPagePath(sponsor);
  if (pagePath) {
    return (
      <Link
        href={pagePath}
        onClick={() => trackSponsorClick({ sponsorId: sponsor.id, sponsorName: sponsor.name })}
        className={tileClass}
      >
        <SponsorIcon sponsor={sponsor} />
        <TileText name={sponsor.name} tagline={sponsor.tagline} />
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
      </Link>
    );
  }

  return (
    <a
      href={href ?? getSponsorOutboundPath(sponsor)}
      target="_blank"
      // Paid links must be marked as such for search engines.
      rel="sponsored nofollow noopener"
      onClick={() => trackSponsorClick({ sponsorId: sponsor.id, sponsorName: sponsor.name })}
      className={tileClass}
    >
      <SponsorIcon sponsor={sponsor} />
      <TileText name={sponsor.name} tagline={sponsor.tagline} />
      <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
    </a>
  );
}

function HouseAdTile() {
  const href = getCorrectMyPaperUrl("home_sponsor_strip");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => trackCrossPromoClick({ placement: "home_sponsor_strip", destination: href })}
      className={tileClass}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25"
      >
        <NotePencilIcon className="size-5" />
      </span>
      <TileText name="CorrectMyPaper" tagline="AI proofreading for papers and essays" />
      <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
    </a>
  );
}

function OfferTile({ priceUsd, availableSlots }: { priceUsd: number; availableSlots: number }) {
  return (
    <Link
      href="/sponsor"
      className={cn(tileClass, "bg-transparent ring-0 outline-1 outline-dashed outline-foreground/20 hover:outline-foreground/40")}
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"
      >
        <MegaphoneIcon className="size-5" />
      </span>
      <TileText
        name="Your app here"
        tagline={`$${priceUsd}/month · ${availableSlots} ${availableSlots === 1 ? "slot" : "slots"} left`}
      />
    </Link>
  );
}

/** The home page's row of paid sponsor slots. Unsold slots show our own ad and an offer to buy one. */
export function SponsorStrip({ data }: { data: SponsorStripData }) {
  const layout = layoutSponsorStrip(data);

  return (
    <section aria-label="Sponsors" className="space-y-1.5">
      <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        <span className="font-medium uppercase tracking-wider">Sponsored</span>
        <Link href="/sponsor" className="underline-offset-4 hover:text-foreground hover:underline">
          Advertise here
        </Link>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {layout.sponsors.map((sponsor) => (
          <SponsorTile key={sponsor.id} sponsor={sponsor} />
        ))}
        {layout.showHouseAd ? <HouseAdTile /> : null}
        {layout.showOffer ? <OfferTile priceUsd={data.priceUsd} availableSlots={data.availableSlots} /> : null}
      </div>
    </section>
  );
}
