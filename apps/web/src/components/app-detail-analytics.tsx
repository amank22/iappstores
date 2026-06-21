"use client";

import { useEffect } from "react";
import { trackAppDetailView } from "@/lib/analytics";

export function AppDetailAnalytics({
  appId,
  appName,
  bundleIdentifier
}: {
  appId: string;
  appName: string;
  bundleIdentifier: string | null;
}) {
  useEffect(() => {
    trackAppDetailView({
      appId,
      appName,
      bundleIdentifier
    });
  }, [appId, appName, bundleIdentifier]);

  return null;
}
