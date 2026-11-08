// Server-side diagnostics for the web app: timing of calls to the API and a periodic
// stats line (API latency, event-loop lag, memory, load), so a slow page can be traced
// to the API, to this process, or to the machine from `docker logs` alone.
//
// State lives on globalThis because Next can bundle this module into several server
// chunks; every copy must record into the same window.

import os from "node:os";

const DEFAULT_SLOW_API_MS = 1000;
const DEFAULT_STATS_SECONDS = 60;
const LATENCY_SAMPLE_CAP = 2048;
const MAX_SLOW_LOGS_PER_WINDOW = 30;
const LAG_PROBE_MS = 500;

type ApiWindow = {
  calls: number;
  failures: number;
  slow: number;
  slowLogged: number;
  latencies: number[];
  seen: number;
  maxMs: number;
  maxPath: string;
};

type DiagnosticsState = {
  window: ApiWindow;
  maxLagMs: number;
  statsTimer?: ReturnType<typeof setInterval>;
  lagTimer?: ReturnType<typeof setInterval>;
};

const STATE_KEY = Symbol.for("iappstores.serverDiagnostics");
// lib/api.ts also runs in the browser, so it can't import this module (node:os); it
// calls the recorder registered here on globalThis instead, when there is one.
export const API_CALL_RECORDER_KEY = Symbol.for("iappstores.recordApiCall");

function newWindow(): ApiWindow {
  return { calls: 0, failures: 0, slow: 0, slowLogged: 0, latencies: [], seen: 0, maxMs: 0, maxPath: "" };
}

function state(): DiagnosticsState {
  const holder = globalThis as typeof globalThis & { [STATE_KEY]?: DiagnosticsState };
  holder[STATE_KEY] ??= { window: newWindow(), maxLagMs: 0 };
  return holder[STATE_KEY];
}

function positiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function slowApiThresholdMs(): number {
  return positiveNumberEnv("SLOW_API_MS", DEFAULT_SLOW_API_MS);
}

/** Records one server-side API call; logs it when slow or failed. */
export function recordApiCall(method: string, path: string, durationMs: number, status: number | "error"): void {
  const win = state().window;
  win.calls += 1;
  win.seen += 1;
  if (win.latencies.length < LATENCY_SAMPLE_CAP) {
    win.latencies.push(durationMs);
  } else {
    const slot = Math.floor(Math.random() * win.seen);
    if (slot < LATENCY_SAMPLE_CAP) win.latencies[slot] = durationMs;
  }
  if (durationMs > win.maxMs) {
    win.maxMs = durationMs;
    win.maxPath = `${method} ${path}`;
  }

  const failed = status === "error" || status >= 500;
  if (failed) win.failures += 1;
  const slow = durationMs >= slowApiThresholdMs();
  if (slow) win.slow += 1;

  if ((slow || failed) && win.slowLogged < MAX_SLOW_LOGS_PER_WINDOW) {
    win.slowLogged += 1;
    const label = slow ? "[slow-api]" : "[api-error]";
    console.warn(`${label} ${method} ${truncate(path, 300)} took=${Math.round(durationMs)}ms status=${status}`);
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor((sorted.length - 1) * p)];
}

function formatMiB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MiB`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

/** Closes the current window and renders it as one log line. */
export function takeStatsLine(): string {
  const current = state();
  const win = current.window;
  current.window = newWindow();
  const maxLagMs = current.maxLagMs;
  current.maxLagMs = 0;

  const parts = [`api_calls=${win.calls}`];
  if (win.calls > 0) {
    const sorted = [...win.latencies].sort((a, b) => a - b);
    parts.push(
      `failed=${win.failures}`,
      `slow=${win.slow}`,
      `p50=${Math.round(percentile(sorted, 0.5))}ms`,
      `p95=${Math.round(percentile(sorted, 0.95))}ms`,
      `max=${Math.round(win.maxMs)}ms`,
      `max_call="${truncate(win.maxPath, 120)}"`
    );
  }
  const memory = process.memoryUsage();
  const [load1, load5] = os.loadavg();
  parts.push(
    `event_loop_lag_max=${Math.round(maxLagMs)}ms`,
    `rss=${formatMiB(memory.rss)}`,
    `heap=${formatMiB(memory.heapUsed)}`,
    `load=${load1.toFixed(2)}/${load5.toFixed(2)}`,
    `ncpu=${os.cpus().length}`
  );
  return `[web-stats] ${parts.join(" ")}`;
}

/**
 * Registers the API call recorder and starts the event-loop lag probe and the periodic
 * stats line (once per process).
 * STATS_LOG_SECONDS sets the interval (default 60); STATS_LOG_DISABLED=true turns it off.
 */
export function startServerDiagnostics(): void {
  const current = state();
  (globalThis as Record<symbol, unknown>)[API_CALL_RECORDER_KEY] = recordApiCall;
  if (current.statsTimer || process.env.STATS_LOG_DISABLED === "true") return;

  // A timer that should fire every LAG_PROBE_MS fires late by however long the event
  // loop was blocked (a long render, a big JSON parse, GC).
  let expected = performance.now() + LAG_PROBE_MS;
  current.lagTimer = setInterval(() => {
    const now = performance.now();
    current.maxLagMs = Math.max(current.maxLagMs, now - expected);
    expected = now + LAG_PROBE_MS;
  }, LAG_PROBE_MS);

  const intervalMs = positiveNumberEnv("STATS_LOG_SECONDS", DEFAULT_STATS_SECONDS) * 1000;
  current.statsTimer = setInterval(() => console.log(takeStatsLine()), intervalMs);

  current.lagTimer.unref?.();
  current.statsTimer.unref?.();
}
