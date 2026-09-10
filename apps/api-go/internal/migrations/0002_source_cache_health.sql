-- Tracks consecutive fetch failures per source so the refresh worker can back off
-- unhealthy sources instead of retrying them every cycle forever.

ALTER TABLE source_cache ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
