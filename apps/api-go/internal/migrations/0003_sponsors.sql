-- Paid homepage sponsor slots (see internal/sponsors).
--
-- plan:
--   slot  a tile in the homepage sponsor row
--   page  the tile plus a dedicated page at /sponsored/<slug>, with description as its text
--
-- status:
--   checkout        form submitted, slot held until hold_expires_at while the buyer pays
--   pending_review  paid, holds a slot, waiting for admin approval before it is shown
--   live            shown on the homepage (until ends_at, when the subscription was cancelled)
--   queued          paid, but every slot was taken when the payment landed (oversold)
--   paused          renewal failed or subscription paused; hidden, still holds its slot
--   ended           subscription over
--   rejected        refused in review
CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  url TEXT NOT NULL,
  icon_url TEXT,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'slot',
  slug TEXT,
  description TEXT,
  status TEXT NOT NULL,
  checkout_session_id TEXT,
  subscription_id TEXT,
  customer_id TEXT,
  hold_expires_at INTEGER,
  approved_at INTEGER,
  ends_at INTEGER,
  last_event_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsors_subscription ON sponsors(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsors_slug ON sponsors(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sponsors_status ON sponsors(status);

CREATE TABLE IF NOT EXISTS sponsor_clicks (
  sponsor_id TEXT NOT NULL,
  day TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sponsor_id, day)
);

CREATE TABLE IF NOT EXISTS sponsor_waitlist (
  email TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Webhook ids already handled, so a redelivery is not applied twice.
CREATE TABLE IF NOT EXISTS sponsor_webhook_events (
  webhook_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
