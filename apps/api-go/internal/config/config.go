// Package config centralizes environment variable reads, mirroring the various
// process.env accesses scattered through the original TS sources.
package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func getString(name, fallback string) string {
	if v, ok := os.LookupEnv(name); ok && v != "" {
		return v
	}
	return fallback
}

func getPositiveFloat(name string, fallback float64) float64 {
	v := os.Getenv(name)
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f <= 0 {
		return fallback
	}
	return f
}

func getBoolFlag(name string) bool {
	return strings.TrimSpace(os.Getenv(name)) == "true"
}

// APIPort is the HTTP listen port (API_PORT, default 4000).
func APIPort() int {
	v := os.Getenv("API_PORT")
	if v == "" {
		return 4000
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 4000
	}
	return n
}

// CORSOrigin is the single allowed CORS origin (CORS_ORIGIN).
func CORSOrigin() string {
	return getString("CORS_ORIGIN", "http://localhost:3000")
}

func DataDir() string {
	v := os.Getenv("DATA_DIR")
	if v == "" {
		v = ".data"
	}
	abs, err := filepath.Abs(v)
	if err != nil {
		return v
	}
	return abs
}

func RepoCacheDBPath() string {
	if v := os.Getenv("REPO_CACHE_DB_PATH"); v != "" {
		return v
	}
	return filepath.Join(DataDir(), "iappstores.sqlite")
}

// --- repo cache / refresh ---

const DefaultCacheTTL = 24 * time.Hour

func RepoCacheTTL() time.Duration {
	hours := getPositiveFloat("REPO_CACHE_TTL_HOURS", 0)
	if hours > 0 {
		return time.Duration(hours * float64(time.Hour))
	}
	return DefaultCacheTTL
}

func RepoTreeFetchConcurrency() int {
	return int(getPositiveFloat("REPO_TREE_FETCH_CONCURRENCY", 8))
}

func RepoRefreshDisabled() bool {
	return getBoolFlag("REPO_REFRESH_DISABLED")
}

const DefaultRefreshConcurrency = 6
const DefaultRefreshJitter = 90 * time.Minute

func RepoRefreshConcurrency() int {
	return int(getPositiveFloat("REPO_REFRESH_CONCURRENCY", DefaultRefreshConcurrency))
}

func RepoRefreshJitter() time.Duration {
	minutes := getPositiveFloat("REPO_REFRESH_JITTER_MINUTES", float64(DefaultRefreshJitter/time.Minute))
	return time.Duration(minutes * float64(time.Minute))
}

// DefaultRefreshMaxBackoff caps how rarely a persistently failing source gets retried: its
// retry interval doubles with each consecutive failure (see repo.backoffDuration) but never
// exceeds this.
const DefaultRefreshMaxBackoff = 7 * 24 * time.Hour

func RepoRefreshMaxBackoff() time.Duration {
	hours := getPositiveFloat("REPO_REFRESH_MAX_BACKOFF_HOURS", float64(DefaultRefreshMaxBackoff/time.Hour))
	return time.Duration(hours * float64(time.Hour))
}

// --- App Store enrichment ---

func AppStoreEnrichmentDisabled() bool {
	return getBoolFlag("APP_STORE_ENRICHMENT_DISABLED")
}

const DefaultAppStoreCountry = "us"

func AppStoreCountry() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("APP_STORE_COUNTRY")))
	if len(v) == 2 {
		return v
	}
	return DefaultAppStoreCountry
}

