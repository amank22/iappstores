package dbconn

import (
	"strings"
	"time"
)

// BusyRetryDelays are the backoff steps RetryOnBusy waits between attempts. SQLite's own
// busy_timeout (set per-connection via the DSN in Open) already makes each individual
// statement wait up to 5s for the write lock, so SQLITE_BUSY surfacing here means a whole
// operation lost that race outright (e.g. another writer held the lock for the full
// timeout) -- retrying the whole operation, not just one statement, is what's needed,
// since a partial retry mid-transaction would leave it inconsistent.
var BusyRetryDelays = []time.Duration{50 * time.Millisecond, 200 * time.Millisecond, 500 * time.Millisecond}

// IsBusyErr reports whether err indicates SQLite's writer lock was contended
// (SQLITE_BUSY / "database is locked"), as opposed to a real data or logic error that
// retrying would just reproduce.
func IsBusyErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "database is locked") || strings.Contains(msg, "sqlite_busy")
}

// RetryOnBusy runs fn, retrying with backoff (per BusyRetryDelays) while it fails with
// SQLITE_BUSY, since concurrent source refreshes can briefly contend for SQLite's single
// writer lock. Any other error, or exhausting the retry budget, returns immediately.
func RetryOnBusy(fn func() error) error {
	var err error
	for attempt := 0; ; attempt++ {
		err = fn()
		if err == nil || !IsBusyErr(err) || attempt >= len(BusyRetryDelays) {
			return err
		}
		time.Sleep(BusyRetryDelays[attempt])
	}
}
