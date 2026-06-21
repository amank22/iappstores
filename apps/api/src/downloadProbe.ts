import type { DownloadProbeStatus } from "./downloadAnalyticsStore.js";

export type DownloadProbeResult = {
  status: DownloadProbeStatus;
  statusCode: number | null;
  error: string | null;
};

type Fetcher = typeof fetch;

const HARD_FAILURE_STATUSES = new Set([404, 410]);

function classifyStatus(statusCode: number): DownloadProbeResult {
  if (statusCode >= 200 && statusCode < 400) {
    return {
      status: "success",
      statusCode,
      error: null
    };
  }

  if (HARD_FAILURE_STATUSES.has(statusCode)) {
    return {
      status: "hard_failure",
      statusCode,
      error: `Download URL returned HTTP ${statusCode}.`
    };
  }

  return {
    status: "inconclusive",
    statusCode,
    error: `Download URL returned HTTP ${statusCode}.`
  };
}

function shouldTryGetAfterHead(result: DownloadProbeResult): boolean {
  return result.status !== "success";
}

function normalizeProbeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "Probe timed out." : error.message;
  }

  return String(error);
}

async function fetchForProbe(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
  fetcher: Fetcher
): Promise<DownloadProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: method === "GET" ? { range: "bytes=0-0" } : undefined
    });

    await response.body?.cancel();
    return classifyStatus(response.status);
  } catch (error) {
    return {
      status: "inconclusive",
      statusCode: null,
      error: normalizeProbeError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeDownloadUrl(
  url: string,
  timeoutMs = 2_500,
  fetcher: Fetcher = fetch
): Promise<DownloadProbeResult> {
  const headResult = await fetchForProbe(url, "HEAD", timeoutMs, fetcher);
  if (!shouldTryGetAfterHead(headResult)) {
    return headResult;
  }

  const getResult = await fetchForProbe(url, "GET", timeoutMs, fetcher);
  if (getResult.status === "inconclusive" && headResult.status === "hard_failure") {
    return headResult;
  }

  return getResult;
}
