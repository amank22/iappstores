package downloads

import (
	"database/sql"

	"github.com/iappstores/api-go/internal/contracts"
)

type AnalyticsStore struct {
	db *sql.DB
}

func NewAnalyticsStore(db *sql.DB) *AnalyticsStore {
	return &AnalyticsStore{db: db}
}

type AnalyticsInput struct {
	AppID            string
	BundleIdentifier *string
	AppName          string
	SourceID         string
	SourceName       string
	DownloadURL      string
	ProbeStatus      ProbeStatus
	ProbeStatusCode  *int
	ProbeError       *string
	CreatedAt        int64
	SessionHash      *string
}

func increment(status, expected ProbeStatus) int {
	if status == expected {
		return 1
	}
	return 0
}

// RecordDownloadAttempt mirrors recordDownloadAttempt(): appends a raw event row and
// upserts the (app, source, url) rollup stats row in one transaction.
func (s *AnalyticsStore) RecordDownloadAttempt(in AnalyticsInput) error {
	successInc := increment(in.ProbeStatus, ProbeSuccess)
	failureInc := increment(in.ProbeStatus, ProbeHardFailure)
	inconclusiveInc := increment(in.ProbeStatus, ProbeInconclusive)
	var lastSuccessAt, lastFailureAt interface{}
	if in.ProbeStatus == ProbeSuccess {
		lastSuccessAt = in.CreatedAt
	}
	if in.ProbeStatus == ProbeHardFailure {
		lastFailureAt = in.CreatedAt
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO download_events (app_id, bundle_identifier, app_name, source_id, source_name, download_url,
			probe_status, probe_status_code, probe_error, session_hash, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, in.AppID, nilableStr(in.BundleIdentifier), in.AppName, in.SourceID, in.SourceName, in.DownloadURL,
		string(in.ProbeStatus), nilableInt(in.ProbeStatusCode), nilableStr(in.ProbeError), nilableStr(in.SessionHash), in.CreatedAt); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO download_link_stats (
			app_id, bundle_identifier, app_name, source_id, source_name, download_url,
			click_count, success_count, failure_count, inconclusive_count,
			last_status, last_status_code, last_error,
			first_downloaded_at, last_downloaded_at, last_checked_at, last_success_at, last_failure_at
		)
		VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(app_id, source_id, download_url) DO UPDATE SET
			bundle_identifier = excluded.bundle_identifier,
			app_name = excluded.app_name,
			source_name = excluded.source_name,
			click_count = download_link_stats.click_count + 1,
			success_count = download_link_stats.success_count + excluded.success_count,
			failure_count = download_link_stats.failure_count + excluded.failure_count,
			inconclusive_count = download_link_stats.inconclusive_count + excluded.inconclusive_count,
			last_status = excluded.last_status,
			last_status_code = excluded.last_status_code,
			last_error = excluded.last_error,
			last_downloaded_at = excluded.last_downloaded_at,
			last_checked_at = excluded.last_checked_at,
			last_success_at = COALESCE(excluded.last_success_at, download_link_stats.last_success_at),
			last_failure_at = COALESCE(excluded.last_failure_at, download_link_stats.last_failure_at)
	`, in.AppID, nilableStr(in.BundleIdentifier), in.AppName, in.SourceID, in.SourceName, in.DownloadURL,
		successInc, failureInc, inconclusiveInc, string(in.ProbeStatus), nilableInt(in.ProbeStatusCode), nilableStr(in.ProbeError),
		in.CreatedAt, in.CreatedAt, in.CreatedAt, lastSuccessAt, lastFailureAt); err != nil {
		return err
	}

	return tx.Commit()
}

func nilableStr(s *string) interface{} {
	if s == nil {
		return nil
	}
	return *s
}

func nilableInt(n *int) interface{} {
	if n == nil {
		return nil
	}
	return *n
}

// ReadDownloadCounts mirrors readDownloadCounts(): non-failing download event counts per
// app id, optionally since a given timestamp.
func (s *AnalyticsStore) ReadDownloadCounts(since *int64) map[string]int {
	out := map[string]int{}
	var rows *sql.Rows
	var err error
	if since == nil {
		rows, err = s.db.Query(`SELECT app_id, COUNT(*) FROM download_events WHERE probe_status != 'hard_failure' GROUP BY app_id`)
	} else {
		rows, err = s.db.Query(`SELECT app_id, COUNT(*) FROM download_events WHERE probe_status != 'hard_failure' AND created_at >= ? GROUP BY app_id`, *since)
	}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var appID string
		var count int
		if rows.Scan(&appID, &count) == nil {
			out[appID] = count
		}
	}
	return out
}

// ReadAlsoDownloaded mirrors readAlsoDownloaded(): co-occurring downloads within the
// same analytics session, requiring at least 3 shared sessions to reduce noise.
func (s *AnalyticsStore) ReadAlsoDownloaded(appID string, since int64, limit int) []string {
	rows, err := s.db.Query(`
		SELECT other.app_id, COUNT(DISTINCT other.session_hash) AS shared_sessions
		FROM download_events target
		JOIN download_events other ON other.session_hash = target.session_hash
		WHERE target.app_id = ? AND target.session_hash IS NOT NULL
			AND target.created_at >= ? AND other.created_at >= ?
			AND other.app_id != target.app_id
			AND target.probe_status != 'hard_failure' AND other.probe_status != 'hard_failure'
		GROUP BY other.app_id
		HAVING shared_sessions >= 3
		ORDER BY shared_sessions DESC, MAX(other.created_at) DESC
		LIMIT ?
	`, appID, since, since, limit)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		var sharedSessions int
		if rows.Scan(&id, &sharedSessions) == nil {
			out = append(out, id)
		}
	}
	return out
}

func (s *AnalyticsStore) ReadPopularDownloadStats(limit int) []contracts.PopularDownloadStatsItem {
	rows, err := s.db.Query(`
		SELECT app_id, bundle_identifier, app_name, SUM(click_count) AS download_count, MAX(last_downloaded_at) AS last_downloaded_at
		FROM download_link_stats
		GROUP BY app_id, bundle_identifier, app_name
		ORDER BY download_count DESC, last_downloaded_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return []contracts.PopularDownloadStatsItem{}
	}
	defer rows.Close()

	out := []contracts.PopularDownloadStatsItem{}
	for rows.Next() {
		var appID, appName string
		var bundleID sql.NullString
		var count int64
		var lastAt sql.NullInt64
		if rows.Scan(&appID, &bundleID, &appName, &count, &lastAt) != nil {
			continue
		}
		item := contracts.PopularDownloadStatsItem{AppID: appID, AppName: appName, DownloadCount: count}
		if bundleID.Valid {
			item.BundleIdentifier = &bundleID.String
		}
		if lastAt.Valid {
			item.LastDownloadedAt = &lastAt.Int64
		}
		out = append(out, item)
	}
	return out
}

