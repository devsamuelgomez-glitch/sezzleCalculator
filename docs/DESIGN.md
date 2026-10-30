# Design

## Overview

A calculator with a Go REST backend and a React + TypeScript frontend. The backend owns all arithmetic; the frontend owns input handling and display. In production one Go binary serves both the API and the built frontend.

```
Browser (React) --POST /api/v1/calculate--> api (decode, validate, map errors) --> calc (pure math)
```

Operations: `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`, `percentage`.

### Assumptions

- Go 1.22+ (method-aware `http.ServeMux` patterns), Node 20+.
- Single-user calculator: no auth, no persistence, no rate limiting.
- Operands are finite JSON numbers; the API never receives strings of digits.
- The frontend keeps the running expression; the backend is stateless and evaluates one operation per request.
- "Percentage" means "a percent of b" (see below); the UI maps its `%` key onto that.
- The sqrt operand goes in `a`; `b` must be absent.

## API Contract

### Decisions

**1. Shape: single `POST /api/v1/calculate` with an `operation` field** (plus `GET /healthz`).
Alternative: one endpoint per operation (`/add`, `/sqrt`, ...). Per-operation routes give a tighter schema per route, but multiply routes, handlers, tests and docs by seven for no behavioral gain. The trade-off: one endpoint needs `operation` validated at runtime, which we do with a single table.

**2. Schema.** Request: `{"operation": string, "a": number, "b"?: number}`. Binary operations require both `a` and `b`; `sqrt` requires `a` and rejects `b`. Response: `{"result": number}`. Alternative: an `operands: []` array, which is uniform but loses meaning (`a` percent of `b`) and arity checking. Trade-off: two named fields mean a new n-ary operation would need a schema change; none is in scope.

**Percentage:** `percentage(a, b)` = `a` percent of `b` = `a / 100 * b`. Example: `{"operation":"percentage","a":15,"b":200}` gives `30`. Alternative: "a as a percentage of b" (`a / b * 100`), rejected because it adds a divide-by-zero case and reads less naturally on a calculator.

**3. Errors:** `{"error": {"code": string, "message": string}}`. `code` is stable and machine-readable; `message` is for humans and may change. Alternative: RFC 7807 problem+json, which is more standard but heavier than a take-home needs. Trade-off: a custom envelope means clients must know it, so it is documented here and in the README.

| HTTP | code                  | When                                              |
| ---- | --------------------- | ------------------------------------------------- |
| 400  | `invalid_json`        | Malformed body, wrong types, unknown fields, number out of float64 range, body over 1 MiB |
| 400  | `unknown_operation`   | `operation` missing or not in the list            |
| 400  | `missing_operand`     | `a` missing, or `b` missing for a binary operation|
| 400  | `unexpected_operand`  | `b` supplied to `sqrt`                            |
| 405  | `method_not_allowed`  | Non-POST on `/api/v1/calculate`                   |
| 422  | `division_by_zero`    | `divide` with `b == 0`                            |
| 422  | `negative_sqrt`       | `sqrt` with `a < 0`                               |
| 422  | `non_finite_result`   | Result is NaN or ±Inf (overflow, `0^-1`, `(-8)^0.5`) |
| 500  | `internal`            | Unexpected failure (panic recovery); no detail leaked |

400 means the request is not understood; 422 means it is well-formed but has no valid answer.

### Examples

1. Binary success
   `POST /api/v1/calculate` `{"operation":"add","a":2,"b":3}` -> `200 {"result":5}`
2. Unary success
   `{"operation":"sqrt","a":144}` -> `200 {"result":12}`
3. Percentage
   `{"operation":"percentage","a":15,"b":200}` -> `200 {"result":30}`
4. Division by zero
   `{"operation":"divide","a":1,"b":0}` -> `422 {"error":{"code":"division_by_zero","message":"cannot divide by zero"}}`
5. Negative sqrt
   `{"operation":"sqrt","a":-4}` -> `422 {"error":{"code":"negative_sqrt","message":"cannot take the square root of a negative number"}}`
6. Overflow
   `{"operation":"power","a":10,"b":400}` -> `422 {"error":{"code":"non_finite_result","message":"result is not a finite number"}}`
