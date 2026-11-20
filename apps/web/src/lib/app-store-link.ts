// Attribution for outbound App Store links, so developers can see traffic that came from us.
//
// - `ct` (campaign token) and `mt=8` (iOS apps) are standard App Store link params.
// - `at` (affiliate token) is optional: it is only present once we join Apple's affiliate
//   program (Apple Services Performance Partners). Set NEXT_PUBLIC_APPLE_AFFILIATE_TOKEN
//   at build time to enable it.
// - Links must keep the Referer header (see `appStoreLinkProps`) so App Store Connect can
//   list our domain under "Web Referrer".

const APP_STORE_HOSTS = new Set(["apps.apple.com", "itunes.apple.com"]);

export const APP_STORE_CAMPAIGN = "imodstore";

export function withAppStoreAttribution(
  rawUrl: string,
  affiliateToken: string | undefined = process.env.NEXT_PUBLIC_APPLE_AFFILIATE_TOKEN,
  campaign: string = APP_STORE_CAMPAIGN,
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!APP_STORE_HOSTS.has(url.hostname)) {
    return rawUrl;
  }
  // Never overwrite a token the source already put on the link.
  if (!url.searchParams.has("ct")) url.searchParams.set("ct", campaign);
  if (!url.searchParams.has("mt")) url.searchParams.set("mt", "8");
  const at = affiliateToken?.trim();
  if (at && !url.searchParams.has("at")) url.searchParams.set("at", at);
  return url.toString();
}

// `noopener` (not `noreferrer`) so the origin is sent as the referrer.
export const appStoreLinkProps = {
  rel: "noopener",
  referrerPolicy: "origin",
  target: "_blank",
} as const;
