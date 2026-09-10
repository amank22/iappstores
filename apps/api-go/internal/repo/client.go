package repo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/normalizer"
	"github.com/iappstores/api-go/internal/sources"
)

const fetchTimeout = 15 * time.Second

// SyncFunc is invoked after a source's apps are refreshed, mirroring syncSourceCatalog()
// being called directly from repoClient.ts. It's injected rather than imported directly
// so this package doesn't need to depend on the catalog package.
type SyncFunc func(sourceID string, apps []contracts.AppDto)

// RefreshListener mirrors onSourceRefreshed()'s listener list (used by the old
// catalogMaterializer to debounce a full rebuild; kept here for parity even though the
// new architecture no longer materializes a full catalog in memory).
type RefreshListener func(sourceID string)

type cachedRepo struct {
	expiresAt time.Time
	apps      []contracts.AppDto
}

// Client fetches, normalizes and caches source apps, mirroring repoClient.ts.
type Client struct {
	cache      *CacheStore
	httpClient *http.Client
	onSync     SyncFunc

	mu          sync.Mutex
	memCache    map[string]cachedRepo
	inFlight    map[string]chan struct{}
	inFlightErr map[string]error
	listeners   []RefreshListener
}

func NewClient(cache *CacheStore, onSync SyncFunc) *Client {
	return &Client{
		cache:       cache,
		httpClient:  &http.Client{},
		onSync:      onSync,
		memCache:    map[string]cachedRepo{},
		inFlight:    map[string]chan struct{}{},
		inFlightErr: map[string]error{},
	}
}

func (c *Client) OnSourceRefreshed(listener RefreshListener) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.listeners = append(c.listeners, listener)
}

func (c *Client) fetchJSON(ctx context.Context, rawURL string) (interface{}, error) {
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/vnd.github+json, application/json")
	req.Header.Set("user-agent", "iappstores-api/0.2")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Repository returned %d %s", resp.StatusCode, resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var v interface{}
	if err := json.Unmarshal(body, &v); err != nil {
		return nil, err
	}
	return v, nil
}

var nonAlnumRe = regexp.MustCompile(`[^a-z0-9]+`)
var trimDashRe = regexp.MustCompile(`(^-|-$)`)
var jsonExtRe = regexp.MustCompile(`(?i)\.json$`)
var wordStartRe = regexp.MustCompile(`\b\w`)
var githubTreeURLRe = regexp.MustCompile(`^/repos/([^/]+)/([^/]+)/git/trees/(.+)$`)

func slugifySourcePart(value string) string {
	v := jsonExtRe.ReplaceAllString(value, "")
	v = strings.ToLower(v)
	v = nonAlnumRe.ReplaceAllString(v, "-")
	v = trimDashRe.ReplaceAllString(v, "")
	if len(v) > 96 {
		v = v[:96]
	}
	if v == "" {
		v = "repo"
	}
	return v
}

func fallbackSourceName(path string) string {
	parts := strings.Split(path, "/")
	filename := parts[len(parts)-1]
	v := jsonExtRe.ReplaceAllString(filename, "")
	v = strings.ReplaceAll(v, "_", " ")
	v = regexp.MustCompile(`-+`).ReplaceAllString(v, " ")
	v = wordStartRe.ReplaceAllStringFunc(v, strings.ToUpper)
	v = strings.TrimSpace(v)
	if v == "" {
		v = path
	}
	return v
}

func getGithubTreeFetchURL(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("recursive", "1")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func getGithubRawURLFromTreeURL(treeURL, path string) (string, error) {
	u, err := url.Parse(treeURL)
	if err != nil {
		return "", err
	}
	match := githubTreeURLRe.FindStringSubmatch(u.Path)
	if u.Hostname() != "api.github.com" || match == nil {
		return "", fmt.Errorf("Unsupported GitHub tree URL: %s", treeURL)
	}
	owner, repoName, ref := match[1], match[2], match[3]
	ownerDec, _ := url.PathUnescape(owner)
	repoDec, _ := url.PathUnescape(repoName)
	refDec, _ := url.PathUnescape(ref)

	encodedOwner := url.PathEscape(ownerDec)
	encodedRepo := url.PathEscape(repoDec)

	refParts := strings.Split(refDec, "/")
	for i, p := range refParts {
		refParts[i] = url.PathEscape(p)
	}
	encodedRef := strings.Join(refParts, "/")

	pathParts := strings.Split(path, "/")
	for i, p := range pathParts {
		pathParts[i] = url.PathEscape(p)
	}
	encodedPath := strings.Join(pathParts, "/")

	return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", encodedOwner, encodedRepo, encodedRef, encodedPath), nil
}

func extractJSONBlobPaths(treeJSON interface{}) ([]string, error) {
	root, ok := treeJSON.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("GitHub tree response did not include tree[].")
	}
	tree, ok := root["tree"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("GitHub tree response did not include tree[].")
	}
	var paths []string
	for _, entry := range tree {
		m, ok := entry.(map[string]interface{})
		if !ok {
			continue
		}
		path, _ := m["path"].(string)
		typ, _ := m["type"].(string)
		if path != "" && typ == "blob" && strings.HasSuffix(strings.ToLower(path), ".json") {
			paths = append(paths, path)
		}
	}
	return paths, nil
}

