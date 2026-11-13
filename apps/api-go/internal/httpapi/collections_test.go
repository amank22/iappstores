package httpapi

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
)

func TestConcurrentColdCollectionRequestsShareOneBuild(t *testing.T) {
	s := newTestServer(t)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := httptest.NewRecorder()
			s.Routes().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/collections/trending-apps", nil))
			if w.Code != 200 {
				t.Errorf("status = %d", w.Code)
			}
		}()
	}
	wg.Wait()

	// 20 requests may land before or after the first build finishes, but never one
	// build each, and once cached nothing builds again.
	builds := s.collectionBuilds.Load()
	if builds < 1 || builds > 3 {
		t.Fatalf("builds = %d for 20 concurrent cold requests", builds)
	}
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/collections/trending-apps", nil))
	if s.collectionBuilds.Load() != builds {
		t.Fatalf("a cached request started a build")
	}
}

func TestExpiredCollectionIsServedStaleWhileItRefreshes(t *testing.T) {
	t.Setenv("COLLECTION_CACHE_TTL_MINUTES", "0.0001") // 6ms
	s := newTestServer(t)
	slug := contracts.CollectionNew

	first := s.getCachedCollection(slug)
	if s.collectionBuilds.Load() != 1 {
		t.Fatalf("builds = %d after the first request, want 1", s.collectionBuilds.Load())
	}
	time.Sleep(20 * time.Millisecond)

	start := time.Now()
	stale := s.getCachedCollection(slug)
	if stale.Slug != first.Slug {
		t.Fatalf("stale response = %+v", stale)
	}
	if time.Since(start) > 50*time.Millisecond {
		t.Fatalf("expired entry was not served straight from cache: %v", time.Since(start))
	}
	deadline := time.Now().Add(3 * time.Second)
	for s.collectionBuilds.Load() < 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if s.collectionBuilds.Load() < 2 {
		t.Fatal("expired entry was never refreshed in the background")
	}
}
