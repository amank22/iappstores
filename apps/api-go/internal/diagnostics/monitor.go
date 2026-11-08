package diagnostics

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Options configures a Monitor. Zero values disable the corresponding feature.
type Options struct {
	SlowRequest          time.Duration // log requests slower than this
	CaptureRequest       time.Duration // capture diagnostics for requests slower than this
	CaptureInFlight      int           // capture diagnostics when this many requests run at once
	CaptureCooldown      time.Duration // minimum time between captures
	CaptureDir           string        // where captures are written; empty keeps them log-only
	StatsInterval        time.Duration // how often to log a stats line
	MaxSlowLogsPerWindow int           // cap on slow-request log lines per stats window
}

const (
	latencySampleCap = 4096
	recentSlowCap    = 50
	topRoutes        = 3
)

// SlowRequest is one logged slow request, kept for incident captures.
type SlowRequest struct {
	At         time.Time `json:"at"`
	Method     string    `json:"method"`
	URI        string    `json:"uri"`
	Status     int       `json:"status"`
	DurationMs int64     `json:"durationMs"`
	InFlight   int64     `json:"inFlight"`
	UserAgent  string    `json:"userAgent"`
}

type routeStats struct {
	count int
	total time.Duration
	max   time.Duration
}

// window accumulates request stats between two stats lines.
type window struct {
	requests     int
	serverErrors int
	clientErrors int
	latencies    []time.Duration // reservoir sample
	seen         int
	max          time.Duration
	maxURI       string
	maxInFlight  int64
	routes       map[string]*routeStats
	slowLogged   int
	slowDropped  int
}

func newWindow() *window {
	return &window{routes: map[string]*routeStats{}}
}

// Monitor is HTTP middleware plus a background stats logger and incident capturer.
type Monitor struct {
	opts    Options
	sampler *systemSampler

	inFlight atomic.Int64

	mu         sync.Mutex
	win        *window
	recentSlow []SlowRequest
	rng        *rand.Rand

	capturing   atomic.Bool
	lastCapture atomic.Int64 // unix nanos
}

func NewMonitor(opts Options) *Monitor {
	if opts.MaxSlowLogsPerWindow <= 0 {
		opts.MaxSlowLogsPerWindow = 30
	}
	return &Monitor{
		opts:    opts,
		sampler: newSystemSampler(),
		win:     newWindow(),
		rng:     rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// statusRecorder captures the status code and body size a handler wrote.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	if r.status == 0 {
		r.status = code
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(p []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(p)
	r.bytes += n
	return n, err
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// Middleware times every request. It must wrap the ServeMux directly (or the handler
// chain containing it) so r.Pattern is set by the time the handler returns.
func (m *Monitor) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inFlight := m.inFlight.Add(1)
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		defer func() {
			m.inFlight.Add(-1)
			m.observe(r, rec, time.Since(start), inFlight)
		}()
		if m.opts.CaptureInFlight > 0 && inFlight >= int64(m.opts.CaptureInFlight) {
			m.TriggerCapture(fmt.Sprintf("%d requests in flight", inFlight))
		}
		next.ServeHTTP(rec, r)
	})
}

func routeKey(r *http.Request) string {
	if r.Pattern != "" {
		return r.Pattern
	}
	return r.Method + " (unmatched)"
}

