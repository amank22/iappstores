package appstore

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
)

func newTestClient(t *testing.T) *Client {
	t.Helper()
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewClient(NewCacheStore(db))
}

func TestEnrichAppsWithCachedAppStoreMetadataOnlyUsesCache(t *testing.T) {
	client := newTestClient(t)
	bundleID := "com.example.cached"
	client.cache.WriteHit("us", bundleID, sampleMetadata(), time.Hour)

	apps := []contracts.AppDto{{ID: "1", Name: "App", BundleIdentifier: &bundleID, Category: contracts.CategoryTools, Screenshots: []string{}, DownloadOptions: []contracts.AppDownloadOption{}, Versions: []contracts.AppVersionBuild{}}}
	enriched := client.EnrichAppsWithCachedAppStoreMetadata(apps, "us")
	if enriched[0].AppStore == nil {
		t.Fatal("expected cached AppStore metadata to be attached")
	}
	if enriched[0].AppStore.Name != "Example" {
		t.Errorf("appStore.name = %s", enriched[0].AppStore.Name)
	}
}

func TestEnrichAppsQueuesLookupWhenUncached(t *testing.T) {
	client := newTestClient(t)
	bundleID := "com.example.uncached"
	apps := []contracts.AppDto{{ID: "1", Name: "App", BundleIdentifier: &bundleID, Category: contracts.CategoryTools, Screenshots: []string{}, DownloadOptions: []contracts.AppDownloadOption{}, Versions: []contracts.AppVersionBuild{}}}

	enriched := client.EnrichAppsWithCachedAppStoreMetadata(apps, "us")
	if enriched[0].AppStore != nil {
		t.Error("expected no AppStore metadata before any lookup completes")
	}

	client.mu.Lock()
	queued := client.queuedKeys["us:com.example.uncached"]
	client.mu.Unlock()
	if !queued {
		t.Error("expected the bundle id to be queued for a background lookup")
	}
}

func TestQueueLookupDedupes(t *testing.T) {
	client := newTestClient(t)
	client.QueueLookup("com.example.dup", "us")
	client.mu.Lock()
	firstLen := len(client.queue)
	client.mu.Unlock()

	client.QueueLookup("com.example.dup", "us")
	client.mu.Lock()
	secondLen := len(client.queue)
	client.mu.Unlock()

	if firstLen != secondLen {
		t.Errorf("expected duplicate QueueLookup calls to be deduped: %d -> %d", firstLen, secondLen)
	}
}

func TestSanitizeCountry(t *testing.T) {
	if got := sanitizeCountry("US"); got != "us" {
		t.Errorf("sanitizeCountry('US') = %q", got)
	}
	if got := sanitizeCountry("usa"); got != "us" {
		t.Errorf("sanitizeCountry('usa') = %q, want default 'us'", got)
	}
	if got := sanitizeCountry(""); got != "us" {
		t.Errorf("sanitizeCountry('') = %q, want default 'us'", got)
	}
}

func TestToAppStoreMetadataRequiresCoreFields(t *testing.T) {
	result := map[string]interface{}{"bundleId": "com.example.app"}
	if m := toAppStoreMetadata(result, "us", 1000); m != nil {
		t.Errorf("expected nil metadata when required fields are missing, got %+v", m)
	}

	full := map[string]interface{}{
		"bundleId": "com.example.app", "trackId": float64(42), "trackViewUrl": "https://apps.apple.com/app/id42", "trackName": "Full App",
	}
	if m := toAppStoreMetadata(full, "us", 1000); m == nil || m.TrackID != 42 {
		t.Errorf("expected metadata with trackId 42, got %+v", m)
	}
}
