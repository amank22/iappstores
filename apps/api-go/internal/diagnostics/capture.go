package diagnostics

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"runtime/pprof"
	"sort"
	"strings"
	"time"
)

// Sampling during a capture: captureSamples goroutine dumps, captureSampleEvery apart
// (about ten seconds, also the length of the CPU profile). Variables so tests can
// shorten them.
var (
	captureSamples     = 10
	captureSampleEvery = time.Second
)

const (
	captureKeep         = 10
	goroutineSummaryTop = 8
	appModulePrefix     = "github.com/iappstores/"
)

// TriggerCapture starts an incident capture in the background unless one is running
// or the last one was less than CaptureCooldown ago. It never blocks the caller.
func (m *Monitor) TriggerCapture(reason string) {
	now := time.Now()
	if last := m.lastCapture.Load(); last != 0 && now.Sub(time.Unix(0, last)) < m.opts.CaptureCooldown {
		return
	}
	if !m.capturing.CompareAndSwap(false, true) {
		return
	}
	m.lastCapture.Store(now.UnixNano())
	go func() {
		defer m.capturing.Store(false)
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("diagnostics: capture panicked: %v", rec)
			}
		}()
		m.capture(reason, now)
	}()
}

// captureSummary is written as summary.json next to the profiles.
type captureSummary struct {
	Reason       string           `json:"reason"`
	StartedAt    time.Time        `json:"startedAt"`
	InFlight     int64            `json:"inFlightAtStart"`
	System       SystemSample     `json:"system"`
	Goroutines   []goroutineGroup `json:"goroutines"`
	SlowRequests []SlowRequest    `json:"recentSlowRequests"`
	Files        []string         `json:"files"`
}

type goroutineGroup struct {
	Key          string  `json:"key"`
	AvgPerSample float64 `json:"avgPerSample"`
}

func (m *Monitor) capture(reason string, started time.Time) {
	inFlight := m.InFlight()
	log.Printf("diagnostics: capturing, reason: %s (inflight=%d goroutines=%d)", reason, inFlight, runtime.NumGoroutine())

	dir := ""
	if m.opts.CaptureDir != "" {
		dir = filepath.Join(m.opts.CaptureDir, started.UTC().Format("20060102T150405Z"))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			log.Printf("diagnostics: cannot create %s: %v (capture is log-only)", dir, err)
			dir = ""
		}
	}

	var files []string
	sampler := newSystemSampler()

	// CPU profile over the sampling window (fails harmlessly if a profile is already
	// running, e.g. from the PPROF_ADDR listener).
	var cpuFile *os.File
	if dir != "" {
		path := filepath.Join(dir, "cpu.pprof")
		if f, err := os.Create(path); err == nil {
			if err := pprof.StartCPUProfile(f); err == nil {
				cpuFile = f
				files = append(files, path)
			} else {
				f.Close()
				os.Remove(path)
				log.Printf("diagnostics: CPU profile not taken: %v", err)
			}
		}
	}

	// Where are goroutines while the incident is happening? Sample a few times, since a
	// single dump can catch an unlucky moment.
	counts := map[string]int{}
	var lastDump []byte
	for i := 0; i < captureSamples; i++ {
		lastDump = allGoroutineStacks()
		for key, n := range summarizeGoroutines(lastDump) {
			counts[key] += n
		}
		if i < captureSamples-1 {
			time.Sleep(captureSampleEvery)
		}
	}

	if cpuFile != nil {
		pprof.StopCPUProfile()
		cpuFile.Close()
	}
	system := sampler.Sample()

	groups := make([]goroutineGroup, 0, len(counts))
	for key, n := range counts {
		groups = append(groups, goroutineGroup{Key: key, AvgPerSample: round1(float64(n) / float64(captureSamples))})
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].AvgPerSample != groups[j].AvgPerSample {
			return groups[i].AvgPerSample > groups[j].AvgPerSample
		}
		return groups[i].Key < groups[j].Key
	})

	if dir != "" {
		if path, err := writeFile(dir, "goroutines.txt", lastDump); err == nil {
			files = append(files, path)
		}
		if f, err := os.Create(filepath.Join(dir, "heap.pprof")); err == nil {
			if pprof.Lookup("heap").WriteTo(f, 0) == nil {
				files = append(files, f.Name())
			}
			f.Close()
		}
		summary := captureSummary{
			Reason: reason, StartedAt: started, InFlight: inFlight, System: system,
			Goroutines: groups, SlowRequests: m.recentSlowRequests(), Files: files,
		}
		if raw, err := json.MarshalIndent(summary, "", "  "); err == nil {
			if path, err := writeFile(dir, "summary.json", raw); err == nil {
				files = append(files, path)
			}
		}
		pruneCaptures(m.opts.CaptureDir, captureKeep)
	}

	log.Printf("diagnostics: during capture: %s", system)
	top := groups
	if len(top) > goroutineSummaryTop {
		top = top[:goroutineSummaryTop]
	}
	if len(top) == 0 {
		log.Printf("diagnostics: no busy or blocked app goroutines seen")
	}
	for _, g := range top {
		log.Printf("diagnostics: goroutines avg=%.1f %s", g.AvgPerSample, g.Key)
	}
	if dir != "" {
		log.Printf("diagnostics: saved %s", strings.Join(files, ", "))
	}
}

