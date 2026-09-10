package repo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/dbconn"
	"github.com/iappstores/api-go/internal/sources"
)

func newTestClient(t *testing.T) (*Client, *CacheStore) {
	t.Helper()
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	cache := NewCacheStore(db)
	return NewClient(cache, nil), cache
}

func TestGetSourceAppsFetchesAndCaches(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"apps": []interface{}{
				map[string]interface{}{"name": "Test App", "bundleIdentifier": "com.example.test", "versions": []interface{}{}},
			},
		})
	}))
	defer server.Close()

	client, _ := newTestClient(t)
	source := sources.SourceDefinition{ID: "test", Name: "Test Source", URL: server.URL}

	apps, err := client.GetSourceApps(context.Background(), source, time.Hour)
	if err != nil {
		t.Fatalf("GetSourceApps: %v", err)
	}
	if len(apps) != 1 || apps[0].Name != "Test App" {
		t.Fatalf("apps = %+v", apps)
	}

	// Second call should hit the in-memory cache without another HTTP round trip.
	client.httpClient = &http.Client{Transport: failingTransport{}}
	apps2, err := client.GetSourceApps(context.Background(), source, time.Hour)
	if err != nil {
		t.Fatalf("cached GetSourceApps: %v", err)
	}
	if len(apps2) != 1 {
		t.Fatalf("expected cached result, got %+v", apps2)
	}
}

type failingTransport struct{}

func (failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	panic("should not perform a network request when cache is warm")
}

func TestGetSourceAppsPropagatesFetchErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client, _ := newTestClient(t)
	source := sources.SourceDefinition{ID: "test-error", Name: "Test Source", URL: server.URL}

	if _, err := client.GetSourceApps(context.Background(), source, time.Hour); err == nil {
		t.Fatal("expected an error for a 500 response")
	}
}

func TestRefreshSourceAppsDedupesConcurrentCalls(t *testing.T) {
	var callCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		time.Sleep(50 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"apps": []interface{}{}})
	}))
	defer server.Close()

	client, _ := newTestClient(t)
	source := sources.SourceDefinition{ID: "test-dedupe", Name: "Test Source", URL: server.URL}

	done := make(chan error, 3)
	for i := 0; i < 3; i++ {
		go func() {
			_, err := client.RefreshSourceApps(context.Background(), source, time.Hour)
			done <- err
		}()
	}
	for i := 0; i < 3; i++ {
		if err := <-done; err != nil {
			t.Errorf("refresh error: %v", err)
		}
	}
	if callCount != 1 {
		t.Errorf("expected exactly 1 HTTP call for 3 concurrent refreshes, got %d", callCount)
	}
}

func TestMapWithConcurrencyPreservesOrder(t *testing.T) {
	items := []int{1, 2, 3, 4, 5, 6, 7, 8}
	results := mapWithConcurrency(items, 3, func(i int) int { return i * 2 })
	for i, v := range results {
		if v != items[i]*2 {
			t.Errorf("index %d: got %d, want %d", i, v, items[i]*2)
		}
	}
}

func TestSlugifySourcePart(t *testing.T) {
	if got := slugifySourcePart("My Repo.json"); got != "my-repo" {
		t.Errorf("slugifySourcePart = %q", got)
	}
	if got := slugifySourcePart(""); got != "repo" {
		t.Errorf("slugifySourcePart('') = %q, want 'repo'", got)
	}
}

func TestGetGithubRawUrlFromTreeUrl(t *testing.T) {
	treeURL := "https://api.github.com/repos/owner/repo/git/trees/main"
	raw, err := getGithubRawURLFromTreeURL(treeURL, "some/path.json")
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	want := "https://raw.githubusercontent.com/owner/repo/main/some/path.json"
	if raw != want {
		t.Errorf("raw = %q, want %q", raw, want)
	}
}
