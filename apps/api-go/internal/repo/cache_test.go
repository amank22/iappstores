package repo

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
)

func newTestCacheStore(t *testing.T) *CacheStore {
	t.Helper()
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewCacheStore(db)
}

func TestCacheStoreWriteAndRead(t *testing.T) {
	s := newTestCacheStore(t)
	name := "App One"
	apps := []contracts.AppDto{{ID: "s:1", Name: name, Category: contracts.CategoryTools, Screenshots: []string{}, DownloadOptions: []contracts.AppDownloadOption{}, Versions: []contracts.AppVersionBuild{}}}

	if err := s.Write("source-a", "https://example.com/a.json", apps, time.Hour); err != nil {
		t.Fatalf("write: %v", err)
	}

	entry := s.Read("source-a", "https://example.com/a.json")
	if entry == nil {
		t.Fatal("expected cache entry")
	}
	if entry.IsExpired {
		t.Error("expected fresh entry to not be expired")
	}
	if len(entry.Apps) != 1 || entry.Apps[0].Name != "App One" {
		t.Errorf("apps = %+v", entry.Apps)
	}
}

func TestCacheStoreReadReturnsNilOnUrlMismatch(t *testing.T) {
	s := newTestCacheStore(t)
	if err := s.Write("source-a", "https://example.com/a.json", nil, time.Hour); err != nil {
		t.Fatalf("write: %v", err)
	}
	if entry := s.Read("source-a", "https://example.com/different.json"); entry != nil {
		t.Error("expected nil entry when source URL has changed")
	}
}

func TestCacheStoreExpiry(t *testing.T) {
	s := newTestCacheStore(t)
	if err := s.Write("source-a", "https://example.com/a.json", nil, -time.Hour); err != nil {
		t.Fatalf("write: %v", err)
	}
	entry := s.Read("source-a", "https://example.com/a.json")
	if entry == nil || !entry.IsExpired {
		t.Error("expected expired entry")
	}
}

func TestCacheStoreWriteError(t *testing.T) {
	s := newTestCacheStore(t)
	if err := s.Write("source-a", "https://example.com/a.json", nil, time.Hour); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := s.WriteError("source-a", "https://example.com/a.json", "boom"); err != nil {
		t.Fatalf("write error: %v", err)
	}
	entry := s.Read("source-a", "https://example.com/a.json")
	if entry == nil || entry.LastError == nil || *entry.LastError != "boom" {
		t.Errorf("expected last error to be set, got %+v", entry)
	}
	if entry.ConsecutiveFailures != 1 {
		t.Errorf("expected consecutive_failures = 1, got %d", entry.ConsecutiveFailures)
	}

	// A subsequent success resets the failure streak.
	if err := s.Write("source-a", "https://example.com/a.json", nil, time.Hour); err != nil {
		t.Fatalf("write: %v", err)
	}
	entry = s.Read("source-a", "https://example.com/a.json")
	if entry == nil || entry.LastError != nil || entry.ConsecutiveFailures != 0 {
		t.Errorf("expected failure streak reset after success, got %+v", entry)
	}
}

func TestCacheStoreWriteErrorWithoutPriorSuccess(t *testing.T) {
	s := newTestCacheStore(t)
	if err := s.WriteError("source-a", "https://example.com/a.json", "boom"); err != nil {
		t.Fatalf("write error: %v", err)
	}
	entry := s.Read("source-a", "https://example.com/a.json")
	if entry == nil {
		t.Fatal("expected a row to exist even though the source has never succeeded")
	}
	if entry.LastError == nil || *entry.LastError != "boom" || entry.ConsecutiveFailures != 1 {
		t.Errorf("unexpected entry: %+v", entry)
	}
	if !entry.IsExpired {
		t.Error("expected an error-only entry to be expired so it stays eligible for retry")
	}

	if err := s.WriteError("source-a", "https://example.com/a.json", "boom again"); err != nil {
		t.Fatalf("write error: %v", err)
	}
	entry = s.Read("source-a", "https://example.com/a.json")
	if entry == nil || entry.ConsecutiveFailures != 2 {
		t.Errorf("expected consecutive_failures = 2, got %+v", entry)
	}
}