func sourceFromGithubJSONPath(parent sources.SourceDefinition, path, url string, repoJSON interface{}) sources.SourceDefinition {
	repoMap, _ := repoJSON.(map[string]interface{})
	name := fallbackSourceName(path)
	if repoMap != nil {
		if n, ok := repoMap["name"].(string); ok && strings.TrimSpace(n) != "" {
			name = strings.TrimSpace(n)
		}
	}
	subtitle := parent.Subtitle
	if repoMap != nil {
		if s, ok := repoMap["subtitle"].(string); ok && strings.TrimSpace(s) != "" {
			v := strings.TrimSpace(s)
			subtitle = &v
		} else if s, ok := repoMap["description"].(string); ok && strings.TrimSpace(s) != "" {
			v := strings.TrimSpace(s)
			subtitle = &v
		}
	}
	website := parent.Website
	if repoMap != nil {
		if w, ok := repoMap["website"].(string); ok {
			if u, err := url2Parse(w); err == nil {
				website = &u
			}
		}
	}

	return sources.SourceDefinition{
		ID:       fmt.Sprintf("%s:%s", parent.ID, slugifySourcePart(path)),
		Name:     name,
		Subtitle: subtitle,
		URL:      url,
		Website:  website,
	}
}

func url2Parse(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("empty")
	}
	u, err := url.Parse(trimmed)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("invalid url")
	}
	return u.String(), nil
}

// mapWithConcurrency runs task over items with at most `concurrency` workers, preserving
// input order in the returned results slice (mirrors the TS helper of the same name).
func mapWithConcurrency[T any, R any](items []T, concurrency int, task func(T) R) []R {
	results := make([]R, len(items))
	if len(items) == 0 {
		return results
	}
	if concurrency < 1 {
		concurrency = 1
	}
	if concurrency > len(items) {
		concurrency = len(items)
	}

	indexCh := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range indexCh {
				results[i] = task(items[i])
			}
		}()
	}
	for i := range items {
		indexCh <- i
	}
	close(indexCh)
	wg.Wait()
	return results
}

type fetchResult struct {
	apps []contracts.AppDto
	err  error
}

func (c *Client) fetchGithubTreeSourceApps(ctx context.Context, source sources.SourceDefinition) ([]contracts.AppDto, error) {
	var treeJSON interface{}
	var err error
	if source.TreeFile != "" {
		raw, ok := sources.TreeFileContent(source.TreeFile)
		if !ok {
			return nil, fmt.Errorf("embedded tree file not found: %s", source.TreeFile)
		}
		if err := json.Unmarshal(raw, &treeJSON); err != nil {
			return nil, err
		}
	} else {
		treeURL, err2 := getGithubTreeFetchURL(source.URL)
		if err2 != nil {
			return nil, err2
		}
		treeJSON, err = c.fetchJSON(ctx, treeURL)
		if err != nil {
			return nil, err
		}
	}

	paths, err := extractJSONBlobPaths(treeJSON)
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("GitHub tree response did not include any JSON blob paths.")
	}

	results := mapWithConcurrency(paths, config.RepoTreeFetchConcurrency(), func(path string) fetchResult {
		rawURL, err := getGithubRawURLFromTreeURL(source.URL, path)
		if err != nil {
			return fetchResult{nil, err}
		}
		raw, err := c.fetchJSON(ctx, rawURL)
		if err != nil {
			return fetchResult{nil, err}
		}
		child := sourceFromGithubJSONPath(source, path, rawURL, raw)
		return fetchResult{normalizer.NormalizeAltStoreRepo(raw, child), nil}
	})

	var apps []contracts.AppDto
	var firstErr error
	for _, r := range results {
		apps = append(apps, r.apps...)
		if r.err != nil && firstErr == nil {
			firstErr = r.err
		}
	}
	if len(apps) == 0 && firstErr != nil {
		return nil, fmt.Errorf("Could not fetch any JSON repos from GitHub tree: %s", firstErr.Error())
	}
	return apps, nil
}