7. Unknown operation
   `{"operation":"modulo","a":1,"b":2}` -> `400 {"error":{"code":"unknown_operation","message":"unknown operation \"modulo\""}}`
8. Missing operand
   `{"operation":"multiply","a":4}` -> `400 {"error":{"code":"missing_operand","message":"operand \"b\" is required for multiply"}}`
9. Malformed JSON
   `{"operation":` -> `400 {"error":{"code":"invalid_json","message":"request body is not valid JSON"}}`
10. Health
    `GET /healthz` -> `200 {"status":"ok"}`

## Backend Design

### Numeric strategy

**float64**, not a decimal type. Alternative: `math/big` or a decimal library, which gives exact `0.1 + 0.2 = 0.3`. Trade-off: float64 is native to JSON, `math.Pow` and `math.Sqrt`, needs no dependency, and is what a calculator user expects at 12 digits; a decimal type would add a dependency (or hand-rolled code) and still cannot represent `sqrt(2)` or fractional powers exactly.

- Every result is checked with `math.IsNaN` / `math.IsInf`; failures return `ErrNonFinite`. Overflow, `0^-1` and `(-8)^0.5` all land there.
- The backend returns the raw float64 (Go's shortest round-trip form), so `0.1 + 0.2` yields `0.30000000000000004`. This is the documented limitation.
- The **frontend** hides it for display: round to 12 significant digits (`Number(x.toPrecision(12))`), then print without trailing zeros. The API stays honest and the UI stays friendly. Integers above 2^53 lose precision.

### Package layout

```
backend/
  cmd/server/main.go     config from env, wiring, graceful shutdown
  internal/calc/         pure domain: Operation, Apply, typed errors (no net/http, no encoding/json)
  internal/api/          handler, request/response types, validation, error mapping, static serving
```

- `calc` exposes `Apply(op Operation, a, b float64) (float64, error)`, an `Operation` string type with its arity (`Arity() int`), and sentinel errors `ErrDivisionByZero`, `ErrNegativeSqrt`, `ErrNonFinite`, `ErrUnknownOperation`. Pure functions; table-driven tests.
- `api` decodes into `struct{Operation string; A, B *float64}` (pointers distinguish absent from zero), uses `json.Decoder` with `DisallowUnknownFields` and `http.MaxBytesReader`, validates arity, calls `calc.Apply`, and maps errors with `errors.Is` in one `switch`. `New(staticFS fs.FS) http.Handler` returns a mux; no globals.
- `cmd/server`: reads `PORT` (default `8080`) and `STATIC_DIR` (default empty, meaning API only); `http.Server` with read/header/write timeouts; `signal.NotifyContext` for SIGINT/SIGTERM then `Shutdown` with a 10 s deadline. A recover middleware turns panics into `500 internal`.
- Validation lives in `api` (shape and arity) and `calc` (domain rules). `api` never does math; `calc` never sees JSON.

### Serving model and CORS

- **Production:** the Go binary serves `STATIC_DIR` (Vite build) at `/` with `index.html` fallback, and the API under `/api/v1`. Same origin, so **no CORS headers**. Alternative: separate nginx container with CORS, rejected for the single-Dockerfile requirement.
- **Development:** Vite dev server proxies `/api` to `localhost:8080`. Browser still sees one origin, so no CORS in dev either. Trade-off: a third-party client on another origin would be blocked by design; add an allow-list only if that need appears.

## Frontend Design

Vite + React + TypeScript (strict). Three layers, each testable alone.

```
frontend/src/
  calculator/reducer.ts    pure state machine: (state, action) -> state
  calculator/format.ts     pure display formatting (12 significant digits)
  api/client.ts            createClient(fetchImpl = fetch) -> { calculate(req) }
  api/types.ts             request/response/error types mirroring the contract
  components/              Display, Keypad, Key (presentational, props only)
  App.tsx                  wires reducer + client; the only stateful component
```

- **Reducer** actions: `digit`, `decimal`, `operator`, `equals`, `clear`, `negate`, `percent`, `sqrt`, plus `result` and `error` dispatched when the API replies. State holds `display`, `accumulator`, `pendingOp`, `status` (`idle | loading | error`), `errorMessage`. It does no I/O; `equals` is handled by `App` calling the client then dispatching `result`/`error`. Alternative: Redux or a state library, rejected as unnecessary for one screen.
- **API client** takes an injectable `fetch`, so tests pass a stub. It maps a non-2xx body to a typed `ApiError { code, message }` and network failures to `NetworkError`. No retries.
- **Components** are presentational: no fetch, no reducer logic, props in and callbacks out.
- **Validation** lives in two places by intent: the **reducer** prevents bad input (one decimal point, no leading-zero runs, digit cap) so the UI cannot construct invalid numbers; the **backend** is the authority on arithmetic validity (division by zero etc.) and the UI displays its `message`. The client does not duplicate domain rules.
- Keyboard input is supported by mapping `keydown` to the same actions.

## Testing Strategy

| Layer          | What                                                                 | Tooling                          |
| -------------- | -------------------------------------------------------------------- | -------------------------------- |
| `calc`         | Table-driven: every operation, edge cases (zero, negatives, overflow, `0.1+0.2`), each sentinel error | `go test -cover`                 |
| `api`          | `httptest` against the handler: each contract example above, 405, oversize body, unknown fields, panic recovery | `go test`, `net/http/httptest`   |
| `cmd/server`   | Config parsing only; kept thin to need little testing                | `go test`                        |
| reducer/format | Pure input/output tables; no DOM                                     | Vitest                           |
| API client     | Stubbed `fetch`: success, API error mapping, network failure         | Vitest                           |
| components     | Render and interaction through the user's eyes (click keys, see display) | Vitest + React Testing Library |

- **Coverage:** backend `go test ./... -coverprofile=coverage.out` then `go tool cover -html`; frontend `vitest run --coverage` with `@vitest/coverage-v8`. `make cover` runs both and writes to `backend/coverage.html` and `frontend/coverage/`.
- Target: `calc` and reducer at ~100%; overall above 85%. Coverage is a smell detector, not the goal.
- No end-to-end browser tests (see non-goals); one manual smoke check against the Docker image is listed in the checklist.
- Third-party dependencies expected (each to be approved before adding): React, Vite, Vitest, React Testing Library, jsdom, `@vitest/coverage-v8`, ESLint. Backend: none.

## Risks and Non-goals

**Risks**
- float64 imprecision beyond 12 significant digits and above 2^53; mitigated by display rounding and documentation.
- Reducer complexity (chained operations, operator replacement, post-equals typing) is where bugs will hide; mitigated by table-driven reducer tests written first.
- A network round-trip per `=` adds latency and a failure mode the UI must show (`loading`, `error`) without losing the current entry.
- Vite proxy and production static serving behave differently; mitigated by the Docker smoke check.

**Non-goals**
- Auth, persistence or calculation history, multi-user state, rate limiting.
- Arbitrary-precision arithmetic, expression parsing (`2+3*4` as a string), scientific functions beyond the seven operations.
- Internationalization, theming, accessibility beyond semantic buttons, labels and keyboard support.
- Browser end-to-end tests, CI configuration, metrics and tracing.

## Implementation Checklist

Each step is one commit and follows the Definition of Done in CLAUDE.md.

1. `calc`: operations, arity, typed errors, table-driven tests.
2. `api`: request/response types, validation, error mapping, handler tests for every contract example.
3. `cmd/server`: env config, `/healthz`, recover middleware, graceful shutdown.
4. Makefile targets for backend (`test`, `cover`, `run-backend`).
5. Frontend scaffold: Vite + React + TS strict, ESLint, Vitest, dev proxy (dependencies approved first).
6. Reducer and `format`, with tests first.
7. API client with injectable fetch, with tests.
8. Presentational components with tests.
9. `App` wiring, keyboard support, loading and error states.
10. Static serving in `api` (`STATIC_DIR`, SPA fallback) with tests.
11. Dockerfile (multi-stage: build frontend, build Go, minimal runtime) and `make docker`; manual smoke test.
12. Makefile frontend targets; `make test` and `make cover` cover both layers.
13. README: setup, API examples, design decisions, limitations.