func AppStoreFallbackCountries(primary string) []string {
	raw := os.Getenv("APP_STORE_FALLBACK_COUNTRIES")
	if raw == "" {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		c := strings.ToLower(strings.TrimSpace(part))
		if len(c) != 2 || c == primary || seen[c] {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	return out
}

const DefaultLookupDelay = 3500 * time.Millisecond

func AppStoreLookupDelay() time.Duration {
	ms := getPositiveFloat("APP_STORE_LOOKUP_DELAY_MS", float64(DefaultLookupDelay/time.Millisecond))
	return time.Duration(ms) * time.Millisecond
}

const DefaultAppStoreCacheTTLDays = 30

func AppStoreCacheTTL() time.Duration {
	days := getPositiveFloat("APP_STORE_CACHE_TTL_DAYS", DefaultAppStoreCacheTTLDays)
	return time.Duration(days * float64(24*time.Hour))
}

const DefaultAppStoreNegativeCacheTTLDays = 7

func AppStoreNegativeCacheTTL() time.Duration {
	days := getPositiveFloat("APP_STORE_NEGATIVE_CACHE_TTL_DAYS", DefaultAppStoreNegativeCacheTTLDays)
	return time.Duration(days * float64(24*time.Hour))
}

// --- collections ---

const DefaultCollectionCacheTTLMinutes = 60

func CollectionCacheTTL() time.Duration {
	minutes := getPositiveFloat("COLLECTION_CACHE_TTL_MINUTES", DefaultCollectionCacheTTLMinutes)
	return time.Duration(minutes * float64(time.Minute))
}

// --- analytics ---

func AnalyticsSessionSecret() string {
	return os.Getenv("ANALYTICS_SESSION_SECRET")
}

// SlowRequestThreshold is how long a request may take before it is logged as slow
// (SLOW_REQUEST_MS, default 1000).
func SlowRequestThreshold() time.Duration {
	return time.Duration(getPositiveFloat("SLOW_REQUEST_MS", 1000) * float64(time.Millisecond))
}

// DiagnosticsCaptureThreshold is the request duration that triggers an incident capture
// (DIAGNOSTICS_CAPTURE_MS, default 3000).
func DiagnosticsCaptureThreshold() time.Duration {
	return time.Duration(getPositiveFloat("DIAGNOSTICS_CAPTURE_MS", 3000) * float64(time.Millisecond))
}

// DiagnosticsInFlightThreshold is the number of concurrent requests that triggers an
// incident capture (DIAGNOSTICS_INFLIGHT, default 32).
func DiagnosticsInFlightThreshold() int {
	return int(getPositiveFloat("DIAGNOSTICS_INFLIGHT", 32))
}

// DiagnosticsCooldown is the minimum time between incident captures
// (DIAGNOSTICS_COOLDOWN_MINUTES, default 15).
func DiagnosticsCooldown() time.Duration {
	return time.Duration(getPositiveFloat("DIAGNOSTICS_COOLDOWN_MINUTES", 15) * float64(time.Minute))
}

// DiagnosticsDir is where incident captures (profiles, goroutine dumps) are written:
// DIAGNOSTICS_DIR, default <DATA_DIR>/diagnostics, so they survive restarts.
func DiagnosticsDir() string {
	return getString("DIAGNOSTICS_DIR", filepath.Join(DataDir(), "diagnostics"))
}

// StatsLogInterval is how often the API logs a stats line (STATS_LOG_SECONDS, default
// 60). STATS_LOG_DISABLED=true turns the line off.
func StatsLogInterval() time.Duration {
	if getBoolFlag("STATS_LOG_DISABLED") {
		return 0
	}
	return time.Duration(getPositiveFloat("STATS_LOG_SECONDS", 60) * float64(time.Second))
}

// PprofAddr, when set (PPROF_ADDR, e.g. ":6060"), serves net/http/pprof on a separate
// listener. Off by default; never route it publicly.
func PprofAddr() string {
	return strings.TrimSpace(os.Getenv("PPROF_ADDR"))
}

// --- sponsor slots (internal/sponsors) ---

// SponsorSlots is how many homepage sponsor slots are on sale (SPONSOR_SLOTS, default 4).
func SponsorSlots() int {
	return int(getPositiveFloat("SPONSOR_SLOTS", 4))
}

// SponsorPriceUSD is the monthly price shown on the site (SPONSOR_PRICE_USD, default
// 30). Display only: the amount charged is whatever the Dodo product is priced at.
func SponsorPriceUSD() int {
	return int(getPositiveFloat("SPONSOR_PRICE_USD", 30))
}

// SponsorPagePriceUSD is the displayed monthly price of the plan that adds a dedicated
// page (SPONSOR_PAGE_PRICE_USD, default 99).
func SponsorPagePriceUSD() int {
	return int(getPositiveFloat("SPONSOR_PAGE_PRICE_USD", 99))
}

// SponsorAutoApprove publishes a paid listing without review (SPONSOR_AUTO_APPROVE=true).
func SponsorAutoApprove() bool {
	return getBoolFlag("SPONSOR_AUTO_APPROVE")
}

// SponsorAdminToken guards the sponsor admin endpoints (SPONSOR_ADMIN_TOKEN). Unset
// means those endpoints do not exist.
func SponsorAdminToken() string {
	return strings.TrimSpace(os.Getenv("SPONSOR_ADMIN_TOKEN"))
}

func DodoAPIKey() string {
	return strings.TrimSpace(os.Getenv("DODO_PAYMENTS_API_KEY"))
}

func DodoWebhookSecret() string {
	return strings.TrimSpace(os.Getenv("DODO_PAYMENTS_WEBHOOK_SECRET"))
}

// DodoLiveMode selects Dodo's live API (DODO_PAYMENTS_ENVIRONMENT=live_mode). Anything
// else uses test mode, so a half-configured deploy can't take real payments.
func DodoLiveMode() bool {
	return strings.TrimSpace(os.Getenv("DODO_PAYMENTS_ENVIRONMENT")) == "live_mode"
}

// DodoSponsorProductID is the Dodo subscription product a sponsor slot is sold as.
func DodoSponsorProductID() string {
	return strings.TrimSpace(os.Getenv("DODO_SPONSOR_PRODUCT_ID"))
}

// DodoSponsorPageProductID is the Dodo subscription product for a slot plus a dedicated
// page. Unset means that plan is not on sale.
func DodoSponsorPageProductID() string {
	return strings.TrimSpace(os.Getenv("DODO_SPONSOR_PAGE_PRODUCT_ID"))
}

// SiteURL is the public site origin, used for checkout return links (SITE_URL, falling
// back to CORS_ORIGIN, which is the same origin in production).
func SiteURL() string {
	return strings.TrimRight(getString("SITE_URL", CORSOrigin()), "/")
}
