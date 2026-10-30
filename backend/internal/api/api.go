// Package api is the HTTP transport for the calculator. It decodes and
// validates requests, calls the calculator, and maps errors to the contract in
// docs/DESIGN.md. It does no arithmetic.
package api

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"

	"github.com/sam/sezzle-calculator/backend/internal/calc"
)

// Calculator is what the handler needs from the domain. The real
// implementation is calc.Calculate (wrap it in CalculatorFunc); tests supply
// fakes.
type Calculator interface {
	Calculate(op calc.Operation, operands ...float64) (float64, error)
}

// CalculatorFunc adapts a function such as calc.Calculate to Calculator.
type CalculatorFunc func(op calc.Operation, operands ...float64) (float64, error)

// Calculate calls f.
func (f CalculatorFunc) Calculate(op calc.Operation, operands ...float64) (float64, error) {
	return f(op, operands...)
}

// New returns the application handler: the JSON API under /api/v1, /healthz,
// and, when staticFS is non-nil, the built frontend at / with SPA fallback.
func New(c Calculator, logger *slog.Logger, staticFS fs.FS) http.Handler {
	h := &handler{calc: c, logger: logger}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", h.calculate)
	// Any other method gets the contract's JSON 405 rather than the mux's
	// plain-text one. The method-specific pattern above wins for POST.
	mux.HandleFunc("/api/v1/calculate", h.methodNotAllowed)
	mux.HandleFunc("GET /healthz", h.healthz)
	if staticFS != nil {
		mux.Handle("/", spaHandler(staticFS))
	}
	return withLogging(logger, mux)
}

type handler struct {
	calc   Calculator
	logger *slog.Logger
}

type resultBody struct {
	Result float64 `json:"result"`
}

func (h *handler) calculate(w http.ResponseWriter, r *http.Request) {
	req, err := decodeRequest(w, r)
	if err != nil {
		h.fail(w, err)
		return
	}
	op, operands, err := req.operation()
	if err != nil {
		h.fail(w, err)
		return
	}
	result, err := h.calc.Calculate(op, operands...)
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resultBody{Result: result})
}

func (h *handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *handler) methodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", http.MethodPost)
	h.fail(w, newRequestError(http.StatusMethodNotAllowed, "method_not_allowed", "use POST"))
}

// fail writes the contract error for err and logs the cause of unexpected
// failures, which the client only ever sees as a generic 500.
func (h *handler) fail(w http.ResponseWriter, err error) {
	if status, _ := mapError(err); status == http.StatusInternalServerError {
		h.logger.Error("unexpected calculation failure", "error", err)
	}
	writeError(w, err)
}

func writeError(w http.ResponseWriter, err error) {
	status, body := mapError(err)
	writeJSON(w, status, body)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The client may have gone away; there is nothing useful to do with the error.
	_ = json.NewEncoder(w).Encode(v)
}
