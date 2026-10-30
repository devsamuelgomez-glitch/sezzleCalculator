package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// spaHandler serves files from fsys and falls back to index.html for any path
// that is not a file, so client-side routes survive a reload. Paths under
// /api/ are never rewritten: a typo there is a 404, not the app.
func spaHandler(fsys fs.FS) http.Handler {
	files := http.FileServerFS(fsys)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name != "" {
			if info, err := fs.Stat(fsys, name); err != nil || info.IsDir() {
				r = r.Clone(r.Context())
				r.URL.Path = "/" // FileServer maps "/" to index.html
			}
		}
		files.ServeHTTP(w, r)
	})
}
