package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nqhuy44/barge/internal/config"
	"github.com/nqhuy44/barge/internal/game"
)

func main() {
	// 1. Load Config
	cfg, err := config.LoadConfig("config.json")
	if err != nil {
		log.Printf("Warning: Could not load config.json (%v). Using defaults.", err)
		cfg = &config.Config{
			Port:         ":8080",
			GameDuration: 300,
			BaseRadius:   17.0,
			RadiusStep:   3.0,
		}
	}
	
	// Environment Variable Override (Optional)
	if envPort := os.Getenv("PORT"); envPort != "" {
		cfg.Port = ":" + envPort
	}
	// Ensure port starts with :
	if len(cfg.Port) > 0 && cfg.Port[0] != ':' {
		cfg.Port = ":" + cfg.Port
	}

	// 2. Initialize Game Hub
	hub := game.NewHub(cfg)
	go hub.Run()

	// 3. Setup Static Files
	staticDir := "web/dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		if _, err := os.Stat("../web/dist"); err == nil {
			staticDir = "../web/dist"
		}
	}
	
	log.Printf("Serving static files from: %s", staticDir)
	fs := http.FileServer(http.Dir(staticDir))
	http.Handle("/", fs)

	// 4. Setup WebSocket Route
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		game.ServeWs(hub, w, r)
	})

	srv := &http.Server{
		Addr: cfg.Port,
	}

	// 4. Start Server
	go func() {
		log.Printf("Server starting on port %s...", cfg.Port)
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
