package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestLoadConfig(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		want    config
		wantErr bool
	}{
		{"defaults", nil, config{port: "8080"}, false},
		{"custom port", map[string]string{"PORT": "9000"}, config{port: "9000"}, false},
		{"static dir", map[string]string{"STATIC_DIR": "/srv/app"}, config{port: "8080", staticDir: "/srv/app"}, false},
		{"empty PORT falls back to default", map[string]string{"PORT": ""}, config{port: "8080"}, false},
		{"non-numeric port", map[string]string{"PORT": "http"}, config{}, true},
		{"port zero", map[string]string{"PORT": "0"}, config{}, true},
		{"port too large", map[string]string{"PORT": "65536"}, config{}, true},
		{"negative port", map[string]string{"PORT": "-1"}, config{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := loadConfig(func(k string) string { return tt.env[k] })

			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %t", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("config = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestServe_GracefulShutdown(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	release := make(chan struct{})
	started := make(chan struct{})
	mux := http.NewServeMux()
	mux.HandleFunc("/slow", func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		io.WriteString(w, "done")
	})
	srv := &http.Server{Handler: mux}

	ctx, cancel := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() { served <- serve(ctx, srv, ln, 5*time.Second) }()

	type reply struct {
		body string
		err  error
	}
	replies := make(chan reply, 1)
	go func() {
		resp, err := http.Get("http://" + ln.Addr().String() + "/slow")
		if err != nil {
			replies <- reply{err: err}
			return
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		replies <- reply{body: string(b), err: err}
	}()

	<-started // a request is in flight
	cancel()  // ask the server to shut down
	select {
	case err := <-served:
		t.Fatalf("serve returned %v while a request was still in flight", err)
	case <-time.After(100 * time.Millisecond):
	}

	close(release) // let the in-flight request finish
	if r := <-replies; r.err != nil || r.body != "done" {
		t.Errorf("in-flight request = (%q, %v), want (\"done\", nil)", r.body, r.err)
	}
	if err := <-served; err != nil {
		t.Errorf("serve returned %v, want nil after graceful shutdown", err)
	}
}

func TestServe_ReturnsServeError(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ln.Close() // Serve fails immediately on a closed listener

	err = serve(context.Background(), &http.Server{}, ln, time.Second)
	if err == nil {
		t.Fatal("serve returned nil, want the listener error")
	}
}
