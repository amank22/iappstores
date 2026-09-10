// Command api is the entry point for the Go rewrite of apps/api: wires the shared
// *sql.DB, background workers (repo refresh, App Store lookup queue), and the HTTP
// router, then serves until an interrupt/TERM signal triggers a graceful shutdown.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/iappstores/api-go/internal/appstore"
	"github.com/iappstores/api-go/internal/catalog"
	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/dbconn"
	"github.com/iappstores/api-go/internal/downloads"
	"github.com/iappstores/api-go/internal/httpapi"
	"github.com/iappstores/api-go/internal/repo"
	"github.com/iappstores/api-go/internal/sources"
)

func main() {
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

	addr := fmt.Sprintf(":%d", config.APIPort())
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
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
