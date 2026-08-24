# @iappstores/ai-bot-tracker

A Cloudflare Worker that sits in front of `iappstores.com`, detects known AI
crawlers/agents (GPTBot, ClaudeBot, PerplexityBot, etc.) by User-Agent, and
reports each hit to a **dedicated** GA4 property via the Measurement Protocol.
It never blocks or alters a response — every request still reaches the
Coolify-hosted origin untouched; it only adds a fire-and-forget analytics call
for requests it recognizes as AI bots.

This mirrors the setup described in [Christopher Penn's "Setting Up AI Bot
Tracking in Google Analytics"](https://www.christopherspenn.com/2026/07/so-what-setting-up-ai-bot-tracking-in-google-analytics/):
regular GA4 tracking code filters bots out by design, so bot traffic has to be
captured server-side, in front of the app, into a separate property.

## 1. Create a dedicated GA4 property

Do **not** reuse the main iAppStores GA4 property — its tag is built to
exclude bots, and you don't want bot events mixed into human traffic anyway.

1. In GA4 admin, create a new property, e.g. "iAppStores – AI Bot Traffic".
2. Add a data stream for `iappstores.com`.
3. When it offers to install a Google tag on the site, **decline** — this
   property is fed exclusively via the Measurement Protocol from the Worker,
   never via a browser tag.
4. Note the **Measurement ID** (`G-XXXXXXX`) from the data stream.
5. Under the data stream, create a **Measurement Protocol API secret** — note
   its value too. Both values go into Worker secrets in step 3 below, never
   into source control.
6. Create custom **event-scoped dimensions** matching the params this Worker
   sends (Admin → Custom definitions → Create custom dimension):

   | Dimension name | Event parameter |
   | --- | --- |
   | Bot name | `bot_name` |
   | Bot category | `bot_category` |
   | Request path | `request_path` |
   | User agent | `user_agent` |
   | Verified bot | `verified_bot` |
   | IP ASN | `ip_asn` |
   | Bot score | `bot_score` |

   Standard GA4 fields (device, browser, geo from IP-based lookups aside,
   etc.) will mostly read empty for these events — the custom dimensions
   above are what you'll actually report on.
7. Admin → BigQuery Linking → link this property to a BigQuery
   dataset/project. GA4 only retains event-level data for 2–14 months
   depending on settings; without BigQuery, year-over-year bot analysis is
   not possible.

## 2. Configure and deploy the Worker

Prerequisite: a Cloudflare account with the `iappstores.com` zone already
added (DNS proxied through Cloudflare, orange-clouded).

```sh
cd apps/ai-bot-tracker
npm install
npx wrangler login          # first time only
npm run secrets:ga          # prompts for GA_MEASUREMENT_ID and GA_API_SECRET
npm run deploy
```

`wrangler.jsonc` already declares routes for `iappstores.com/*` and
`www.iappstores.com/*`. After the first deploy, confirm in the Cloudflare
dashboard under **Workers & Pages → iappstores-ai-bot-tracker → Triggers**
that both routes are attached and enabled, and that **Logs** (Observability)
is on for troubleshooting.

Optional environment variables (set via `wrangler.jsonc` `vars` or
`wrangler secret put`):

- `GA_DEBUG=true` — sends events to GA4's `/debug/mp/collect` endpoint
  instead and logs the validation response with `wrangler tail`. Use this
  while setting up custom dimensions; turn it off for real traffic.
- `TRACK_PATH_PREFIXES=/apps,/search` — restricts tracking to specific path
  prefixes (e.g. only content pages, not the homepage). Leave unset to track
  every non-static-asset path.

To restrict or add bot signatures, edit `src/bots.ts` — it's a plain list of
`{ name, category, pattern }` entries matched against the request's
`User-Agent` header.

## 3. Watch your bill

Cloudflare Workers' free tier is 100,000 requests/day; AI bot traffic scales
with how much content a site has, not how many humans visit it, and can
blow past that far faster than expected — Trust Insights hit the limit on
their own site in about 7 hours once they turned this on.

**Before deploying to production:**

1. Set a Cloudflare **billing alert** with a hard ceiling, not just a
   notify-only alert.
2. Watch usage for the first day or two after deploy via **Workers &
   Pages → iappstores-ai-bot-tracker → Metrics**.
3. If volume is too high, narrow scope with `TRACK_PATH_PREFIXES` or trim
   `src/bots.ts` down to the bots you actually care about before loosening
   it back up.

## 4. Reporting

In the bot-only GA4 property (or Looker Studio connected to it), build a
table using **Bot category** and **Request path** as dimensions and
**Events** as the metric — there's no "Views"/pageview data for bot hits.
Expect roughly a 24-hour delay before BigQuery-backed reports catch up.

A useful first analysis: compare the pages AI bots hit most (segmented by
`bot_name`) against Google Search Console's top pages and this site's normal
human GA4 top pages. Pages popular with bots but not humans (or vice versa)
show where AI-answer traffic and human browsing diverge.
