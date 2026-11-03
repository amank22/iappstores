// Package dbconn owns the single shared *sql.DB for the whole process (replacing the
// original TS code's four separate node:sqlite DatabaseSync handles onto the same file)
// plus pragma setup and embedded-SQL-file migrations.
package dbconn

import (
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"time"

	_ "modernc.org/sqlite"

	"github.com/iappstores/api-go/internal/migrations"
)

// Open opens (creating parent directories and the file as needed) the shared SQLite
// database at path, applies pragmas suited to a small-memory VPS, runs all embedded
// migrations idempotently, and returns the single connection pool for the whole process.
func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	// Per-connection pragmas go in the DSN so every pooled connection gets them; a plain
	// db.Exec("PRAGMA ...") only reaches whichever single connection runs it.
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"+
		"&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// SQLite allows one writer at a time, but WAL lets readers run alongside it, so the
	// pool needs room for reads while the background source refresh holds connections in
	// write transactions (REPO_REFRESH_CONCURRENCY syncs at once, plus App Store lookups).
	// With 4, a refresh could take every connection and user requests queued for seconds.
	// Each connection keeps SQLite's default ~2MB page cache, so 8 stays small.
	db.SetMaxOpenConns(8)
	db.SetConnMaxLifetime(0)

	// Larger page cache and memory-mapped reads for the first connection only, as before;
	// applying them to every pooled connection would multiply SQLite's memory use.
	pragmas := []string{
		"PRAGMA cache_size = -8000",   // ~8MB page cache
		"PRAGMA mmap_size = 67108864", // 64MB
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("pragma %q: %w", p, err)
		}
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		return fmt.Errorf("bootstrap schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var count int
		if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE id = ?`, name).Scan(&count); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if count > 0 {
			continue
		}

		sqlBytes, err := migrations.Files.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations(id, applied_at) VALUES (?, ?)`, name, time.Now().UnixMilli()); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}

	return nil
}
