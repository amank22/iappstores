import type { AppDownloadOption, AppDto } from "@iappstores/contracts";
import type { DownloadProbeResult } from "./downloadProbe.js";

export type DownloadTarget =
  | {
      ok: true;
      app: AppDto;
      option: AppDownloadOption & { downloadURL: string };
    }
  | {
      ok: false;
      status: 404;
      code: "app_not_found" | "download_source_not_found" | "download_url_missing";
      message: string;
    };

export type DownloadDecision =
  | {
      shouldRedirect: true;
      downloadURL: string;
    }
  | {
      shouldRedirect: false;
      status: 502;
      code: "download_link_broken";
      message: string;
      details: {
        statusCode: number | null;
        error: string | null;
      };
    };

function matchesAppId(app: AppDto, appId: string): boolean {
  return (
    app.id === appId ||
    app.bundleIdentifier?.toLowerCase() === appId.toLowerCase() ||
    app.id === `bundle:${appId.toLowerCase()}`
  );
}

export function resolveDownloadTarget(apps: AppDto[], appId: string, sourceId: string): DownloadTarget {
  const app = apps.find((candidate) => matchesAppId(candidate, appId));
  if (!app) {
    return {
      ok: false,
      status: 404,
      code: "app_not_found",
      message: `Unknown app "${appId}".`
    };
  }

  const option = app.downloadOptions.find((candidate) => candidate.sourceId === sourceId);
  if (!option) {
    return {
      ok: false,
      status: 404,
      code: "download_source_not_found",
      message: `No download source "${sourceId}" was found for this app.`
    };
  }

  if (!option.downloadURL) {
    return {
      ok: false,
      status: 404,
      code: "download_url_missing",
      message: "This download source does not include an IPA URL."
    };
  }

  return {
    ok: true,
    app,
    option: {
      ...option,
      downloadURL: option.downloadURL
    }
  };
}

export function decideDownloadRedirect(downloadURL: string, probe: DownloadProbeResult): DownloadDecision {
  if (probe.status === "hard_failure") {
    return {
      shouldRedirect: false,
      status: 502,
      code: "download_link_broken",
      message: "The source download link appears to be broken.",
      details: {
        statusCode: probe.statusCode,
        error: probe.error
      }
    };
  }

  return {
    shouldRedirect: true,
    downloadURL
  };
}
