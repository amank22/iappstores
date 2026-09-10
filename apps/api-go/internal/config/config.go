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
