// Package repo ports repoCacheStore.ts, repoClient.ts and repoRefreshWorker.ts: SQLite-
// backed per-source raw-JSON caching with a TTL, an in-memory hot cache on top, and a
// background refresh loop.
package repo

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
)

// CacheStore is the SQLite-backed source_cache table (source raw JSON + TTL metadata).
type CacheStore struct {
	db *sql.DB
}

func NewCacheStore(db *sql.DB) *CacheStore {
	return &CacheStore{db: db}
}

type CacheEntry struct {
	SourceID    string
	SourceURL   string
	FetchedAt   int64
	ExpiresAt   int64
	AppCount    int
	Apps        []contracts.AppDto
	LastError   *string
	LastErrorAt *int64
	IsExpired   bool
}

// Read mirrors readSourceCache(): returns nil if there's no row, the row's URL doesn't
// match the source's current URL (source definitions changed), or the JSON fails to parse.
func (s *CacheStore) Read(sourceID, sourceURL string) *CacheEntry {
	row := s.db.QueryRow(`SELECT source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at
		FROM source_cache WHERE source_id = ?`, sourceID)

	var (
		id, url, appsJSON    string
		fetchedAt, expiresAt int64
		appCount             int
		lastError            sql.NullString
		lastErrorAt          sql.NullInt64
	)
	if err := row.Scan(&id, &url, &fetchedAt, &expiresAt, &appCount, &appsJSON, &lastError, &lastErrorAt); err != nil {
		return nil
	}
	if url != sourceURL {
		return nil
	}

	var apps []contracts.AppDto
	if err := json.Unmarshal([]byte(appsJSON), &apps); err != nil {
		return nil
	}

	entry := &CacheEntry{
		SourceID:  id,
		SourceURL: url,
		FetchedAt: fetchedAt,
		ExpiresAt: expiresAt,
		AppCount:  appCount,
		Apps:      apps,
		IsExpired: expiresAt <= time.Now().UnixMilli(),
	}
	if lastError.Valid {
		entry.LastError = &lastError.String
	}
	if lastErrorAt.Valid {
		entry.LastErrorAt = &lastErrorAt.Int64
	}
	return entry
}

// Write mirrors writeSourceCache().
func (s *CacheStore) Write(sourceID, sourceURL string, apps []contracts.AppDto, ttl time.Duration) error {
	now := time.Now().UnixMilli()
	appsJSON, err := json.Marshal(apps)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
		INSERT INTO source_cache (source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at)
		VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
		ON CONFLICT(source_id) DO UPDATE SET
			source_url = excluded.source_url,
			fetched_at = excluded.fetched_at,
			expires_at = excluded.expires_at,
			app_count = excluded.app_count,
			apps_json = excluded.apps_json,
			last_error = NULL,
			last_error_at = NULL
	`, sourceID, sourceURL, now, now+ttl.Milliseconds(), len(apps), string(appsJSON))
	return err
}

// WriteError mirrors writeSourceCacheError().
func (s *CacheStore) WriteError(sourceID string, message string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`UPDATE source_cache SET last_error = ?, last_error_at = ? WHERE source_id = ?`, message, now, sourceID)
	return err
}
