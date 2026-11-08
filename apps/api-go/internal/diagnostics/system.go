// Package diagnostics records what the API and the machine under it were doing, so a
// slow-response alert can be explained from the logs afterwards: request latency and
// concurrency, process and host CPU (including steal time on a shared VM), container
// CPU throttling, memory, goroutines and GC, plus on-demand incident captures
// (goroutine summaries in the log, CPU profile and goroutine dump on disk).
package diagnostics

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// clockTicks is USER_HZ, the unit of /proc/<pid>/stat CPU times. It is 100 on every
// mainstream Linux build; Go can't read sysconf(_SC_CLK_TCK) without cgo.
const clockTicks = 100

// cpuCounters is one reading of the cumulative counters the sampler turns into rates.
type cpuCounters struct {
	at time.Time

	procTicks uint64 // process utime+stime, in clock ticks

	hostTotal uint64 // /proc/stat "cpu" line: all jiffies
	hostIdle  uint64 // idle + iowait
	hostSteal uint64
	hostIO    uint64

	throttledPeriods uint64 // cgroup v2 cpu.stat nr_throttled
	throttledUsec    uint64 // cgroup v2 cpu.stat throttled_usec

	numGC        uint32
	pauseTotalNs uint64
}

// SystemSample is a point-in-time view of the process and host, with rates computed
// against the previous sample.
type SystemSample struct {
	At time.Time `json:"at"`

	ProcessCPUPercent float64 `json:"processCpuPercent"` // of one core; 200 = two full cores
	HostCPUPercent    float64 `json:"hostCpuPercent"`    // busy share of all host cores
	HostStealPercent  float64 `json:"hostStealPercent"`  // time the hypervisor gave our vCPUs to someone else
	HostIOWaitPercent float64 `json:"hostIowaitPercent"`
	Load1             float64 `json:"load1"`
	Load5             float64 `json:"load5"`
	NumCPU            int     `json:"numCpu"`
	CPULimit          string  `json:"cpuLimit"` // cgroup cpu.max, e.g. "max 100000"

	ThrottledPeriods uint64  `json:"throttledPeriods"`
	ThrottledSeconds float64 `json:"throttledSeconds"`

	RSSBytes          uint64  `json:"rssBytes"`
	CgroupMemoryBytes uint64  `json:"cgroupMemoryBytes"`
	CgroupMemoryLimit string  `json:"cgroupMemoryLimit"`
	HeapAllocBytes    uint64  `json:"heapAllocBytes"`
	HeapSysBytes      uint64  `json:"heapSysBytes"`
	Goroutines        int     `json:"goroutines"`
	GCCycles          uint32  `json:"gcCycles"`
	GCPauseMs         float64 `json:"gcPauseMs"`
}

// systemSampler keeps the previous counters so each Sample reports rates since the last.
type systemSampler struct {
	prev cpuCounters
}

func newSystemSampler() *systemSampler {
	return &systemSampler{prev: readCounters()}
}

func (s *systemSampler) Sample() SystemSample {
	cur := readCounters()
	prev := s.prev
	s.prev = cur

	out := SystemSample{At: cur.at, NumCPU: runtime.NumCPU(), Goroutines: runtime.NumGoroutine()}

	if elapsed := cur.at.Sub(prev.at).Seconds(); elapsed > 0 && cur.procTicks >= prev.procTicks {
		out.ProcessCPUPercent = round1(float64(cur.procTicks-prev.procTicks) / clockTicks / elapsed * 100)
	}
	if total := sub(cur.hostTotal, prev.hostTotal); total > 0 {
		idle := sub(cur.hostIdle, prev.hostIdle)
		out.HostCPUPercent = round1(float64(total-min(idle, total)) / float64(total) * 100)
		out.HostStealPercent = round1(float64(sub(cur.hostSteal, prev.hostSteal)) / float64(total) * 100)
		out.HostIOWaitPercent = round1(float64(sub(cur.hostIO, prev.hostIO)) / float64(total) * 100)
	}
	out.ThrottledPeriods = sub(cur.throttledPeriods, prev.throttledPeriods)
	out.ThrottledSeconds = round1(float64(sub(cur.throttledUsec, prev.throttledUsec)) / 1e6)
	out.GCCycles = cur.numGC - prev.numGC
	out.GCPauseMs = round1(float64(sub(cur.pauseTotalNs, prev.pauseTotalNs)) / 1e6)

	out.Load1, out.Load5 = readLoadAvg()
	out.CPULimit = readTrimmed("/sys/fs/cgroup/cpu.max")
	out.RSSBytes = readRSS()
	out.CgroupMemoryBytes, _ = strconv.ParseUint(readTrimmed("/sys/fs/cgroup/memory.current"), 10, 64)
	out.CgroupMemoryLimit = readTrimmed("/sys/fs/cgroup/memory.max")

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	out.HeapAllocBytes = mem.HeapAlloc
	out.HeapSysBytes = mem.HeapSys
	return out
}

