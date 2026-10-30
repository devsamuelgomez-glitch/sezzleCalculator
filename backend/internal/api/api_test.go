package api_test

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/sam/sezzle-calculator/backend/internal/api"
	"github.com/sam/sezzle-calculator/backend/internal/calc"
)

const calculatePath = "/api/v1/calculate"

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func realHandler() http.Handler {
	return api.New(api.CalculatorFunc(calc.Calculate), discardLogger(), nil)
}

func postJSON(h http.Handler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, calculatePath, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errBody(code, message string) string {
	return `{"error":{"code":"` + code + `","message":` + quote(message) + `}}`
}

func quote(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func TestCalculate_Contract(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantBody   string
	}{
		// success, one per operation
		{"add", `{"operation":"add","a":2,"b":3}`, 200, `{"result":5}`},
		{"subtract", `{"operation":"subtract","a":2,"b":3}`, 200, `{"result":-1}`},
		{"multiply", `{"operation":"multiply","a":4,"b":3}`, 200, `{"result":12}`},
		{"divide", `{"operation":"divide","a":10,"b":4}`, 200, `{"result":2.5}`},
		{"power", `{"operation":"power","a":2,"b":10}`, 200, `{"result":1024}`},
		{"sqrt", `{"operation":"sqrt","a":144}`, 200, `{"result":12}`},
		{"percentage", `{"operation":"percentage","a":15,"b":200}`, 200, `{"result":30}`},
		{"explicit zero operands are present, not missing", `{"operation":"add","a":0,"b":0}`, 200, `{"result":0}`},
		{"raw float64 is returned unrounded", `{"operation":"add","a":0.1,"b":0.2}`, 200, `{"result":0.30000000000000004}`},

		// malformed input -> 400 invalid_json
		{"malformed JSON", `{"operation":`, 400, errBody("invalid_json", "request body is not valid JSON")},
		{"empty body", ``, 400, errBody("invalid_json", "request body is not valid JSON")},
		{"operand has wrong type", `{"operation":"add","a":"2","b":3}`, 400, errBody("invalid_json", `field "a" has the wrong type or is out of range`)},
		{"operation has wrong type", `{"operation":1,"a":2,"b":3}`, 400, errBody("invalid_json", `field "operation" has the wrong type or is out of range`)},
		{"number out of float64 range", `{"operation":"add","a":1e999,"b":1}`, 400, errBody("invalid_json", `field "a" has the wrong type or is out of range`)},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, 400, errBody("invalid_json", `unknown field "c"`)},
		{"trailing second object", `{"operation":"add","a":1,"b":2}{"operation":"add"}`, 400, errBody("invalid_json", "request body must contain a single JSON object")},
		{"trailing garbage", `{"operation":"add","a":1,"b":2} x`, 400, errBody("invalid_json", "request body must contain a single JSON object")},
		{"trailing whitespace is fine", "{\"operation\":\"add\",\"a\":1,\"b\":2}\n\n", 200, `{"result":3}`},

		// validation -> 400
		{"unknown operation", `{"operation":"modulo","a":1,"b":2}`, 400, errBody("unknown_operation", `unknown operation "modulo"`)},
		{"missing operation", `{"a":1,"b":2}`, 400, errBody("unknown_operation", `unknown operation ""`)},
		{"missing a", `{"operation":"add","b":2}`, 400, errBody("missing_operand", `operand "a" is required for add`)},
		{"missing b on binary op", `{"operation":"multiply","a":4}`, 400, errBody("missing_operand", `operand "b" is required for multiply`)},
		{"missing a on sqrt", `{"operation":"sqrt"}`, 400, errBody("missing_operand", `operand "a" is required for sqrt`)},
		{"b supplied to sqrt", `{"operation":"sqrt","a":4,"b":2}`, 400, errBody("unexpected_operand", `operand "b" is not allowed for sqrt`)},

		// domain failures -> 422
		{"division by zero", `{"operation":"divide","a":1,"b":0}`, 422, errBody("division_by_zero", "cannot divide by zero")},
		{"sqrt of negative", `{"operation":"sqrt","a":-4}`, 422, errBody("negative_sqrt", "cannot take the square root of a negative number")},
		{"overflow", `{"operation":"power","a":10,"b":400}`, 422, errBody("non_finite_result", "result is not a finite number")},
		{"0^-1", `{"operation":"power","a":0,"b":-1}`, 422, errBody("non_finite_result", "result is not a finite number")},
	}

	h := realHandler()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := postJSON(h, tt.body)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if got := strings.TrimSpace(rec.Body.String()); got != tt.wantBody {
				t.Errorf("body = %s, want %s", got, tt.wantBody)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
		})
	}
}

