import { matchBot } from "./bots.js";

export interface Env {
  GA_MEASUREMENT_ID: string;
  GA_API_SECRET: string;
  GA_DEBUG?: string;
  /** Comma-separated path prefixes to track exclusively, e.g. "/apps,/search". Empty = track everything. */
  TRACK_PATH_PREFIXES?: string;
}

const STATIC_ASSET_EXTENSIONS =
  /\.(css|js|mjs|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|mp4|mp3|txt)$/i;

interface CfBotManagement {
  score?: number;
  verifiedBot?: boolean;
  corporateProxy?: boolean;
}

function isTrackedPath(pathname: string, env: Env): boolean {
  if (STATIC_ASSET_EXTENSIONS.test(pathname)) return false;
  const prefixes = env.TRACK_PATH_PREFIXES?.split(",").map((p) => p.trim()).filter(Boolean);
  if (!prefixes || prefixes.length === 0) return true;
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

async function sendBotHit(request: Request, env: Env): Promise<void> {
  const ua = request.headers.get("user-agent") ?? "";
  const bot = matchBot(ua);
  if (!bot) return;

  const url = new URL(request.url);
  if (!isTrackedPath(url.pathname, env)) return;

  const cf = request.cf as (IncomingRequestCfProperties & { botManagement?: CfBotManagement }) | undefined;
  const botManagement = cf?.botManagement;

  const params: Record<string, string | number> = {
    bot_name: bot.name,
    bot_category: bot.category,
    request_path: url.pathname.slice(0, 100),
    user_agent: ua.slice(0, 100),
  };
  if (cf?.asn) params.ip_asn = cf.asn;
  if (typeof botManagement?.verifiedBot === "boolean") {
    params.verified_bot = botManagement.verifiedBot ? "true" : "false";
  }
  if (typeof botManagement?.score === "number") params.bot_score = botManagement.score;

  const endpoint = env.GA_DEBUG === "true" ? "debug/mp/collect" : "mp/collect";
  const collectUrl =
    `https://www.google-analytics.com/${endpoint}` +
    `?measurement_id=${env.GA_MEASUREMENT_ID}&api_secret=${env.GA_API_SECRET}`;

  const body = JSON.stringify({
    client_id: crypto.randomUUID(),
    events: [{ name: "ai_bot_hit", params }],
  });

  const res = await fetch(collectUrl, { method: "POST", body });
  if (env.GA_DEBUG === "true") {
    console.log("GA4 debug response", res.status, await res.text());
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Tracking only — never blocks or alters the response. Pass every request
    // through to the origin regardless of bot classification.
    ctx.waitUntil(
      sendBotHit(request, env).catch((err) => console.error("ai-bot-tracker: GA4 send failed", err)),
    );
    return fetch(request);
  },
};
