package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Determine static path. Prefer "web/dist" if running from root.
	// The user mentiond "../web/dist", which might imply running from a subdirectory.
	// We'll fallback to that if web/dist doesn't exist, just in case.
	staticDir := "web/dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		// Try ../web/dist
		if _, err := os.Stat("../web/dist"); err == nil {
			staticDir = "../web/dist"
		}
	}
	
	// If still not found, we might be in dev and dist doesn't exist yet, 
	// or we just default to web/dist.
	
	log.Printf("Serving static files from: %s", staticDir)
	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", fs)

	srv := &http.Server{
		Addr: ":" + port,
	}

	// Server run in goroutine
	go func() {
		log.Printf("Server starting on port %s...", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown: ", err)
	}

	log.Println("Server exiting")
}
