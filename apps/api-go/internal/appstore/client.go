package appstore

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
)

const fetchTimeout = 10 * time.Second

type lookupJob struct {
	country  string
	bundleID string
}

// Client ports appStoreClient.ts's module-level lookup queue and dedup set into a
// struct. The dedup set (queuedKeys in JS, a plain Set safe only because JS is
// single-threaded) becomes a mutex-guarded map here -- a genuine concurrency-safety fix
// versus the original, since Go handlers can call QueueLookup from many goroutines at once.
type Client struct {
	cache      *CacheStore
	httpClient *http.Client

	mu              sync.Mutex
	queue           []lookupJob
	queuedKeys      map[string]bool
	processing      bool
	lastLookupStart time.Time
}

func NewClient(cache *CacheStore) *Client {
	return &Client{
		cache:      cache,
		httpClient: &http.Client{},
		queuedKeys: map[string]bool{},
	}
}

func sanitizeCountry(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if len(v) == 2 {
		isAlpha := true
		for _, r := range v {
			if r < 'a' || r > 'z' {
				isAlpha = false
				break
			}
		}
		if isAlpha {
			return v
		}
	}
	return config.DefaultAppStoreCountry
}

func Country() string {
	return config.AppStoreCountry()
}

type appleLookupResponse struct {
	ResultCount int                      `json:"resultCount"`
	Results     []map[string]interface{} `json:"results"`
}

func asStr(v interface{}) *string {
	s, ok := v.(string)
	if !ok {
		return nil
	}
	t := strings.TrimSpace(s)
	if t == "" {
		return nil
	}
	return &t
}

func asFloat(v interface{}) *float64 {
	f, ok := v.(float64)
	if !ok {
		return nil
	}
	return &f
}

func asNonNegInt(v interface{}) *int64 {
	f, ok := v.(float64)
	if !ok || f < 0 {
		return nil
	}
	n := int64(f)
	return &n
}

func asURLStr(v interface{}) *string {
	s := asStr(v)
	if s == nil {
		return nil
	}
	u, err := url.Parse(*s)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil
	}
	out := u.String()
	return &out
}

func asStrArray(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	out := []string{}
	for _, item := range arr {
		if s := asStr(item); s != nil {
			out = append(out, *s)
		}
	}
	return out
}

func asURLArray(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	out := []string{}
	for _, item := range arr {
		if s := asStr(item); s != nil {
			if u := asURLStr(*s); u != nil {
				out = append(out, *u)
			}
		}
	}
	return out
}

func firstNonNilStr(vals ...interface{}) interface{} {
	for _, v := range vals {
		if v == nil {
			continue
		}
		if s, ok := v.(string); ok && strings.TrimSpace(s) == "" {
			continue
		}
		return v
	}
	return nil
}

func toAppStoreMetadata(result map[string]interface{}, country string, now int64) *contracts.AppStoreMetadata {
	bundleID := asStr(result["bundleId"])
	trackID := asNonNegInt(result["trackId"])
	trackViewURL := asURLStr(result["trackViewUrl"])
	name := asStr(firstNonNilStr(result["trackName"], result["trackCensoredName"]))

	if bundleID == nil || trackID == nil || trackViewURL == nil || name == nil {
		return nil
	}

	return &contracts.AppStoreMetadata{
		Country:                   country,
		BundleID:                  *bundleID,
		TrackID:                   *trackID,
		TrackViewURL:              *trackViewURL,
		Name:                      *name,
		DeveloperName:             asStr(firstNonNilStr(result["artistName"], result["sellerName"])),
		Description:               asStr(result["description"]),
		ArtworkURL60:              asURLStr(result["artworkUrl60"]),
		ArtworkURL100:             asURLStr(result["artworkUrl100"]),
		ArtworkURL512:             asURLStr(result["artworkUrl512"]),
		ScreenshotUrls:            asURLArray(result["screenshotUrls"]),
		IpadScreenshotUrls:        asURLArray(result["ipadScreenshotUrls"]),
		Genres:                    asStrArray(result["genres"]),
		PrimaryGenreName:          asStr(result["primaryGenreName"]),
		AverageUserRating:         asFloat(result["averageUserRating"]),
		UserRatingCount:           asNonNegInt(result["userRatingCount"]),
		FormattedPrice:            asStr(result["formattedPrice"]),
		Price:                     asFloat(result["price"]),
		Version:                   asStr(result["version"]),
		MinimumOsVersion:          asStr(result["minimumOsVersion"]),
		ReleaseNotes:              asStr(result["releaseNotes"]),
		CurrentVersionReleaseDate: asStr(result["currentVersionReleaseDate"]),
		ContentAdvisoryRating:     asStr(firstNonNilStr(result["contentAdvisoryRating"], result["trackContentRating"])),
		FetchedAt:                 now,
	}
}

