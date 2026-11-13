import type { SponsorDto, SponsorsResponse } from "@iappstores/contracts";

/** What the home page needs to draw its sponsor strip. */
export type SponsorStripData = {
  /** Paid sponsors, already in the order to show them. */
  sponsors: SponsorDto[];
  /** How many tiles the strip has room for (the number of slots on sale). */
  totalSlots: number;
  /** Slots still for sale. */
  availableSlots: number;
  priceUsd: number;
};

/** Shown when the API can't be reached: no paid sponsors, just the house ad. */
export const EMPTY_SPONSOR_STRIP: SponsorStripData = {
  sponsors: [],
  totalSlots: 4,
  availableSlots: 0,
  priceUsd: 30
};

/**
 * Every slot costs the same, so no sponsor should always sit first: the order is
 * reshuffled on each page render.
 */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function toSponsorStripData(response: SponsorsResponse): SponsorStripData {
  return {
    sponsors: shuffled(response.sponsors),
    totalSlots: response.slots.total,
    // With checkout closed nothing can be bought, so the strip shouldn't offer a slot.
    availableSlots: response.checkoutEnabled ? response.slots.available : 0,
    priceUsd: response.priceUsd
  };
}

export type SponsorStripLayout = {
  sponsors: SponsorDto[];
  /** Our own CorrectMyPaper tile, which fills a slot nobody has bought. */
  showHouseAd: boolean;
  /** The "your app here" tile, shown while a slot is for sale. */
  showOffer: boolean;
};

/** Decides which tiles the strip shows: paid sponsors first, then the offer, then the house ad if a slot is left. */
export function layoutSponsorStrip(data: SponsorStripData): SponsorStripLayout {
  const sponsors = data.sponsors.slice(0, data.totalSlots);
  const showOffer = data.availableSlots > 0;
  const used = sponsors.length + (showOffer ? 1 : 0);
  return { sponsors, showOffer, showHouseAd: used < data.totalSlots };
}
