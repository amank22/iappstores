package appstore

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
)

func newTestAppStoreCache(t *testing.T) *CacheStore {
	t.Helper()
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewCacheStore(db)
}

func sampleMetadata() contracts.AppStoreMetadata {
	name := "Example"
	return contracts.AppStoreMetadata{
		Country: "us", BundleID: "com.example.app", TrackID: 123, TrackViewURL: "https://apps.apple.com/app/id123",
		Name: name, ScreenshotUrls: []string{}, IpadScreenshotUrls: []string{}, Genres: []string{}, FetchedAt: time.Now().UnixMilli(),
	}
}

func TestWriteHitAndRead(t *testing.T) {
	s := newTestAppStoreCache(t)
	meta := sampleMetadata()
	if err := s.WriteHit("us", "com.example.app", meta, time.Hour); err != nil {
		t.Fatalf("write hit: %v", err)
	}
	entry := s.Read("us", "com.example.app")
	if entry == nil || entry.Status != StatusHit || entry.Metadata == nil {
		t.Fatalf("entry = %+v", entry)
	}
	if entry.Metadata.Name != "Example" {
		t.Errorf("metadata name = %s", entry.Metadata.Name)
	}
}

func TestWriteMiss(t *testing.T) {
	s := newTestAppStoreCache(t)
	if err := s.WriteMiss("us", "com.example.missing", time.Hour); err != nil {
		t.Fatalf("write miss: %v", err)
	}
	entry := s.Read("us", "com.example.missing")
	if entry == nil || entry.Status != StatusMiss || entry.Metadata != nil {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestWriteErrorResult(t *testing.T) {
	s := newTestAppStoreCache(t)
	if err := s.WriteErrorResult("us", "com.example.err", "boom", time.Hour); err != nil {
		t.Fatalf("write error: %v", err)
	}
	entry := s.Read("us", "com.example.err")
	if entry == nil || entry.Status != StatusError || entry.LastError == nil || *entry.LastError != "boom" {
		t.Fatalf("entry = %+v", entry)
	}
}

func TestReadBatch(t *testing.T) {
	s := newTestAppStoreCache(t)
	s.WriteHit("us", "com.example.a", sampleMetadata(), time.Hour)
	s.WriteMiss("us", "com.example.b", time.Hour)

	batch := s.ReadBatch("us", []string{"com.example.a", "com.example.b", "com.example.missing-entirely"})
	if len(batch) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(batch))
	}
	if batch["com.example.a"].Status != StatusHit {
		t.Errorf("a status = %s", batch["com.example.a"].Status)
	}
	if batch["com.example.b"].Status != StatusMiss {
		t.Errorf("b status = %s", batch["com.example.b"].Status)
	}
}

func TestExpiry(t *testing.T) {
	s := newTestAppStoreCache(t)
	s.WriteHit("us", "com.example.old", sampleMetadata(), -time.Hour)
	entry := s.Read("us", "com.example.old")
	if entry == nil || !entry.IsExpired {
		t.Error("expected expired entry")
	}
}
