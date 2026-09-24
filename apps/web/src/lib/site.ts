export const siteDescription =
  "Search AltStore and SideStore IPA repositories, compare direct download options, source notes, iOS compatibility, and App Store context for tweaked iOS apps.";

export function getSiteUrl(): string {
  const rawUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  try {
    const url = new URL(rawUrl);
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export function getAbsoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}

export const CORRECT_MY_PAPER_URL = "https://correctmypaper.com";

export function getCorrectMyPaperUrl(medium: string): string {
  const url = new URL(CORRECT_MY_PAPER_URL);
  url.searchParams.set("utm_source", "iappstores");
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", "cross_promo");
  return url.toString();
}