func allGoroutineStacks() []byte {
	buf := make([]byte, 1<<20)
	for {
		n := runtime.Stack(buf, true)
		if n < len(buf) || len(buf) >= 64<<20 {
			return buf[:n]
		}
		buf = make([]byte, len(buf)*2)
	}
}

// idleStates are goroutine states that mean "waiting for work"; goroutines in them are
// only interesting while serving a request (e.g. a handler waiting on a channel or on
// a database connection), not as background loops parked between runs.
var idleStates = map[string]bool{
	"IO wait": true, "chan receive": true, "chan send": true, "select": true,
	"select (no cases)": true, "sleep": true, "syscall": true, "sync.Cond.Wait": true,
}

// summarizeGoroutines groups the goroutines of a runtime.Stack(all) dump by state, top
// frame and innermost app frame, e.g.
// "[sync.Mutex.Lock] top=sync.(*Mutex).Lock app=github.com/iappstores/.../normalizer.DefaultCompare".
// Busy (running, runnable, lock-waiting) goroutines are always counted; idle ones only
// when they belong to an in-flight HTTP request. Diagnostics' own goroutines and the
// profiler are left out.
func summarizeGoroutines(dump []byte) map[string]int {
	out := map[string]int{}
	for _, block := range strings.Split(string(dump), "\n\n") {
		lines := strings.Split(strings.TrimSpace(block), "\n")
		if len(lines) < 2 || !strings.HasPrefix(lines[0], "goroutine ") {
			continue
		}
		state := lines[0]
		if open := strings.IndexByte(state, '['); open >= 0 {
			state = state[open+1:]
			if end := strings.IndexAny(state, ",]"); end >= 0 {
				state = state[:end]
			}
		}
		var top, app string
		skip, inRequest := false, false
		for _, line := range lines[1:] {
			if strings.HasPrefix(line, "\t") || strings.HasPrefix(line, "created by ") {
				continue
			}
			fn := trimArgs(line)
			if strings.Contains(fn, "/internal/diagnostics.(*Monitor).capture") ||
				strings.Contains(fn, "/internal/diagnostics.(*Monitor).Run") ||
				strings.HasPrefix(fn, "runtime/pprof.") {
				skip = true
				break
			}
			if fn == "net/http.serverHandler.ServeHTTP" {
				inRequest = true
			}
			if top == "" {
				top = fn
			}
			if app == "" && strings.HasPrefix(fn, appModulePrefix) {
				app = strings.TrimPrefix(fn, appModulePrefix)
			}
		}
		if skip || (idleStates[state] && !inRequest) {
			continue
		}
		key := fmt.Sprintf("[%s] top=%s", state, top)
		if app != "" && app != strings.TrimPrefix(top, appModulePrefix) {
			key += " app=" + app
		}
		out[key]++
	}
	return out
}

func trimArgs(frame string) string {
	if strings.HasSuffix(frame, ")") {
		if i := strings.LastIndexByte(frame, '('); i > 0 {
			return frame[:i]
		}
	}
	return frame
}

func writeFile(dir, name string, data []byte) (string, error) {
	path := filepath.Join(dir, name)
	return path, os.WriteFile(path, data, 0o644)
}

// pruneCaptures keeps the newest keep capture directories (their names sort by time).
func pruneCaptures(root string, keep int) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e.Name())
		}
	}
	sort.Strings(dirs)
	for len(dirs) > keep {
		os.RemoveAll(filepath.Join(root, dirs[0]))
		dirs = dirs[1:]
	}
}