func (m *Monitor) observe(r *http.Request, rec *statusRecorder, took time.Duration, inFlight int64) {
	status := rec.status
	if status == 0 {
		status = http.StatusOK
	}
	route := routeKey(r)
	slow := m.opts.SlowRequest > 0 && took >= m.opts.SlowRequest
	logSlow := false

	m.mu.Lock()
	win := m.win
	win.requests++
	switch {
	case status >= 500:
		win.serverErrors++
	case status >= 400:
		win.clientErrors++
	}
	win.seen++
	if len(win.latencies) < latencySampleCap {
		win.latencies = append(win.latencies, took)
	} else if j := m.rng.Intn(win.seen); j < latencySampleCap {
		win.latencies[j] = took
	}
	if took > win.max {
		win.max = took
		win.maxURI = r.Method + " " + r.URL.RequestURI()
	}
	if inFlight > win.maxInFlight {
		win.maxInFlight = inFlight
	}
	rs := win.routes[route]
	if rs == nil {
		rs = &routeStats{}
		win.routes[route] = rs
	}
	rs.count++
	rs.total += took
	if took > rs.max {
		rs.max = took
	}
	if slow {
		entry := SlowRequest{
			At: time.Now(), Method: r.Method, URI: truncate(r.URL.RequestURI(), 300), Status: status,
			DurationMs: took.Milliseconds(), InFlight: inFlight, UserAgent: truncate(r.UserAgent(), 160),
		}
		m.recentSlow = append(m.recentSlow, entry)
		if len(m.recentSlow) > recentSlowCap {
			m.recentSlow = m.recentSlow[len(m.recentSlow)-recentSlowCap:]
		}
		if win.slowLogged < m.opts.MaxSlowLogsPerWindow {
			win.slowLogged++
			logSlow = true
		} else {
			win.slowDropped++
		}
	}
	m.mu.Unlock()

	if logSlow {
		log.Printf("slow request: %s %s status=%d took=%s bytes=%d inflight=%d ua=%q",
			r.Method, truncate(r.URL.RequestURI(), 300), status, took.Round(time.Millisecond), rec.bytes, inFlight, truncate(r.UserAgent(), 160))
	}
	if m.opts.CaptureRequest > 0 && took >= m.opts.CaptureRequest {
		m.TriggerCapture(fmt.Sprintf("%s %s took %s", r.Method, truncate(r.URL.RequestURI(), 200), took.Round(time.Millisecond)))
	}
}

// Run logs a stats line every StatsInterval until ctx is done.
func (m *Monitor) Run(ctx context.Context) {
	if m.opts.StatsInterval <= 0 {
		return
	}
	ticker := time.NewTicker(m.opts.StatsInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			log.Print(m.statsLine())
		}
	}
}

// statsLine closes the current window and renders it with a fresh system sample.
func (m *Monitor) statsLine() string {
	m.mu.Lock()
	win := m.win
	m.win = newWindow()
	m.mu.Unlock()

	sample := m.sampler.Sample()
	return "stats: " + win.String() + " | " + sample.String()
}

func (w *window) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "requests=%d", w.requests)
	if w.requests == 0 {
		return b.String()
	}
	fmt.Fprintf(&b, " 5xx=%d 4xx=%d", w.serverErrors, w.clientErrors)
	lat := append([]time.Duration(nil), w.latencies...)
	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	fmt.Fprintf(&b, " p50=%s p95=%s p99=%s max=%s",
		ms(percentile(lat, 0.50)), ms(percentile(lat, 0.95)), ms(percentile(lat, 0.99)), ms(w.max))
	fmt.Fprintf(&b, " max_req=%q inflight_max=%d", truncate(w.maxURI, 120), w.maxInFlight)

	type namedRoute struct {
		name string
		*routeStats
	}
	routes := make([]namedRoute, 0, len(w.routes))
	for name, rs := range w.routes {
		routes = append(routes, namedRoute{name, rs})
	}
	sort.Slice(routes, func(i, j int) bool { return routes[i].total > routes[j].total })
	if len(routes) > topRoutes {
		routes = routes[:topRoutes]
	}
	parts := make([]string, 0, len(routes))
	for _, r := range routes {
		parts = append(parts, fmt.Sprintf("%s n=%d avg=%s max=%s", r.name, r.count, ms(r.total/time.Duration(r.count)), ms(r.max)))
	}
	fmt.Fprintf(&b, " top=[%s]", strings.Join(parts, "; "))
	if w.slowDropped > 0 {
		fmt.Fprintf(&b, " slow_logs_suppressed=%d", w.slowDropped)
	}
	return b.String()
}

func percentile(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	i := int(float64(len(sorted)-1) * p)
	return sorted[i]
}

func ms(d time.Duration) string {
	return fmt.Sprintf("%dms", d.Milliseconds())
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// InFlight reports the number of requests currently being served.
func (m *Monitor) InFlight() int64 { return m.inFlight.Load() }

func (m *Monitor) recentSlowRequests() []SlowRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]SlowRequest(nil), m.recentSlow...)
}
