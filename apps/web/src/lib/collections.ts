import type { CollectionSlug } from "@iappstores/contracts";

export const COLLECTION_LINKS: Array<{ slug: CollectionSlug; title: string; description: string }> = [
  { slug: "best-emulator-apps", title: "Best Emulator Apps", description: "Quality- and demand-ranked emulator IPA listings." },
  { slug: "best-music-apps", title: "Best Music Apps", description: "Fresh and popular music IPA listings." },
  { slug: "best-productivity-apps", title: "Best Productivity Apps", description: "Productivity apps ranked by freshness, demand, and metadata quality." },
  { slug: "trending-apps", title: "Trending Apps", description: "Apps with the strongest download activity over the last seven days." },
  { slug: "new-apps", title: "New Apps", description: "Apps recently observed for the first time." },
  { slug: "most-downloaded", title: "Most Downloaded", description: "The most downloaded apps in recorded site activity." },
  { slug: "ios-26-compatible", title: "iOS 26 Compatible Apps", description: "Apps whose metadata states a minimum iOS version of 26 or earlier." }
];

export function isCollectionSlug(value: string): value is CollectionSlug { return COLLECTION_LINKS.some((item) => item.slug === value); }
