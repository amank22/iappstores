import type { AppDto, AppListResponse } from "@iappstores/contracts";
import { getAbsoluteUrl, siteDescription } from "@/lib/site";
import { getAppDescription, getAppDisplayName, getAppPath } from "@/lib/seo";

function markdownText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function yamlValue(value: string): string {
  return JSON.stringify(value);
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function downloadUrl(app: AppDto, sourceId: string): string {
  const query = new URLSearchParams({ appId: app.id, sourceId });
  return getAbsoluteUrl(`/api/download?${query.toString()}`);
}

function appSummary(app: AppDto): string {
  const name = getAppDisplayName(app);
  const details = [app.latestVersion ? `version ${app.latestVersion}` : null, app.minOSVersion ? `iOS ${app.minOSVersion}+` : null]
    .filter(Boolean)
    .join(" · ");
  const description = getAppDescription(app, 240);
  return `## [${name}](${getAbsoluteUrl(getAppPath(app))})\n\n${details ? `${details} — ` : ""}${description}`;
}

export function homeMarkdown(result: AppListResponse, query: string): string {
  const title = query ? `Search results for ${query}` : "ProtectedGadvisory";
  const intro = query
    ? `Showing ${result.pagination.totalItems} matching iOS app repository listings.`
    : "Browse AltStore and SideStore-compatible iOS app repository listings.";
  const apps = result.apps.length > 0 ? result.apps.map(appSummary).join("\n\n") : "No app listings matched this request.";

  return `---\ntitle: ${yamlValue(title)}\ndescription: ${yamlValue(siteDescription)}\nurl: ${yamlValue(getAbsoluteUrl("/"))}\n---\n\n# ${title}\n\n${intro}\n\n${apps}\n\n---\n\nPage ${result.pagination.page} of ${result.pagination.totalPages || 1}. [Browse the full catalog](${getAbsoluteUrl("/")}).`;
}

export function appMarkdown(app: AppDto): string {
  const name = getAppDisplayName(app);
  const description = getAppDescription(app, 500);
  const repositoryNotes = [app.subtitle, app.description].filter((value): value is string => Boolean(value?.trim())).join("\n\n");
  const appStore = app.appStore ?? null;
  const details = [
    ["Repository", app.sourceName],
    ["Bundle identifier", app.bundleIdentifier],
    ["Repository version", app.latestVersion],
    ["Minimum iOS", app.minOSVersion ? `${app.minOSVersion}+` : null],
    ["Package size", formatBytes(app.size)],
    ["Developer", appStore?.developerName ?? app.developerName ?? null],
    ["App Store version", appStore?.version ?? null],
    ["App Store minimum iOS", appStore?.minimumOsVersion ? `${appStore.minimumOsVersion}+` : null],
    ["App Store rating", appStore?.averageUserRating === null || appStore?.averageUserRating === undefined ? null : `${appStore.averageUserRating.toFixed(1)} (${appStore.userRatingCount?.toLocaleString() ?? 0} ratings)`]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const downloads = app.downloadOptions
    .filter((option) => option.downloadURL)
    .map((option) => `- [Download from ${option.sourceName}](${downloadUrl(app, option.sourceId)})${option.latestVersion ? ` — version ${option.latestVersion}` : ""}`)
    .join("\n");

  return `---\ntitle: ${yamlValue(`${name} IPA Download`)}\ndescription: ${yamlValue(description)}\nurl: ${yamlValue(getAbsoluteUrl(getAppPath(app)))}\n---\n\n# ${name}\n\n${description}\n\n## Details\n\n${details.map(([label, value]) => `- **${label}:** ${value}`).join("\n")}\n\n${repositoryNotes ? `## Repository notes\n\n${markdownText(repositoryNotes)}\n\n` : ""}${appStore?.description ? `## App Store description\n\n${markdownText(appStore.description)}\n\n` : ""}${downloads ? `## Download options\n\n${downloads}\n\n` : ""}## Important\n\nThis site indexes third-party repository metadata and links to original source downloads. It does not host IPA files or verify their authenticity.`;
}

export function unavailableMarkdown(pathname: string): string {
  return `# ProtectedGadvisory\n\nA Markdown representation is not available for \`${pathname}\` yet. Use the [app catalog](${getAbsoluteUrl("/")}) or [llms.txt](${getAbsoluteUrl("/llms.txt")}) to discover agent-friendly resources.`;
}