func readCounters() cpuCounters {
	c := cpuCounters{at: time.Now()}
	c.procTicks = readProcessTicks()
	c.hostTotal, c.hostIdle, c.hostSteal, c.hostIO = readHostCPU()
	c.throttledPeriods, c.throttledUsec = readCgroupThrottling()
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	c.numGC = mem.NumGC
	c.pauseTotalNs = mem.PauseTotalNs
	return c
}

// readProcessTicks returns utime+stime of this process from /proc/self/stat.
func readProcessTicks() uint64 {
	raw, err := os.ReadFile("/proc/self/stat")
	if err != nil {
		return 0
	}
	// The command name (field 2) may contain spaces; fields after it start past ")".
	s := string(raw)
	end := strings.LastIndexByte(s, ')')
	if end < 0 {
		return 0
	}
	fields := strings.Fields(s[end+1:])
	// fields[0] is field 3 (state); utime and stime are fields 14 and 15.
	if len(fields) < 13 {
		return 0
	}
	utime, _ := strconv.ParseUint(fields[11], 10, 64)
	stime, _ := strconv.ParseUint(fields[12], 10, 64)
	return utime + stime
}

// readHostCPU parses the aggregate "cpu" line of /proc/stat. Containers see the host's
// counters, which is the point: it shows whether the whole machine was busy.
func readHostCPU() (total, idle, steal, iowait uint64) {
	raw, err := os.ReadFile("/proc/stat")
	if err != nil {
		return
	}
	line, _, _ := strings.Cut(string(raw), "\n")
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return
	}
	values := make([]uint64, 0, len(fields)-1)
	for _, f := range fields[1:] {
		v, _ := strconv.ParseUint(f, 10, 64)
		values = append(values, v)
	}
	// user nice system idle iowait irq softirq steal guest guest_nice; guest time is
	// already counted in user/nice, so only the first eight add up to the total.
	for i, v := range values {
		if i < 8 {
			total += v
		}
	}
	idle = values[3]
	if len(values) > 4 {
		iowait = values[4]
		idle += iowait
	}
	if len(values) > 7 {
		steal = values[7]
	}
	return
}

func readCgroupThrottling() (periods, usec uint64) {
	raw, err := os.ReadFile("/sys/fs/cgroup/cpu.stat")
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(raw), "\n") {
		key, value, ok := strings.Cut(line, " ")
		if !ok {
			continue
		}
		n, _ := strconv.ParseUint(strings.TrimSpace(value), 10, 64)
		switch key {
		case "nr_throttled":
			periods = n
		case "throttled_usec":
			usec = n
		}
	}
	return
}

func readLoadAvg() (float64, float64) {
	fields := strings.Fields(readTrimmed("/proc/loadavg"))
	if len(fields) < 2 {
		return 0, 0
	}
	l1, _ := strconv.ParseFloat(fields[0], 64)
	l5, _ := strconv.ParseFloat(fields[1], 64)
	return l1, l5
}

func readRSS() uint64 {
	fields := strings.Fields(readTrimmed("/proc/self/statm"))
	if len(fields) < 2 {
		return 0
	}
	pages, _ := strconv.ParseUint(fields[1], 10, 64)
	return pages * uint64(os.Getpagesize())
}

func readTrimmed(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func sub(cur, prev uint64) uint64 {
	if cur < prev {
		return 0
	}
	return cur - prev
}

func round1(v float64) float64 {
	return float64(int64(v*10+0.5)) / 10
}

func formatBytes(n uint64) string {
	switch {
	case n >= 1<<30:
		return fmt.Sprintf("%.2fGiB", float64(n)/(1<<30))
	case n >= 1<<20:
		return fmt.Sprintf("%.0fMiB", float64(n)/(1<<20))
	default:
		return fmt.Sprintf("%dKiB", n>>10)
	}
}

// String renders the sample as one compact log fragment.
func (s SystemSample) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "cpu_proc=%.0f%% host_cpu=%.0f%% steal=%.1f%% iowait=%.1f%% load=%.2f/%.2f ncpu=%d",
		s.ProcessCPUPercent, s.HostCPUPercent, s.HostStealPercent, s.HostIOWaitPercent, s.Load1, s.Load5, s.NumCPU)
	if s.ThrottledPeriods > 0 {
		fmt.Fprintf(&b, " throttled=%dx/%.1fs", s.ThrottledPeriods, s.ThrottledSeconds)
	}
	fmt.Fprintf(&b, " rss=%s heap=%s goroutines=%d gc=%d gc_pause=%.0fms",
		formatBytes(s.RSSBytes), formatBytes(s.HeapAllocBytes), s.Goroutines, s.GCCycles, s.GCPauseMs)
	if s.CgroupMemoryBytes > 0 {
		fmt.Fprintf(&b, " cgroup_mem=%s/%s", formatBytes(s.CgroupMemoryBytes), s.CgroupMemoryLimit)
	}
	return b.String()
}
