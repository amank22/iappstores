"use client";

import { useEffect, useState } from "react";

const MOD_STORE_URL = "https://imodstore.com";

/**
 * Announces that mod apps are moving to imodstore.com. This app is served on both
 * domains, so the banner hides itself on imodstore.com.
 */
export function MigrationBanner() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.location.hostname.endsWith("imodstore.com")) setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div role="region" aria-label="Site move notice" className="border-b border-amber-400/30 bg-amber-400/10 text-amber-100">
      <div className="mx-auto w-full max-w-7xl px-3 py-2 text-center text-sm sm:px-6 lg:px-8">
        <strong className="font-semibold">We&apos;re moving!</strong> Mod apps are moving to{" "}
        <a href={MOD_STORE_URL} className="font-semibold underline underline-offset-2 hover:text-white">
          imodstore.com
        </a>
        . iappstores is being revamped and will focus on App Store apps only (no mods).
      </div>
    </div>
  );
}