func TestCalculate_ContentType(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		wantStatus  int
	}{
		{"application/json", "application/json", 200},
		{"with charset parameter", "application/json; charset=utf-8", 200},
		{"media type is case-insensitive", "Application/JSON", 200},
		{"text/plain", "text/plain", 415},
		{"form encoding", "application/x-www-form-urlencoded", 415},
		{"missing header", "", 415},
		{"unparseable header", "application/json;;=", 415},
	}

	h := realHandler()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, calculatePath, strings.NewReader(`{"operation":"add","a":1,"b":2}`))
			if tt.contentType != "" {
				req.Header.Set("Content-Type", tt.contentType)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if tt.wantStatus == 415 {
				want := errBody("unsupported_media_type", "Content-Type must be application/json")
				if got := strings.TrimSpace(rec.Body.String()); got != want {
					t.Errorf("body = %s, want %s", got, want)
				}
			}
		})
	}
}

func TestCalculate_BodyLimit(t *testing.T) {
	h := realHandler()
	want := errBody("invalid_json", "request body exceeds 1 MiB")

	t.Run("oversize body", func(t *testing.T) {
		body := `{"operation":"add","a":1,"b":2,"note":"` + strings.Repeat("x", 1<<20) + `"}`
		rec := postJSON(h, body)
		if rec.Code != 400 {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
		if got := strings.TrimSpace(rec.Body.String()); got != want {
			t.Errorf("body = %s, want %s", got, want)
		}
	})

	t.Run("oversize trailing data", func(t *testing.T) {
		body := `{"operation":"add","a":1,"b":2}` + strings.Repeat(" ", 1<<20) + `{}`
		rec := postJSON(h, body)
		if rec.Code != 400 {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
		if got := strings.TrimSpace(rec.Body.String()); got != want {
			t.Errorf("body = %s, want %s", got, want)
		}
	})
}

func TestCalculate_MethodNotAllowed(t *testing.T) {
	h := realHandler()
	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		t.Run(method, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(method, calculatePath, nil))

			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("status = %d, want 405", rec.Code)
			}
			if got := rec.Header().Get("Allow"); got != "POST" {
				t.Errorf("Allow = %q, want POST", got)
			}
			if got, want := strings.TrimSpace(rec.Body.String()), errBody("method_not_allowed", "use POST"); got != want {
				t.Errorf("body = %s, want %s", got, want)
			}
		})
	}
}

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	realHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"status":"ok"}` {
		t.Errorf("body = %s", got)
	}
}

// fakeCalculator records its input and returns canned output.
type fakeCalculator struct {
	op       calc.Operation
	operands []float64
	result   float64
	err      error
	panicVal any
}

func (f *fakeCalculator) Calculate(op calc.Operation, operands ...float64) (float64, error) {
	f.op, f.operands = op, operands
	if f.panicVal != nil {
		panic(f.panicVal)
	}
	return f.result, f.err
}

func TestCalculate_UsesInjectedCalculator(t *testing.T) {
	fake := &fakeCalculator{result: 42}
	rec := postJSON(api.New(fake, discardLogger(), nil), `{"operation":"percentage","a":15,"b":200}`)

	if got := strings.TrimSpace(rec.Body.String()); got != `{"result":42}` {
		t.Errorf("body = %s, want the fake's result", got)
	}
	if fake.op != calc.Percentage || len(fake.operands) != 2 || fake.operands[0] != 15 || fake.operands[1] != 200 {
		t.Errorf("fake got op=%q operands=%v, want percentage [15 200]", fake.op, fake.operands)
	}
}

func TestCalculate_UnexpectedErrorsAreGenericAndLogged(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{"arbitrary error", errors.New("db password is hunter2")},
		// api validates arity first, so calc rejecting it is a bug, not a client error.
		{"operand count from calc", &calc.OperandCountError{Op: calc.Add, Want: 2, Got: 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			logger := slog.New(slog.NewTextHandler(&logs, nil))
			rec := postJSON(api.New(&fakeCalculator{err: tt.err}, logger, nil), `{"operation":"add","a":1,"b":2}`)

			if rec.Code != 500 {
				t.Fatalf("status = %d, want 500", rec.Code)
			}
			if got, want := strings.TrimSpace(rec.Body.String()), errBody("internal", "internal server error"); got != want {
				t.Errorf("body = %s, want %s", got, want)
			}
			if !strings.Contains(logs.String(), tt.err.Error()) {
				t.Errorf("log does not contain the cause %q:\n%s", tt.err, logs.String())
			}
		})
	}
}

func TestPanicRecovery(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	h := api.New(&fakeCalculator{panicVal: "boom: secret detail"}, logger, nil)

	rec := postJSON(h, `{"operation":"add","a":1,"b":2}`)

	if rec.Code != 500 {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if got, want := strings.TrimSpace(rec.Body.String()), errBody("internal", "internal server error"); got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
	if strings.Contains(rec.Body.String(), "secret") {
		t.Error("panic value leaked to the client")
	}
	if !strings.Contains(logs.String(), "boom: secret detail") {
		t.Errorf("panic not logged:\n%s", logs.String())
	}

	// The server keeps serving after a panic.
	if rec := postJSON(realHandler(), `{"operation":"add","a":1,"b":2}`); rec.Code != 200 {
		t.Errorf("follow-up request status = %d, want 200", rec.Code)
	}
}

func TestRequestLogging(t *testing.T) {
	var logs bytes.Buffer
	h := api.New(api.CalculatorFunc(calc.Calculate), slog.New(slog.NewTextHandler(&logs, nil)), nil)

	postJSON(h, `{"operation":"divide","a":1,"b":0}`)

	for _, want := range []string{"method=POST", "path=/api/v1/calculate", "status=422"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("log missing %q:\n%s", want, logs.String())
		}
	}
}

func TestStaticServing(t *testing.T) {
	static := fstest.MapFS{
		"index.html":    {Data: []byte("<html>app</html>")},
		"assets/app.js": {Data: []byte("console.log('hi')")},
	}
	h := api.New(api.CalculatorFunc(calc.Calculate), discardLogger(), static)

	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantBody   string
	}{
		{"root serves index", "GET", "/", 200, "<html>app</html>"},
		{"existing asset", "GET", "/assets/app.js", 200, "console.log('hi')"},
		{"client-side route falls back to index", "GET", "/history/2024", 200, "<html>app</html>"},
		{"directory falls back to index", "GET", "/assets", 200, "<html>app</html>"},
		{"HEAD is allowed", "HEAD", "/", 200, ""},
		{"unknown API path is a 404, not the app", "GET", "/api/v1/nope", 404, "404 page not found\n"},
		{"non-GET is rejected", "POST", "/", 405, "method not allowed\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if rec.Body.String() != tt.wantBody {
				t.Errorf("body = %q, want %q", rec.Body.String(), tt.wantBody)
			}
		})
	}

	t.Run("API still works with static serving on", func(t *testing.T) {
		if rec := postJSON(h, `{"operation":"add","a":1,"b":2}`); rec.Code != 200 {
			t.Errorf("status = %d, want 200", rec.Code)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", "/healthz", nil))
		if rec.Code != 200 {
			t.Errorf("healthz status = %d, want 200", rec.Code)
		}
	})
}

func TestNoStaticFS_RootIsNotFound(t *testing.T) {
	rec := httptest.NewRecorder()
	realHandler().ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != 404 {
		t.Errorf("status = %d, want 404 when STATIC_DIR is unset", rec.Code)
	}
}

func TestCalculate_UnknownOperationFromCalculatorIsClientError(t *testing.T) {
	fake := &fakeCalculator{err: fmt.Errorf("%w %q", calc.ErrUnknownOperation, "frobnicate")}
	rec := postJSON(api.New(fake, discardLogger(), nil), `{"operation":"add","a":1,"b":2}`)

	if rec.Code != 400 {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if got, want := strings.TrimSpace(rec.Body.String()), errBody("unknown_operation", `unknown operation "frobnicate"`); got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
}
