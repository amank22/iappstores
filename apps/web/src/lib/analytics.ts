type GtagCommand = "event";

type Gtag = (command: GtagCommand, eventName: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

type AppAnalyticsFields = {
  appId: string;
  appName: string;
  bundleIdentifier: string | null;
};

type DownloadAnalyticsFields = AppAnalyticsFields & {
  sourceId: string;
  sourceName: string;
  downloadURL: string | null;
};

function trackEvent(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
    return;
  }

  window.dataLayer?.push(["event", eventName, params]);
}

export function trackAppDetailView(fields: AppAnalyticsFields): void {
  trackEvent("app_detail_view", {
    app_id: fields.appId,
    app_name: fields.appName,
    bundle_id: fields.bundleIdentifier,
    event_category: "app"
  });
}

export function trackAppDetailModalOpen(fields: AppAnalyticsFields): void {
  trackEvent("app_detail_modal_open", {
    app_id: fields.appId,
    app_name: fields.appName,
    bundle_id: fields.bundleIdentifier,
    event_category: "app"
  });
}

export function trackDownloadClick(fields: DownloadAnalyticsFields): void {
  trackEvent("download_click", {
    app_id: fields.appId,
    app_name: fields.appName,
    bundle_id: fields.bundleIdentifier,
    source_id: fields.sourceId,
    source_name: fields.sourceName,
    download_url: fields.downloadURL,
    event_category: "download"
  });
}
