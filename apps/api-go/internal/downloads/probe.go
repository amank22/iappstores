// Package downloads ports downloadProbe.ts, downloadService.ts and
// downloadAnalyticsStore.ts: probing a source's download URL before redirecting to it,
// and recording/reading download analytics.
package downloads

import (
	"context"
	"net/http"
	"strconv"
	"time"
)

type ProbeStatus string

const (
	ProbeSuccess      ProbeStatus = "success"
	ProbeHardFailure  ProbeStatus = "hard_failure"
	ProbeInconclusive ProbeStatus = "inconclusive"
)

type ProbeResult struct {
	Status     ProbeStatus
	StatusCode *int
	Error      *string
}

var hardFailureStatuses = map[int]bool{404: true, 410: true}

func classifyStatus(statusCode int) ProbeResult {
	if statusCode >= 200 && statusCode < 400 {
		return ProbeResult{Status: ProbeSuccess, StatusCode: &statusCode}
	}
	msg := httpStatusMessage(statusCode)
	if hardFailureStatuses[statusCode] {
		return ProbeResult{Status: ProbeHardFailure, StatusCode: &statusCode, Error: &msg}
	}
	return ProbeResult{Status: ProbeInconclusive, StatusCode: &statusCode, Error: &msg}
}

func httpStatusMessage(code int) string {
	return "Download URL returned HTTP " + strconv.Itoa(code) + "."
}

func shouldTryGetAfterHead(result ProbeResult) bool {
	return result.Status != ProbeSuccess
}

func normalizeProbeError(err error) string {
	if err == context.DeadlineExceeded {
		return "Probe timed out."
	}
	return err.Error()
}

func fetchForProbe(ctx context.Context, client *http.Client, rawURL, method string, timeout time.Duration) ProbeResult {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
	if err != nil {
		msg := err.Error()
		return ProbeResult{Status: ProbeInconclusive, Error: &msg}
	}
	if method == http.MethodGet {
		req.Header.Set("range", "bytes=0-0")
	}

	resp, err := client.Do(req)
	if err != nil {
		msg := normalizeProbeError(err)
		if ctx.Err() == context.DeadlineExceeded {
			msg = "Probe timed out."
		}
		return ProbeResult{Status: ProbeInconclusive, Error: &msg}
	}
	defer resp.Body.Close()

	return classifyStatus(resp.StatusCode)
}

// ProbeDownloadURL mirrors probeDownloadUrl(): HEAD first, GET as a fallback whenever
// HEAD wasn't a clean success, preferring a HEAD "hard_failure" over a GET
// "inconclusive" result (some servers reject HEAD outright but that shouldn't mask a
// real 404/410 hard failure).
func ProbeDownloadURL(ctx context.Context, client *http.Client, url string, timeout time.Duration) ProbeResult {
	if client == nil {
		client = http.DefaultClient
	}
	headResult := fetchForProbe(ctx, client, url, http.MethodHead, timeout)
	if !shouldTryGetAfterHead(headResult) {
		return headResult
	}

	getResult := fetchForProbe(ctx, client, url, http.MethodGet, timeout)
	if getResult.Status == ProbeInconclusive && headResult.Status == ProbeHardFailure {
		return headResult
	}
	return getResult
}
