package downloads

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestProbeDownloadURLSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result := ProbeDownloadURL(context.Background(), server.Client(), server.URL, time.Second)
	if result.Status != ProbeSuccess {
		t.Errorf("status = %s, want success", result.Status)
	}
}

func TestProbeDownloadURLHardFailure404(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	result := ProbeDownloadURL(context.Background(), server.Client(), server.URL, time.Second)
	if result.Status != ProbeHardFailure {
		t.Errorf("status = %s, want hard_failure", result.Status)
	}
}

func TestProbeDownloadURLFallsBackToGetOnHeadFailure(t *testing.T) {
	var headCalled, getCalled bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			headCalled = true
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		getCalled = true
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result := ProbeDownloadURL(context.Background(), server.Client(), server.URL, time.Second)
	if !headCalled || !getCalled {
		t.Fatalf("expected both HEAD and GET to be tried: head=%v get=%v", headCalled, getCalled)
	}
	if result.Status != ProbeSuccess {
		t.Errorf("status = %s, want success from GET fallback", result.Status)
	}
}

func TestProbeDownloadURLPrefersHeadHardFailureOverGetInconclusive(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		// GET "succeeds" transport-wise but with a weird inconclusive status.
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	result := ProbeDownloadURL(context.Background(), server.Client(), server.URL, time.Second)
	if result.Status != ProbeHardFailure {
		t.Errorf("status = %s, want hard_failure (HEAD 404 preferred over GET 429)", result.Status)
	}
}

func TestProbeDownloadURLNetworkErrorIsInconclusive(t *testing.T) {
	result := ProbeDownloadURL(context.Background(), http.DefaultClient, "http://127.0.0.1:1", time.Second)
	if result.Status != ProbeInconclusive {
		t.Errorf("status = %s, want inconclusive on connection failure", result.Status)
	}
}
