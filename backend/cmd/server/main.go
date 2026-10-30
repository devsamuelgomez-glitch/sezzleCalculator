// Command server runs the calculator API and, when STATIC_DIR is set, the
// built frontend.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/sam/sezzle-calculator/backend/internal/api"
	"github.com/sam/sezzle-calculator/backend/internal/calc"
)

const shutdownGrace = 10 * time.Second

type config struct {
	port      string
	staticDir string // empty means API only
}

// loadConfig reads PORT (default 8080) and STATIC_DIR (default empty).
func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{port: "8080", staticDir: getenv("STATIC_DIR")}
	if p := getenv("PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 65535 {
			return config{}, fmt.Errorf("PORT %q is not a valid port number (1-65535)", p)
		}
		cfg.port = p
	}
	return cfg, nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(logger, os.Getenv); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger, getenv func(string) string) error {
	cfg, err := loadConfig(getenv)
	if err != nil {
		return err
	}

	var handler http.Handler
	if cfg.staticDir == "" {
		handler = api.New(api.CalculatorFunc(calc.Calculate), logger, nil)
	} else {
		if info, err := os.Stat(cfg.staticDir); err != nil || !info.IsDir() {
			return fmt.Errorf("STATIC_DIR %q is not a readable directory", cfg.staticDir)
		}
		handler = api.New(api.CalculatorFunc(calc.Calculate), logger, os.DirFS(cfg.staticDir))
	}

	ln, err := net.Listen("tcp", ":"+cfg.port)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	logger.Info("listening", "addr", ln.Addr().String(), "static_dir", cfg.staticDir)
	return serve(ctx, srv, ln, shutdownGrace)
}

// serve runs srv on ln until ctx is cancelled, then shuts down gracefully,
// giving in-flight requests up to grace to finish.
func serve(ctx context.Context, srv *http.Server, ln net.Listener, grace time.Duration) error {
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()

	select {
	case err := <-errc:
		return err // failed to serve before any shutdown request
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
