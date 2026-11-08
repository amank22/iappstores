package diagnostics

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func captureLog(t *testing.T) *syncBuffer {
	t.Helper()
	buf := &syncBuffer{}
	prevOut, prevFlags := log.Writer(), log.Flags()
	log.SetOutput(buf)
	log.SetFlags(0)
	t.Cleanup(func() {
		log.SetOutput(prevOut)
		log.SetFlags(prevFlags)
	})
	return buf
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestSummarizeGoroutines(t *testing.T) {
	dump := `goroutine 1 [running]:
github.com/iappstores/api-go/internal/normalizer.SortOrder(0x1)
	/src/normalizer/sortorder.go:10 +0x1

goroutine 7 [sync.Mutex.Lock, 2 minutes]:
sync.(*Mutex).Lock(...)
	/go/src/sync/mutex.go:90
github.com/iappstores/api-go/internal/catalog.(*Store).ActiveSnapshot(0xc0)
	/src/catalog/store.go:1 +0x1
github.com/iappstores/api-go/internal/httpapi.(*Server).handleApps(0xc0)
	/src/httpapi/server.go:1 +0x1

goroutine 8 [sync.Mutex.Lock]:
sync.(*Mutex).Lock(...)
	/go/src/sync/mutex.go:90
github.com/iappstores/api-go/internal/catalog.(*Store).ActiveSnapshot(0xc0)
	/src/catalog/store.go:1 +0x1

goroutine 9 [IO wait]:
internal/poll.runtime_pollWait(0x1, 0x72)
	/go/src/runtime/netpoll.go:1 +0x1
net/http.(*conn).serve(0xc0)
	/go/src/net/http/server.go:1 +0x1

goroutine 11 [select]:
github.com/iappstores/api-go/internal/diagnostics.(*Monitor).Run(0xc0)
	/src/diagnostics/monitor.go:1 +0x1

goroutine 12 [select]:
github.com/iappstores/api-go/internal/repo.(*Client).StartRefreshWorker.func1()
	/src/repo/worker.go:1 +0x1

goroutine 13 [select]:
database/sql.(*DB).conn(0xc0)
	/go/src/database/sql/sql.go:1 +0x1
github.com/iappstores/api-go/internal/httpapi.(*Server).handleAppByID(0xc0)
	/src/httpapi/server.go:1 +0x1
net/http.serverHandler.ServeHTTP(...)
	/go/src/net/http/server.go:1
net/http.(*conn).serve(0xc0)
	/go/src/net/http/server.go:1 +0x1

goroutine 14 [runnable]:
runtime/pprof.profileWriter(0xc0)
	/go/src/runtime/pprof/pprof.go:1 +0x1

goroutine 10 [running]:
github.com/iappstores/api-go/internal/diagnostics.(*Monitor).capture(0xc0)
	/src/diagnostics/capture.go:1 +0x1
created by github.com/iappstores/api-go/internal/diagnostics.(*Monitor).TriggerCapture in goroutine 1
	/src/diagnostics/capture.go:1 +0x1`

	got := summarizeGoroutines([]byte(dump))
	want := map[string]int{
		"[running] top=github.com/iappstores/api-go/internal/normalizer.SortOrder":                     1,
		"[sync.Mutex.Lock] top=sync.(*Mutex).Lock app=api-go/internal/catalog.(*Store).ActiveSnapshot": 2,
		"[select] top=database/sql.(*DB).conn app=api-go/internal/httpapi.(*Server).handleAppByID":     1,
	}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestMiddlewareLogsSlowRequestsAndStats(t *testing.T) {
	logs := captureLog(t)
	m := NewMonitor(Options{SlowRequest: 20 * time.Millisecond, MaxSlowLogsPerWindow: 1})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /fast", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("GET /slow/{id}", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(30 * time.Millisecond)
		w.WriteHeader(http.StatusBadGateway)
	})
	handler := m.Middleware(mux)

	for _, path := range []string{"/fast", "/slow/1?x=y", "/slow/2", "/missing"} {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}

	out := logs.String()
	if !strings.Contains(out, `slow request: GET /slow/1?x=y status=502`) {
		t.Fatalf("slow request not logged:\n%s", out)
	}
	if strings.Contains(out, "/slow/2") {
		t.Fatalf("slow log cap not applied:\n%s", out)
	}

	line := m.statsLine()
	for _, wantPart := range []string{"requests=4", "5xx=2", "4xx=1", "GET /slow/{id} n=2", "slow_logs_suppressed=1", "goroutines="} {
		if !strings.Contains(line, wantPart) {
			t.Fatalf("stats line missing %q:\n%s", wantPart, line)
		}
	}
	if next := m.statsLine(); !strings.HasPrefix(next, "stats: requests=0 |") {
		t.Fatalf("window not reset: %s", next)
	}
}

