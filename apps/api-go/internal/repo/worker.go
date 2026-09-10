package repo

import (
	"context"
	"log"
	"math/rand"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/sources"
)

// RefreshWorkerOptions mirrors repoRefreshWorker.ts's RefreshWorkerOptions.
type RefreshWorkerOptions struct {
	TTL         time.Duration
	Concurrency int
	Jitter      time.Duration
}

func resolveOptions(opts RefreshWorkerOptions) RefreshWorkerOptions {
	if opts.TTL <= 0 {
		opts.TTL = config.RepoCacheTTL()
	}
	if opts.Concurrency <= 0 {
		opts.Concurrency = config.RepoRefreshConcurrency()
	}
	if opts.Jitter <= 0 {
		opts.Jitter = config.RepoRefreshJitter()
	}
	return opts
}

func (c *Client) shouldRefresh(source sources.SourceDefinition) bool {
	cache := c.cache.Read(source.ID, source.URL)
	return cache == nil || cache.IsExpired
}

// RefreshDueSources mirrors refreshDueSources(): refreshes every source whose cache is
// missing or expired, bounded to `opts.Concurrency` concurrent in-flight fetches via
// errgroup.SetLimit -- the Go equivalent of the JS mapWithConcurrency helper, but built on
// a real goroutine pool since this runs under a `-race` build unlike the single-threaded
// original.
func (c *Client) RefreshDueSources(ctx context.Context, allSources []sources.SourceDefinition, opts RefreshWorkerOptions) {
	opts = resolveOptions(opts)

	var due []sources.SourceDefinition
	for _, s := range allSources {
		if c.shouldRefresh(s) {
			due = append(due, s)
		}
	}
	if len(due) == 0 {
		return
	}

	log.Printf("Refreshing %d source cache entries...", len(due))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(opts.Concurrency)
	for _, s := range due {
		s := s
		g.Go(func() error {
			if _, err := c.RefreshSourceApps(gctx, s, opts.TTL); err != nil {
				log.Printf("Could not refresh source cache %s: %v", s.ID, err)
			} else {
				log.Printf("Refreshed source cache: %s", s.ID)
			}
			return nil
		})
	}
	_ = g.Wait()
}

// StartRefreshWorker mirrors startRepoRefreshWorker(): an initial refresh pass, then a
// self-rescheduling timer with random jitter, run as a goroutine until ctx is canceled.
func (c *Client) StartRefreshWorker(ctx context.Context, allSources []sources.SourceDefinition, opts RefreshWorkerOptions) {
	if config.RepoRefreshDisabled() {
		return
	}
	opts = resolveOptions(opts)

	go func() {
		c.RefreshDueSources(ctx, allSources, opts)
		for {
			jitter := time.Duration(rand.Int63n(int64(opts.Jitter) + 1))
			select {
			case <-ctx.Done():
				return
			case <-time.After(opts.TTL + jitter):
				c.RefreshDueSources(ctx, allSources, opts)
			}
		}
	}()
}
