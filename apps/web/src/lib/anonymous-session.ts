const KEY = "iappstores:analytics-session:v1";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type NavigatorWithGpc = Navigator & { globalPrivacyControl?: boolean };

export function getAnonymousSessionId(): string | null {
  const nav = typeof window === "undefined" ? null : (navigator as NavigatorWithGpc);
  if (!nav || nav.globalPrivacyControl || nav.doNotTrack === "1") return null;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as { id?: unknown; createdAt?: unknown } | null;
    if (stored && typeof stored.id === "string" && typeof stored.createdAt === "number" && Date.now() - stored.createdAt < MAX_AGE) return stored.id;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, JSON.stringify({ id, createdAt: Date.now() }));
    return id;
  } catch { return null; }
}
