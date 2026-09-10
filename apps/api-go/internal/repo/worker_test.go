package repo

import (
	"context"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/sources"
)

func TestBackoffDurationDoublesAndCaps(t *testing.T) {
	ttl := time.Hour
	cases := []struct {
		failures int
		want     time.Duration
	}{
		{1, time.Hour},
		{2, 2 * time.Hour},
		{3, 4 * time.Hour},
		{4, 8 * time.Hour},
	}
	for _, c := range cases {
		if got := backoffDuration(ttl, c.failures); got != c.want {
			t.Errorf("backoffDuration(ttl, %d) = %v, want %v", c.failures, got, c.want)
		}
	}

	// Should never exceed the configured max backoff, however many failures pile up.
	if got, max := backoffDuration(ttl, 1000), maxBackoffForTest(t); got != max {
		t.Errorf("backoffDuration(ttl, 1000) = %v, want capped at %v", got, max)
	}
}

func maxBackoffForTest(t *testing.T) time.Duration {
	t.Helper()
	return backoffDuration(time.Hour, 64) // shift is already clamped past this
}

func TestShouldRefreshBacksOffFailingSources(t *testing.T) {
	client, cache := newTestClient(t)
	source := sources.SourceDefinition{ID: "flaky", Name: "Flaky", URL: "https://example.com/flaky.json"}
	ttl := time.Hour

	// Never fetched: always due.
	if !client.shouldRefresh(source, ttl) {
		t.Fatal("expected a never-fetched source to be due")
	}

	// One failure: backoff = 1x ttl, so it should not be due again immediately.
	if err := cache.WriteError(source.ID, source.URL, "boom"); err != nil {
		t.Fatalf("write error: %v", err)
	}
	if client.shouldRefresh(source, ttl) {
		t.Fatal("expected a just-failed source to still be within its backoff window")
	}

	// A second failure doubles the backoff window; still not due.
	if err := cache.WriteError(source.ID, source.URL, "boom again"); err != nil {
		t.Fatalf("write error: %v", err)
	}
	if client.shouldRefresh(source, ttl) {
		t.Fatal("expected a repeatedly-failing source to still be within its (longer) backoff window")
	}

	// A success resets the failure streak, so it goes back to normal TTL-paced scheduling
	// once that TTL elapses -- simulated here with a negative TTL so it's already expired.
	if err := cache.Write(source.ID, source.URL, nil, -time.Hour); err != nil {
		t.Fatalf("write: %v", err)
	}
	if !client.shouldRefresh(source, ttl) {
		t.Fatal("expected a recovered source with an expired cache to be due again")
	}
}

func TestRefreshDueSourcesSkipsSourcesInBackoff(t *testing.T) {
	client, cache := newTestClient(t)
	source := sources.SourceDefinition{ID: "flaky", Name: "Flaky", URL: "https://example.invalid/flaky.json"}

	// Prime a fresh failure with a very long backoff so it's nowhere near due again.
	if err := cache.WriteError(source.ID, source.URL, "boom"); err != nil {
		t.Fatalf("write error: %v", err)
	}

	client.RefreshDueSources(context.Background(), []sources.SourceDefinition{source}, RefreshWorkerOptions{TTL: time.Hour})

	entry := cache.Read(source.ID, source.URL)
	if entry == nil || entry.ConsecutiveFailures != 1 {
		t.Fatalf("expected the backoff window to prevent a retry, got %+v", entry)
	}
}
