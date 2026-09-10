// Package repo ports repoCacheStore.ts, repoClient.ts and repoRefreshWorker.ts: SQLite-
// backed per-source raw-JSON caching with a TTL, an in-memory hot cache on top, and a
// background refresh loop.
package repo

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
)

// CacheStore is the SQLite-backed source_cache table (source raw JSON + TTL metadata).
type CacheStore struct {
	db *sql.DB
}

func NewCacheStore(db *sql.DB) *CacheStore {
	return &CacheStore{db: db}
}

type CacheEntry struct {
	SourceID            string
	SourceURL           string
	FetchedAt           int64
	ExpiresAt           int64
	AppCount            int
	Apps                []contracts.AppDto
	LastError           *string
	LastErrorAt         *int64
	ConsecutiveFailures int
	IsExpired           bool
}

// Read mirrors readSourceCache(): returns nil if there's no row, the row's URL doesn't
// match the source's current URL (source definitions changed), or the JSON fails to parse.
func (s *CacheStore) Read(sourceID, sourceURL string) *CacheEntry {
	row := s.db.QueryRow(`SELECT source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at, consecutive_failures
		FROM source_cache WHERE source_id = ?`, sourceID)

	var (
		id, url, appsJSON    string
		fetchedAt, expiresAt int64
		appCount             int
		lastError            sql.NullString
		lastErrorAt          sql.NullInt64
		consecutiveFailures  int
	)
	if err := row.Scan(&id, &url, &fetchedAt, &expiresAt, &appCount, &appsJSON, &lastError, &lastErrorAt, &consecutiveFailures); err != nil {
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
		SourceID:            id,
		SourceURL:           url,
		FetchedAt:           fetchedAt,
		ExpiresAt:           expiresAt,
		AppCount:            appCount,
		Apps:                apps,
		ConsecutiveFailures: consecutiveFailures,
		IsExpired:           expiresAt <= time.Now().UnixMilli(),
	}
	if lastError.Valid {
		entry.LastError = &lastError.String
	}
	if lastErrorAt.Valid {
		entry.LastErrorAt = &lastErrorAt.Int64
	}
	return entry
}

// Write mirrors writeSourceCache(). Retries with backoff on SQLITE_BUSY (see
// dbconn.RetryOnBusy) since the concurrency-limited refresh worker can run several of
// these writes at once against SQLite's single writer lock.
func (s *CacheStore) Write(sourceID, sourceURL string, apps []contracts.AppDto, ttl time.Duration) error {
	now := time.Now().UnixMilli()
	appsJSON, err := json.Marshal(apps)
	if err != nil {
		return err
	}
	return dbconn.RetryOnBusy(func() error {
		_, err := s.db.Exec(`
			INSERT INTO source_cache (source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at, consecutive_failures)
			VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0)
			ON CONFLICT(source_id) DO UPDATE SET
				source_url = excluded.source_url,
				fetched_at = excluded.fetched_at,
				expires_at = excluded.expires_at,
				app_count = excluded.app_count,
				apps_json = excluded.apps_json,
				last_error = NULL,
				last_error_at = NULL,
				consecutive_failures = 0
		`, sourceID, sourceURL, now, now+ttl.Milliseconds(), len(apps), string(appsJSON))
		return err
	})
}

// WriteError mirrors writeSourceCacheError(), extended to upsert (a source that has never
// fetched successfully has no existing row yet) and to track consecutive_failures so the
// refresh worker can back off sources that keep failing instead of retrying them every
// cycle forever. A successful Write resets consecutive_failures back to 0.
func (s *CacheStore) WriteError(sourceID, sourceURL, message string) error {
	now := time.Now().UnixMilli()
	return dbconn.RetryOnBusy(func() error {
		_, err := s.db.Exec(`
			INSERT INTO source_cache (source_id, source_url, fetched_at, expires_at, app_count, apps_json, last_error, last_error_at, consecutive_failures)
			VALUES (?, ?, 0, ?, 0, '[]', ?, ?, 1)
			ON CONFLICT(source_id) DO UPDATE SET
				last_error = excluded.last_error,
				last_error_at = excluded.last_error_at,
				consecutive_failures = consecutive_failures + 1
		`, sourceID, sourceURL, now, message, now)
		return err
	})
}
