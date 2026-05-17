export const siteDescription =
  "Browse direct IPA downloads from AltStore and SideStore repositories, including tweaked, modded, and patched iOS apps with App Store context.";

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
