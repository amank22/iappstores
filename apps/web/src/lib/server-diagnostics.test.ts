import { afterEach, describe, expect, it, vi } from "vitest";
import { API_CALL_RECORDER_KEY, recordApiCall, startServerDiagnostics, takeStatsLine } from "./server-diagnostics";

afterEach(() => {
  vi.restoreAllMocks();
  takeStatsLine();
});

describe("server diagnostics", () => {
  it("logs slow and failed API calls and summarizes the window", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordApiCall("GET", "/api/apps?page=1", 20, 200);
    recordApiCall("GET", "/api/apps?page=2", 1500, 200);
    recordApiCall("GET", "/api/sources", 40, 502);
    recordApiCall("GET", "/api/search?q=x", 30, "error");

    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      "[slow-api] GET /api/apps?page=2 took=1500ms status=200",
      "[api-error] GET /api/sources took=40ms status=502",
      "[api-error] GET /api/search?q=x took=30ms status=error"
    ]);

    const line = takeStatsLine();
    expect(line).toMatch(/^\[web-stats\] api_calls=4 failed=2 slow=1 p50=30ms p95=\d+ms max=1500ms max_call="GET \/api\/apps\?page=2"/);
    expect(line).toMatch(/event_loop_lag_max=\d+ms rss=\d+MiB heap=\d+MiB load=[\d.]+\/[\d.]+ ncpu=\d+/);
    expect(takeStatsLine()).toMatch(/^\[web-stats\] api_calls=0 event_loop_lag_max/);
  });

  it("registers the recorder lib/api.ts looks up", () => {
    vi.stubEnv("STATS_LOG_DISABLED", "true");
    startServerDiagnostics();
    expect((globalThis as Record<symbol, unknown>)[API_CALL_RECORDER_KEY]).toBe(recordApiCall);
    expect(API_CALL_RECORDER_KEY).toBe(Symbol.for("iappstores.recordApiCall"));
    vi.unstubAllEnvs();
  });
});