func TestCaptureWritesFilesAndRespectsCooldown(t *testing.T) {
	logs := captureLog(t)
	prevSamples, prevEvery := captureSamples, captureSampleEvery
	captureSamples, captureSampleEvery = 2, 10*time.Millisecond
	t.Cleanup(func() { captureSamples, captureSampleEvery = prevSamples, prevEvery })

	dir := t.TempDir()
	m := NewMonitor(Options{CaptureDir: dir, CaptureCooldown: time.Hour})
	m.TriggerCapture("test")
	m.TriggerCapture("ignored: cooldown")

	deadline := time.Now().Add(10 * time.Second)
	for m.capturing.Load() || !strings.Contains(logs.String(), "diagnostics: saved") {
		if time.Now().After(deadline) {
			t.Fatalf("capture did not finish:\n%s", logs.String())
		}
		time.Sleep(10 * time.Millisecond)
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("want 1 capture dir, got %d", len(entries))
	}
	captureDir := filepath.Join(dir, entries[0].Name())
	for _, name := range []string{"cpu.pprof", "goroutines.txt", "heap.pprof", "summary.json"} {
		if _, err := os.Stat(filepath.Join(captureDir, name)); err != nil {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	raw, _ := os.ReadFile(filepath.Join(captureDir, "summary.json"))
	var summary captureSummary
	if err := json.Unmarshal(raw, &summary); err != nil || summary.Reason != "test" {
		t.Fatalf("bad summary.json (%v): %s", err, raw)
	}
	if strings.Contains(logs.String(), "ignored: cooldown") {
		t.Fatal("second capture should have been skipped by the cooldown")
	}
}

func TestPruneCaptures(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"20260101T000000Z", "20260102T000000Z", "20260103T000000Z"} {
		os.Mkdir(filepath.Join(dir, name), 0o755)
	}
	pruneCaptures(dir, 2)
	entries, _ := os.ReadDir(dir)
	if len(entries) != 2 || entries[0].Name() != "20260102T000000Z" {
		t.Fatalf("unexpected entries after prune: %v", entries)
	}
}

func TestSystemSampleOnLinux(t *testing.T) {
	if _, err := os.Stat("/proc/self/stat"); err != nil {
		t.Skip("no /proc")
	}
	s := newSystemSampler()
	deadline := time.Now().Add(50 * time.Millisecond)
	for time.Now().Before(deadline) {
	}
	sample := s.Sample()
	if sample.RSSBytes == 0 || sample.Goroutines == 0 || sample.NumCPU == 0 {
		t.Fatalf("implausible sample: %+v", sample)
	}
	if !strings.Contains(sample.String(), "cpu_proc=") {
		t.Fatalf("bad render: %s", sample)
	}
}

// blockedHandler is a named function so it shows up as an app frame in stack dumps.
func blockedHandler(release <-chan struct{}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		<-release
	}
}

// Against a real runtime dump: a handler blocked mid-request is reported, idle
// keep-alive connections and diagnostics' own goroutines are not.
func TestSummarizeRealGoroutineDump(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(blockedHandler(release))
	defer srv.Close()
	defer close(release)

	done := make(chan struct{})
	go func() {
		defer close(done)
		resp, err := http.Get(srv.URL)
		if err == nil {
			resp.Body.Close()
		}
	}()

	deadline := time.Now().Add(5 * time.Second)
	for {
		summary := summarizeGoroutines(allGoroutineStacks())
		for key := range summary {
			if strings.HasPrefix(key, "[chan receive] top=github.com/iappstores/api-go/internal/diagnostics.blockedHandler") {
				return
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("blocked handler not in summary: %v", summary)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
