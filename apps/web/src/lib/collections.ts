import type { CollectionSlug } from "@iappstores/contracts";

export type CollectionGroup = "best-of" | "activity" | "compatibility";
export const COLLECTION_GROUP_LABELS: Record<CollectionGroup | "updates", string> = {
  "best-of": "Best of by category",
  activity: "Popularity & activity",
  compatibility: "Compatibility",
  updates: "Updates"
};
export const COLLECTION_GROUP_ORDER: Array<CollectionGroup | "updates"> = ["updates", "best-of", "activity", "compatibility"];

export const COLLECTION_LINKS: Array<{ slug: CollectionSlug; title: string; description: string; group: CollectionGroup }> = [
  { slug: "best-emulator-apps", title: "Best Emulator Apps", description: "Quality- and demand-ranked emulator IPA listings.", group: "best-of" },
  { slug: "best-music-apps", title: "Best Music Apps", description: "Fresh and popular music IPA listings.", group: "best-of" },
  { slug: "best-productivity-apps", title: "Best Productivity Apps", description: "Productivity apps ranked by freshness, demand, and metadata quality.", group: "best-of" },
  { slug: "trending-apps", title: "Trending Apps", description: "Apps with the strongest download activity over the last seven days.", group: "activity" },
  { slug: "new-apps", title: "New Apps", description: "Apps recently observed for the first time.", group: "activity" },
  { slug: "most-downloaded", title: "Most Downloaded", description: "The most downloaded apps in recorded site activity.", group: "activity" },
  { slug: "ios-26-compatible", title: "iOS 26 Compatible Apps", description: "Apps whose metadata states a minimum iOS version of 26 or earlier.", group: "compatibility" }
];

export function isCollectionSlug(value: string): value is CollectionSlug { return COLLECTION_LINKS.some((item) => item.slug === value); }