func (c *Client) waitForRateLimit() {
	c.mu.Lock()
	delay := config.AppStoreLookupDelay()
	wait := time.Until(c.lastLookupStart.Add(delay))
	c.mu.Unlock()
	if wait > 0 {
		time.Sleep(wait)
	}
	c.mu.Lock()
	c.lastLookupStart = time.Now()
	c.mu.Unlock()
}

func (c *Client) fetchLookup(ctx context.Context, bundleID, country string) (*contracts.AppStoreMetadata, error) {
	c.waitForRateLimit()

	u, _ := url.Parse("https://itunes.apple.com/lookup")
	q := u.Query()
	q.Set("bundleId", bundleID)
	q.Set("country", country)
	u.RawQuery = q.Encode()

	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("App Store lookup returned %d %s", resp.StatusCode, resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var payload appleLookupResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.ResultCount == 0 {
		return nil, nil
	}
	now := time.Now().UnixMilli()
	for _, result := range payload.Results {
		if m := toAppStoreMetadata(result, country, now); m != nil {
			return m, nil
		}
	}
	return nil, nil
}

func (c *Client) lookupWithFallbacks(ctx context.Context, bundleID, primaryCountry string) (*contracts.AppStoreMetadata, error) {
	countries := append([]string{primaryCountry}, config.AppStoreFallbackCountries(primaryCountry)...)
	for _, country := range countries {
		metadata, err := c.fetchLookup(ctx, bundleID, country)
		if err == nil && metadata != nil {
			return metadata, nil
		}
		if err != nil {
			return nil, err
		}
	}
	return nil, nil
}

func (c *Client) processQueue() {
	c.mu.Lock()
	if c.processing {
		c.mu.Unlock()
		return
	}
	c.processing = true
	c.mu.Unlock()

	for {
		c.mu.Lock()
		if len(c.queue) == 0 {
			c.processing = false
			c.mu.Unlock()
			return
		}
		job := c.queue[0]
		c.queue = c.queue[1:]
		delete(c.queuedKeys, job.country+":"+job.bundleID)
		c.mu.Unlock()

		cache := c.cache.Read(job.country, job.bundleID)
		if cache != nil && !cache.IsExpired {
			continue
		}

		metadata, err := c.lookupWithFallbacks(context.Background(), job.bundleID, job.country)
		if err != nil {
			c.cache.WriteErrorResult(job.country, job.bundleID, err.Error(), config.AppStoreNegativeCacheTTL())
		} else if metadata != nil {
			c.cache.WriteHit(job.country, job.bundleID, *metadata, config.AppStoreCacheTTL())
		} else {
			c.cache.WriteMiss(job.country, job.bundleID, config.AppStoreNegativeCacheTTL())
		}
	}
}

// QueueLookup mirrors queueAppStoreLookup(): enqueues a bundle id for background lookup,
// deduplicated by (country, bundleId) via a mutex-guarded set (see Client doc comment).
func (c *Client) QueueLookup(bundleID string, country string) {
	if config.AppStoreEnrichmentDisabled() {
		return
	}
	normalizedCountry := sanitizeCountry(country)
	normalizedBundleID := strings.TrimSpace(bundleID)
	if normalizedBundleID == "" {
		return
	}
	key := normalizedCountry + ":" + normalizedBundleID

	c.mu.Lock()
	if c.queuedKeys[key] {
		c.mu.Unlock()
		return
	}
	c.queuedKeys[key] = true
	c.queue = append(c.queue, lookupJob{country: normalizedCountry, bundleID: normalizedBundleID})
	c.mu.Unlock()

	go c.processQueue()
}

// EnrichAppsWithCachedAppStoreMetadata mirrors enrichAppsWithCachedAppStoreMetadata():
// attaches only already-cached metadata synchronously, queuing a background lookup for
// anything missing or expired (never blocks the request on a live iTunes API call).
func (c *Client) EnrichAppsWithCachedAppStoreMetadata(apps []contracts.AppDto, country string) []contracts.AppDto {
	if config.AppStoreEnrichmentDisabled() {
		return apps
	}

	bundleIDs := []string{}
	for _, app := range apps {
		if app.BundleIdentifier != nil {
			id := strings.TrimSpace(*app.BundleIdentifier)
			if id != "" {
				bundleIDs = append(bundleIDs, id)
			}
		}
	}
	cacheByBundleID := c.cache.ReadBatch(country, bundleIDs)

	out := make([]contracts.AppDto, len(apps))
	for i, app := range apps {
		if app.BundleIdentifier == nil {
			out[i] = app
			continue
		}
		bundleID := strings.TrimSpace(*app.BundleIdentifier)
		if bundleID == "" {
			out[i] = app
			continue
		}

		cache := cacheByBundleID[bundleID]
		var metadata *contracts.AppStoreMetadata
		if cache != nil && cache.Status == StatusHit {
			metadata = cache.Metadata
		}
		if cache == nil || cache.IsExpired {
			c.QueueLookup(bundleID, country)
		}

		if metadata != nil {
			app.AppStore = metadata
		}
		out[i] = app
	}
	return out
}
