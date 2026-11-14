"use client";

import { useEffect } from "react";
import { trackBotCheck, trackHumanSignal } from "@/lib/analytics";

const SESSION_KEY_BOT_CHECK = "iappstores:bot-check";
const SESSION_KEY_HUMAN = "iappstores:human-signal";

type BotdResult = "bot" | "human" | "unknown";

function alreadySent(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSent(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage can be blocked; the event then fires once per page load instead.
  }
}

/**
 * Estimates human traffic for analytics. It sends two GA4 events, each at most once per browser session:
 *  - `bot_check`: BotD's verdict (headless or automated browser or not).
 *  - `human_signal`: a real, trusted user interaction (scroll, tap, key press or pointer move).
 * "Likely human" visitors are those with a `human_signal` event whose `botd_result` is not "bot".
 * Neither signal is proof; it is a cheap estimate that removes most crawlers and headless scripts.
 */
export function HumanSignal() {
  useEffect(() => {
    let botdResult: BotdResult = "unknown";
    let cancelled = false;

    if (!alreadySent(SESSION_KEY_BOT_CHECK)) {
      import("@fingerprintjs/botd")
        .then(({ load }) => load({ monitoring: false }))
        .then((detector) => {
          const result = detector.detect();
          botdResult = result.bot ? "bot" : "human";
          if (!cancelled) {
            markSent(SESSION_KEY_BOT_CHECK);
            trackBotCheck({ bot: result.bot, botKind: result.bot ? result.botKind : null });
          }
        })
        .catch(() => {
          // Detection failed (blocked script, old browser). Leave the verdict as "unknown".
        });
    }

    if (alreadySent(SESSION_KEY_HUMAN)) {
      return () => {
        cancelled = true;
      };
    }

    const events = ["scroll", "pointerdown", "touchstart", "keydown", "mousemove"] as const;
    let fired = false;

    const onSignal = (event: Event) => {
      // Synthetic events dispatched by scripts have isTrusted === false.
      if (fired || !event.isTrusted) {
        return;
      }
      fired = true;
      cleanup();
      markSent(SESSION_KEY_HUMAN);
      // Wait briefly so BotD has usually finished and its verdict can ride along.
      window.setTimeout(() => {
        trackHumanSignal({ trigger: event.type, botdResult });
      }, 1500);
    };

    const cleanup = () => {
      for (const name of events) {
        window.removeEventListener(name, onSignal);
      }
    };

    for (const name of events) {
      window.addEventListener(name, onSignal, { passive: true });
    }

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}