func (s *AnalyticsStore) ReadProblemDownloadLinkStats(limit int) []contracts.ProblemDownloadLinkStatsItem {
	rows, err := s.db.Query(`
		SELECT app_id, bundle_identifier, app_name, source_id, source_name, download_url,
			failure_count, last_status, last_status_code, last_failure_at
		FROM download_link_stats
		WHERE failure_count > 0 AND last_status = 'hard_failure'
		ORDER BY last_failure_at DESC, failure_count DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return []contracts.ProblemDownloadLinkStatsItem{}
	}
	defer rows.Close()

	out := []contracts.ProblemDownloadLinkStatsItem{}
	for rows.Next() {
		var appID, appName, sourceID, sourceName, downloadURL, lastStatus string
		var bundleID sql.NullString
		var failureCount int64
		var lastStatusCode, lastFailureAt sql.NullInt64
		if rows.Scan(&appID, &bundleID, &appName, &sourceID, &sourceName, &downloadURL, &failureCount, &lastStatus, &lastStatusCode, &lastFailureAt) != nil {
			continue
		}
		item := contracts.ProblemDownloadLinkStatsItem{
			AppID: appID, AppName: appName, SourceID: sourceID, SourceName: sourceName,
			DownloadURL: downloadURL, FailureCount: failureCount, LastStatus: lastStatus,
		}
		if bundleID.Valid {
			item.BundleIdentifier = &bundleID.String
		}
		if lastStatusCode.Valid {
			item.LastStatusCode = &lastStatusCode.Int64
		}
		if lastFailureAt.Valid {
			item.LastFailureAt = &lastFailureAt.Int64
		}
		out = append(out, item)
	}
	return out
}
