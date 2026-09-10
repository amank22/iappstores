// Package appstore ports appStoreClient.ts and appStoreCacheStore.ts: an iTunes lookup
// client with positive/negative SQLite caching and a rate-limited background queue.
package appstore

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
)

type CacheStatus string

const (
	StatusHit   CacheStatus = "hit"
	StatusMiss  CacheStatus = "miss"
	StatusError CacheStatus = "error"
)

type CacheEntry struct {
	Country     string
	BundleID    string
	Status      CacheStatus
	FetchedAt   int64
	ExpiresAt   int64
	Metadata    *contracts.AppStoreMetadata
	LastError   *string
	LastErrorAt *int64
	IsExpired   bool
}

type CacheStore struct {
	db *sql.DB
}

func NewCacheStore(db *sql.DB) *CacheStore {
	return &CacheStore{db: db}
}

func (s *CacheStore) toEntry(country, bundleID, status string, fetchedAt, expiresAt int64, metadataJSON, lastError sql.NullString, lastErrorAt sql.NullInt64) *CacheEntry {
	entry := &CacheEntry{
		Country:   country,
		BundleID:  bundleID,
		Status:    CacheStatus(status),
		FetchedAt: fetchedAt,
		ExpiresAt: expiresAt,
		IsExpired: expiresAt <= time.Now().UnixMilli(),
	}
	if metadataJSON.Valid {
		var m contracts.AppStoreMetadata
		if err := json.Unmarshal([]byte(metadataJSON.String), &m); err != nil {
			return nil
		}
		entry.Metadata = &m
	}
	if lastError.Valid {
		entry.LastError = &lastError.String
	}
	if lastErrorAt.Valid {
		entry.LastErrorAt = &lastErrorAt.Int64
	}
	return entry
}

func (s *CacheStore) Read(country, bundleID string) *CacheEntry {
	row := s.db.QueryRow(`SELECT country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at
		FROM app_store_cache WHERE country = ? AND bundle_id = ?`, country, bundleID)
	var c, b, status string
	var fetchedAt, expiresAt int64
	var metadataJSON, lastError sql.NullString
	var lastErrorAt sql.NullInt64
	if err := row.Scan(&c, &b, &status, &fetchedAt, &expiresAt, &metadataJSON, &lastError, &lastErrorAt); err != nil {
		return nil
	}
	return s.toEntry(c, b, status, fetchedAt, expiresAt, metadataJSON, lastError, lastErrorAt)
}

// ReadBatch mirrors readAppStoreCacheBatch().
func (s *CacheStore) ReadBatch(country string, bundleIDs []string) map[string]*CacheEntry {
	out := map[string]*CacheEntry{}
	unique := map[string]bool{}
	var ids []string
	for _, id := range bundleIDs {
		if !unique[id] {
			unique[id] = true
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return out
	}

	placeholders := ""
	args := []interface{}{country}
	for i, id := range ids {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args = append(args, id)
	}

	rows, err := s.db.Query(`SELECT country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at
		FROM app_store_cache WHERE country = ? AND bundle_id IN (`+placeholders+`)`, args...)
	if err != nil {
		return out
	}
	defer rows.Close()

	for rows.Next() {
		var c, b, status string
		var fetchedAt, expiresAt int64
		var metadataJSON, lastError sql.NullString
		var lastErrorAt sql.NullInt64
		if rows.Scan(&c, &b, &status, &fetchedAt, &expiresAt, &metadataJSON, &lastError, &lastErrorAt) != nil {
			continue
		}
		if entry := s.toEntry(c, b, status, fetchedAt, expiresAt, metadataJSON, lastError, lastErrorAt); entry != nil {
			out[b] = entry
		}
	}
	return out
}

func (s *CacheStore) WriteHit(country, bundleID string, metadata contracts.AppStoreMetadata, ttl time.Duration) error {
	now := time.Now().UnixMilli()
	b, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	return dbconn.RetryOnBusy(func() error {
		_, err := s.db.Exec(`
			INSERT INTO app_store_cache (country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at)
			VALUES (?, ?, 'hit', ?, ?, ?, NULL, NULL)
			ON CONFLICT(country, bundle_id) DO UPDATE SET
				status = excluded.status, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
				metadata_json = excluded.metadata_json, last_error = NULL, last_error_at = NULL
		`, country, bundleID, now, now+ttl.Milliseconds(), string(b))
		return err
	})
}

func (s *CacheStore) WriteMiss(country, bundleID string, ttl time.Duration) error {
	now := time.Now().UnixMilli()
	return dbconn.RetryOnBusy(func() error {
		_, err := s.db.Exec(`
			INSERT INTO app_store_cache (country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at)
			VALUES (?, ?, 'miss', ?, ?, NULL, NULL, NULL)
			ON CONFLICT(country, bundle_id) DO UPDATE SET
				status = excluded.status, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
				metadata_json = NULL, last_error = NULL, last_error_at = NULL
		`, country, bundleID, now, now+ttl.Milliseconds())
		return err
	})
}

func (s *CacheStore) WriteErrorResult(country, bundleID, message string, ttl time.Duration) error {
	now := time.Now().UnixMilli()
	return dbconn.RetryOnBusy(func() error {
		_, err := s.db.Exec(`
			INSERT INTO app_store_cache (country, bundle_id, status, fetched_at, expires_at, metadata_json, last_error, last_error_at)
			VALUES (?, ?, 'error', ?, ?, NULL, ?, ?)
			ON CONFLICT(country, bundle_id) DO UPDATE SET
				status = excluded.status, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
				metadata_json = NULL, last_error = excluded.last_error, last_error_at = excluded.last_error_at
		`, country, bundleID, now, now+ttl.Milliseconds(), message, now)
		return err
	})
}
