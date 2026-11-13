// Command api is the entry point for the Go rewrite of apps/api: wires the shared
// *sql.DB, background workers (repo refresh, App Store lookup queue), and the HTTP
// router, then serves until an interrupt/TERM signal triggers a graceful shutdown.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/catalog"
	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
	"github.com/iappstores/api-go/internal/diagnostics"
	"github.com/iappstores/api-go/internal/downloads"
	"github.com/iappstores/api-go/internal/httpapi"
	"github.com/iappstores/api-go/internal/repo"
	"github.com/iappstores/api-go/internal/sources"
	"github.com/iappstores/api-go/internal/sponsors"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := dbconn.Open(config.RepoCacheDBPath())
	if err != nil {
		log.Fatalf("could not open database: %v", err)
	}
	defer db.Close()

	catalogStore := catalog.NewStore(db)
	// Warm the FTS5 index (and its one-time backfill) at boot, mirroring the original
	// isSearchIndexAvailable() call in index.ts's top-level setup.
	catalogStore.IsSearchIndexAvailable()

	repoCache := repo.NewCacheStore(db)
	repoClient := repo.NewClient(repoCache, func(sourceID string, apps []contracts.AppDto) {
		if err := catalogStore.SyncSourceCatalog(sourceID, apps, time.Now().UnixMilli()); err != nil {
			log.Printf("could not sync catalog for source %s: %v", sourceID, err)
		}
	})
	repoClient.OnSourceRefreshed(func(sourceID string) {
		// The old catalogMaterializer.ts debounced a full-catalog rebuild here; the new
		// architecture has no full-catalog rebuild to debounce (every request hydrates
		// only the rows it needs directly from SQLite), so there is nothing to do beyond
		// what SyncSourceCatalog (passed above as onSync) already persisted.
		_ = sourceID
	})

	appStoreCache := appstore.NewCacheStore(db)
	appStoreClient := appstore.NewClient(appStoreCache)

	analyticsStore := downloads.NewAnalyticsStore(db)

	repoClient.StartRefreshWorker(ctx, sources.Sources, repo.RefreshWorkerOptions{})

	server := httpapi.NewServer(catalogStore, repoClient, appStoreClient, analyticsStore, sources.Sources)
	// Paid homepage sponsor slots. Without a Dodo API key the slots are still listed,
	// but nothing can be bought.
	server.Sponsors = sponsors.NewStore(db)
	if key := config.DodoAPIKey(); key != "" {
		server.Dodo = sponsors.NewDodo(key, config.DodoLiveMode())
	}
	go server.RunSponsorSweeper(ctx)

	// Request timing, a per-minute stats line and incident captures, so a slow-response
	// alert can be explained from `docker logs` afterwards. See internal/diagnostics.
	monitor := diagnostics.NewMonitor(diagnostics.Options{
		SlowRequest:     config.SlowRequestThreshold(),
		CaptureRequest:  config.DiagnosticsCaptureThreshold(),
		CaptureInFlight: config.DiagnosticsInFlightThreshold(),
		CaptureCooldown: config.DiagnosticsCooldown(),
		CaptureDir:      config.DiagnosticsDir(),
		StatsInterval:   config.StatsLogInterval(),
	})
	go monitor.Run(ctx)
	startPprof(config.PprofAddr())

	addr := fmt.Sprintf(":%d", config.APIPort())
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           monitor.Middleware(server.Routes()),
		ReadHeaderTimeout: 10 * time.Second,
		// Bound slow or idle clients so they can't pin goroutines and sockets
		// indefinitely. WriteTimeout leaves headroom over the download probe
		// (HEAD+GET, a few seconds each) and cold catalog queries.
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("iappstores API listening on http://localhost%s", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

// startPprof serves net/http/pprof on its own listener when PPROF_ADDR is set. It is
// separate from the API port so the public /api rewrite can never reach it.
func startPprof(addr string) {
	if addr == "" {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	go func() {
		log.Printf("pprof listening on %s", addr)
		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Printf("pprof server stopped: %v", err)
		}
	}()
}

// healthcheck backs the Dockerfile HEALTHCHECK. The runtime image is distroless (no
// shell, curl or wget), so the binary probes its own /health endpoint instead.
func healthcheck() int {
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/health", config.APIPort()))
	if err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintln(os.Stderr, "healthcheck: status", resp.StatusCode)
		return 1
	}
	return 0
}
