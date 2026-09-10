package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/catalog"
	"github.com/iappstores/api-go/internal/dbconn"
	"github.com/iappstores/api-go/internal/downloads"
	"github.com/iappstores/api-go/internal/repo"
	"github.com/iappstores/api-go/internal/sources"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	t.Setenv("APP_STORE_ENRICHMENT_DISABLED", "true")
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	catalogStore := catalog.NewStore(db)
	repoCache := repo.NewCacheStore(db)
	repoClient := repo.NewClient(repoCache, nil)
	appStoreClient := appstore.NewClient(appstore.NewCacheStore(db))
	analytics := downloads.NewAnalyticsStore(db)

	return NewServer(catalogStore, repoClient, appStoreClient, analytics, sources.Sources)
}

func TestHealthEndpoint(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["ok"] != true || body["service"] != "iappstores-api" {
		t.Errorf("body = %+v", body)
	}
}

func TestSourcesEndpointShape(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/sources", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Robots-Tag"); got != "noindex, follow" {
		t.Errorf("X-Robots-Tag = %q", got)
	}
	var body struct {
		Sources []map[string]interface{} `json:"sources"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(body.Sources) != len(sources.Sources) {
		t.Fatalf("expected %d sources, got %d", len(sources.Sources), len(body.Sources))
	}
	first := body.Sources[0]
	for _, key := range []string{"id", "name", "subtitle", "url", "website"} {
		if _, ok := first[key]; !ok {
			t.Errorf("missing key %q in source dto: %+v", key, first)
		}
	}
	if _, ok := first["appCount"]; ok {
		t.Errorf("expected appCount key to be absent when not requested, got %+v", first)
	}
}

func TestAppsEndpointEmptyCatalogShape(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/apps?pageSize=5", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	var body struct {
		Apps       []interface{}            `json:"apps"`
		Pagination map[string]interface{}   `json:"pagination"`
		Categories []map[string]interface{} `json:"categories"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.Apps == nil {
		t.Error("expected apps to be an empty array, not null")
	}
	if len(body.Categories) != 15 {
		t.Errorf("expected 15 category facets, got %d", len(body.Categories))
	}
	if body.Pagination["pageSize"].(float64) != 5 {
		t.Errorf("pagination.pageSize = %v", body.Pagination["pageSize"])
	}
}

func TestAppsEndpointInvalidQuery(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/apps?includeAppStore=maybe", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)

	if w.Code != 400 {
		t.Fatalf("status = %d", w.Code)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	json.Unmarshal(w.Body.Bytes(), &body)
	if body.Error.Code != "invalid_apps_query" {
		t.Errorf("error code = %q", body.Error.Code)
	}
}

func TestAppNotFound(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/apps/does-not-exist", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)

	if w.Code != 404 {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestCollectionNotFound(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/collections/not-a-real-slug", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)
	if w.Code != 404 {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestCORSHeaders(t *testing.T) {
	t.Setenv("CORS_ORIGIN", "https://example.com")
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://example.com" {
		t.Errorf("Access-Control-Allow-Origin = %q", got)
	}
}