func (c *Client) fetchAltStoreSourceApps(ctx context.Context, source sources.SourceDefinition) ([]contracts.AppDto, error) {
	raw, err := c.fetchJSON(ctx, source.URL)
	if err != nil {
		return nil, err
	}
	return normalizer.NormalizeAltStoreRepo(raw, source), nil
}

func (c *Client) writeMemCache(sourceID string, apps []contracts.AppDto, expiresAt time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.memCache[sourceID] = cachedRepo{expiresAt: expiresAt, apps: apps}
}

func (c *Client) fetchAndPersist(ctx context.Context, source sources.SourceDefinition, ttl time.Duration) ([]contracts.AppDto, error) {
	var apps []contracts.AppDto
	var err error
	if source.Kind == sources.KindGithubTree {
		apps, err = c.fetchGithubTreeSourceApps(ctx, source)
	} else {
		apps, err = c.fetchAltStoreSourceApps(ctx, source)
	}
	if err != nil {
		_ = c.cache.WriteError(source.ID, err.Error())
		return nil, err
	}

	if err := c.cache.Write(source.ID, source.URL, apps, ttl); err != nil {
		return nil, err
	}
	if c.onSync != nil {
		c.onSync(source.ID, apps)
	}
	c.writeMemCache(source.ID, apps, time.Now().Add(ttl))

	c.mu.Lock()
	listeners := append([]RefreshListener{}, c.listeners...)
	c.mu.Unlock()
	for _, l := range listeners {
		l(source.ID)
	}

	return apps, nil
}

// RefreshSourceApps mirrors refreshSourceApps(): dedupes concurrent refreshes of the same
// source into a single in-flight fetch, returning the same result to every caller.
func (c *Client) RefreshSourceApps(ctx context.Context, source sources.SourceDefinition, ttl time.Duration) ([]contracts.AppDto, error) {
	c.mu.Lock()
	if ch, ok := c.inFlight[source.ID]; ok {
		c.mu.Unlock()
		<-ch
		c.mu.Lock()
		err := c.inFlightErr[source.ID]
		c.mu.Unlock()
		if err != nil {
			return nil, err
		}
		c.mu.Lock()
		apps := c.memCache[source.ID].apps
		c.mu.Unlock()
		return apps, nil
	}
	ch := make(chan struct{})
	c.inFlight[source.ID] = ch
	c.mu.Unlock()

	apps, err := c.fetchAndPersist(ctx, source, ttl)

	c.mu.Lock()
	c.inFlightErr[source.ID] = err
	delete(c.inFlight, source.ID)
	close(ch)
	c.mu.Unlock()

	return apps, err
}

// GetSourceApps mirrors getSourceApps(): hot in-memory cache first, then the SQLite
// cache (triggering a background refresh if it's expired), then a synchronous refresh.
func (c *Client) GetSourceApps(ctx context.Context, source sources.SourceDefinition, ttl time.Duration) ([]contracts.AppDto, error) {
	c.mu.Lock()
	cached, ok := c.memCache[source.ID]
	c.mu.Unlock()
	if ok && cached.expiresAt.After(time.Now()) {
		return cached.apps, nil
	}

	sqliteCache := c.cache.Read(source.ID, source.URL)
	if sqliteCache != nil {
		apps := normalizer.RecategorizeApps(sqliteCache.Apps)
		c.writeMemCache(source.ID, apps, time.UnixMilli(sqliteCache.ExpiresAt))

		if sqliteCache.IsExpired {
			go func() {
				_, _ = c.RefreshSourceApps(context.Background(), source, ttl)
			}()
		}

		return apps, nil
	}

	return c.RefreshSourceApps(ctx, source, ttl)
}

// ClearMemCache drops the in-memory hot cache (test helper, mirrors clearRepoCache()).
func (c *Client) ClearMemCache() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.memCache = map[string]cachedRepo{}
}
