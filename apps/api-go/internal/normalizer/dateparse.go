package normalizer

import (
	"strconv"
	"strings"
	"time"
)

// dateFormats lists the layouts tried, in order, by parseLenientDate. JS's Date.parse is
// very permissive (ISO-8601 variants, RFC 2822, and many ad-hoc formats); Go's time.Parse
// is strict about an exact layout match, so free-form dates from 56 third-party repos need
// this multi-format fallback chain to behave the same way in practice.
var dateFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05.999999999",
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02 15:04:05",
	"2006-01-02",
	"2006/01/02",
	"01/02/2006",
	time.RFC1123Z,
	time.RFC1123,
	time.RFC822Z,
	time.RFC822,
	time.ANSIC,
	time.UnixDate,
	time.RubyDate,
	"January 2, 2006",
	"Jan 2, 2006",
	"2 January 2006",
	"2 Jan 2006",
	"Mon, 2 Jan 2006 15:04:05 MST",
}

// parseLenientDate mirrors `Date.parse(value) || 0` used throughout normalizer.ts /
// catalogStore.ts for sort keys: on any parse failure it returns 0 (the JS epoch
// fallback for NaN), never an error, since callers only use it for ordering.
func parseLenientDate(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}

	// A bare integer is treated as a Unix millisecond timestamp (Date.parse would
	// actually reject this as an invalid date string and return NaN, but some
	// upstream repos emit numeric strings; treating them as 0 to match Date.parse
	// semantics as closely as possible for non-date strings).
	if _, err := strconv.ParseInt(value, 10, 64); err == nil {
		return 0
	}

	for _, layout := range dateFormats {
		if t, err := time.Parse(layout, value); err == nil {
			return t.UnixMilli()
		}
	}

	return 0
}

// parseLenientDateOK is like parseLenientDate but also reports whether parsing succeeded,
// for call sites (e.g. matchesIosVersion-adjacent "isFinite" checks) that need to
// distinguish "parsed as epoch 0" from "did not parse".
func ParseLenientDateOK(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	for _, layout := range dateFormats {
		if t, err := time.Parse(layout, value); err == nil {
			return t.UnixMilli(), true
		}
	}
	return 0, false
}
