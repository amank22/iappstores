import type { AppCategory, AppDto, DerivedAppCategory } from "@iappstores/contracts";
import { getAbsoluteUrl } from "@/lib/site";

export const INDEXABLE_CATEGORIES = ["recent", "games", "tools", "media", "education"] as const;
export type IndexableCategory = (typeof INDEXABLE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  all: "All apps",
  recent: "Recently updated apps",
  games: "Games",
  tools: "Tools",
  media: "Media",
  education: "Education"
};

export const CATEGORY_DESCRIPTIONS: Record<IndexableCategory, string> = {
  recent:
    "Browse recently updated IPA listings from AltStore and SideStore compatible repositories. These pages help you find fresh builds, changed repository notes, and updated download options without relying on search filters.",
  games:
    "Explore iOS game IPA listings, including emulator-related apps, arcade titles, patched game builds, and repository entries with screenshots or source notes when available.",
  tools:
    "Find iOS utility IPA listings for signing, productivity, system tools, file management, customization, and other practical apps indexed from compatible repositories.",
  media:
    "Browse media-focused IPA listings for video, music, photo, camera, streaming, and creator apps. Repository notes are preserved where sources describe tweaks or patched builds.",
  education:
    "Discover education and learning IPA listings for study, reading, language, course, and school-related apps from indexed iOS app repositories."
};

export function getAppDisplayName(app: AppDto): string {
  return app.appStore?.name ?? app.name;
}

export function getAppDescription(app: AppDto, maxLength = 158): string {
  const description =
    app.appStore?.description ??
    app.description ??
    `${getAppDisplayName(app)} IPA download from ${app.sourceName}. View version details, compatibility information, and repository source.`;

  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

export function getAppImage(app: AppDto): string {
  return app.appStore?.artworkUrl512 ?? app.appStore?.artworkUrl100 ?? app.iconUrl ?? "/og.svg";
}

export function getShareId(app: Pick<AppDto, "id" | "bundleIdentifier">): string {
  return app.bundleIdentifier ?? (app.id.startsWith("bundle:") ? app.id.slice("bundle:".length) : app.id);
}

export function getAppPath(app: Pick<AppDto, "id" | "bundleIdentifier">): string {
  return `/apps/${encodeURIComponent(getShareId(app))}`;
}

export function getAppUrl(app: Pick<AppDto, "id" | "bundleIdentifier">): string {
  return getAbsoluteUrl(getAppPath(app));
}

export function isIndexableCategory(value: string): value is IndexableCategory {
  return (INDEXABLE_CATEGORIES as readonly string[]).includes(value);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getDeveloperSlug(app: AppDto): string | null {
  const developerName = app.appStore?.developerName ?? app.developerName;
  return developerName ? slugify(developerName) : null;
}

export function getDerivedCategoryLabel(category: DerivedAppCategory): string {
  return CATEGORY_LABELS[category];
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getLastModified(date: string | null): Date {
  if (!date) {
    return new Date();
  }

  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
}
