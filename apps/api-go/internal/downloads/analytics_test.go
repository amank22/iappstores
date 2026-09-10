package downloads

import (
	"path/filepath"
	"testing"

	"github.com/iappstores/api-go/internal/dbconn"
)

func newTestAnalyticsStore(t *testing.T) *AnalyticsStore {
	t.Helper()
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewAnalyticsStore(db)
}

func TestRecordDownloadAttemptAndReadCounts(t *testing.T) {
	s := newTestAnalyticsStore(t)
	bundleID := "com.example.app"

	for i := 0; i < 3; i++ {
		if err := s.RecordDownloadAttempt(AnalyticsInput{
			AppID: "app-1", BundleIdentifier: &bundleID, AppName: "App One", SourceID: "source-a", SourceName: "Source A",
			DownloadURL: "https://example.com/app.ipa", ProbeStatus: ProbeSuccess, CreatedAt: int64(1000 + i),
		}); err != nil {
			t.Fatalf("record: %v", err)
		}
	}
	if err := s.RecordDownloadAttempt(AnalyticsInput{
		AppID: "app-1", BundleIdentifier: &bundleID, AppName: "App One", SourceID: "source-a", SourceName: "Source A",
		DownloadURL: "https://example.com/app.ipa", ProbeStatus: ProbeHardFailure, CreatedAt: 2000,
	}); err != nil {
		t.Fatalf("record failure: %v", err)
	}

	counts := s.ReadDownloadCounts(nil)
	if counts["app-1"] != 3 {
		t.Errorf("expected 3 non-failing downloads, got %d", counts["app-1"])
	}

	popular := s.ReadPopularDownloadStats(10)
	if len(popular) != 1 || popular[0].DownloadCount != 4 {
		t.Fatalf("popular = %+v", popular)
	}

	problems := s.ReadProblemDownloadLinkStats(10)
	if len(problems) != 1 || problems[0].FailureCount != 1 {
		t.Fatalf("problems = %+v", problems)
	}
}

func TestReadDownloadCountsSince(t *testing.T) {
	s := newTestAnalyticsStore(t)
	s.RecordDownloadAttempt(AnalyticsInput{AppID: "app-old", AppName: "Old", SourceID: "s", SourceName: "S", DownloadURL: "https://example.com/o.ipa", ProbeStatus: ProbeSuccess, CreatedAt: 100})
	s.RecordDownloadAttempt(AnalyticsInput{AppID: "app-new", AppName: "New", SourceID: "s", SourceName: "S", DownloadURL: "https://example.com/n.ipa", ProbeStatus: ProbeSuccess, CreatedAt: 5000})

	since := int64(1000)
	counts := s.ReadDownloadCounts(&since)
	if _, ok := counts["app-old"]; ok {
		t.Error("expected old download to be excluded by since filter")
	}
	if counts["app-new"] != 1 {
		t.Errorf("expected new download counted, got %d", counts["app-new"])
	}
}

func TestReadAlsoDownloadedRequiresSharedSessions(t *testing.T) {
	s := newTestAnalyticsStore(t)
	session := "abc123"

	for i := 0; i < 3; i++ {
		s.RecordDownloadAttempt(AnalyticsInput{AppID: "target", AppName: "Target", SourceID: "s", SourceName: "S", DownloadURL: "https://example.com/t.ipa", ProbeStatus: ProbeSuccess, CreatedAt: int64(1000 + i), SessionHash: &session})
		otherSession := session
		s.RecordDownloadAttempt(AnalyticsInput{AppID: "co-download", AppName: "Co", SourceID: "s", SourceName: "S", DownloadURL: "https://example.com/c.ipa", ProbeStatus: ProbeSuccess, CreatedAt: int64(1000 + i), SessionHash: &otherSession})
	}

	// A single shared session isn't enough (>=3 required); use 3 distinct sessions instead
	// by varying the session hash per iteration.
	s2 := newTestAnalyticsStore(t)
	for i := 0; i < 3; i++ {
		sess := string(rune('a' + i))
		s2.RecordDownloadAttempt(AnalyticsInput{AppID: "target", AppName: "Target", SourceID: "s", SourceName: "S", DownloadURL: "https://example.com/t.ipa", ProbeStatus: ProbeSuccess, CreatedAt: 1000, SessionHash: &sess})
		s2.RecordDownloadAttempt(AnalyticsInput{AppID: "co-download", AppName: "Co", SourceID: "s", SourceName: "S", DownloadURL: "https://example.com/c.ipa", ProbeStatus: ProbeSuccess, CreatedAt: 1000, SessionHash: &sess})
	}

	also := s2.ReadAlsoDownloaded("target", 0, 12)
	if len(also) != 1 || also[0] != "co-download" {
		t.Errorf("also-downloaded (3 sessions) = %v", also)
	}

	alsoInsufficient := s.ReadAlsoDownloaded("target", 0, 12)
	if len(alsoInsufficient) != 0 {
		t.Errorf("expected no also-downloaded results with only 1 shared session, got %v", alsoInsufficient)
	}
}
