import { describe, expect, it } from "vitest";
import { layoutSponsorStrip, shuffled, type SponsorStripData } from "./sponsors";

function sponsor(id: string) {
  return {
    id,
    name: id,
    tagline: "A tagline for the app",
    url: "https://example.com",
    iconUrl: null,
    plan: "slot" as const,
    slug: null,
    description: null
  };
}

function strip(count: number, availableSlots: number): SponsorStripData {
  return {
    sponsors: Array.from({ length: count }, (_, index) => sponsor(`sp_${index}`)),
    totalSlots: 4,
    availableSlots,
    priceUsd: 30
  };
}

describe("layoutSponsorStrip", () => {
  it("fills an unsold strip with the house ad and the offer", () => {
    expect(layoutSponsorStrip(strip(0, 4))).toMatchObject({ sponsors: [], showHouseAd: true, showOffer: true });
  });

  it("drops the house ad once sponsors and the offer fill every slot", () => {
    const layout = layoutSponsorStrip(strip(3, 1));
    expect(layout.sponsors).toHaveLength(3);
    expect(layout).toMatchObject({ showHouseAd: false, showOffer: true });
  });

  it("shows only sponsors when sold out", () => {
    const layout = layoutSponsorStrip(strip(4, 0));
    expect(layout.sponsors).toHaveLength(4);
    expect(layout).toMatchObject({ showHouseAd: false, showOffer: false });
  });

  it("keeps the house ad but hides the offer when the free slots are being paid for or reviewed", () => {
    expect(layoutSponsorStrip(strip(2, 0))).toMatchObject({ showHouseAd: true, showOffer: false });
  });

  it("never shows more sponsors than there are slots", () => {
    expect(layoutSponsorStrip(strip(6, 0)).sponsors).toHaveLength(4);
  });
});

describe("shuffled", () => {
  it("keeps every item and leaves the input untouched", () => {
    const input = ["a", "b", "c", "d"];
    const output = shuffled(input, () => 0);
    expect([...output].sort()).toEqual(input);
    expect(output).not.toEqual(input);
    expect(input).toEqual(["a", "b", "c", "d"]);
  });
});
