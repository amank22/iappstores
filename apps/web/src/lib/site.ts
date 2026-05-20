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
