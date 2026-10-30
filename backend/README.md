# Calculator backend

A small Go REST service that evaluates one arithmetic operation per request: add, subtract, multiply, divide, power, square root and percentage. It uses only the standard library (`net/http`, no framework, no third-party modules). It can also serve a built frontend, so a single binary runs the whole app.

The frontend lives in the sibling repository [sezzleFrontend](https://github.com/devsamuelgomez-glitch/sezzleFrontend).

## Quick start

Prerequisite: Go 1.22 or newer (`go.mod` declares `go 1.22.0`; tested with Go 1.27.0).

```sh
go run ./cmd/server
```

The API is now on <http://localhost:8080>.

```sh
curl -s localhost:8080/healthz
# {"status":"ok"}
```

### Configuration

| Variable     | Default | Meaning                                                              |
| ------------ | ------- | -------------------------------------------------------------------- |
| `PORT`       | `8080`  | Listen port (1-65535). Anything else fails at startup.               |
| `STATIC_DIR` | empty   | If set, serves that directory at `/` with `index.html` fallback.     |

### Serving the frontend from this binary

Build the frontend (`npm ci && npm run build` in the frontend repo), then point `STATIC_DIR` at its `dist` folder:

```sh
STATIC_DIR=../sezzleFrontend/dist go run ./cmd/server
```

Open <http://localhost:8080>. Unknown non-API paths fall back to `index.html`; anything under `/api/` that doesn't match is a plain 404, never the app. Frontend and API share an origin, so no CORS headers are sent.

For frontend development, run the Vite dev server in the frontend repo instead; it proxies `/api` to this service on port 8080.

## API

| Method | Path                | Purpose                |
| ------ | ------------------- | ---------------------- |
| POST   | `/api/v1/calculate` | Evaluate one operation |
| GET    | `/healthz`          | Liveness check         |

**Request** (`Content-Type: application/json`):

```json
{ "operation": "add", "a": 2, "b": 3 }
```

- `operation`: `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` or `percentage`.
- `a`, `b`: JSON numbers. Binary operations need both. `sqrt` takes only `a` and rejects `b`.
- `percentage` means "`a` percent of `b`" (`a / 100 * b`).
- Unknown fields and trailing data are rejected. Bodies over 1 MiB are rejected.

**Success:** `200 {"result": <number>}`

**Error:** `{"error": {"code": "<stable_code>", "message": "<human text>"}}`

| HTTP | `code`                   | When                                                          |
| ---- | ------------------------ | ------------------------------------------------------------- |
| 400  | `invalid_json`           | Malformed body, wrong types, unknown fields, body over 1 MiB  |
| 400  | `unknown_operation`      | `operation` missing or unsupported                            |
| 400  | `missing_operand`        | `a` missing, or `b` missing for a binary operation            |
| 400  | `unexpected_operand`     | `b` supplied to `sqrt`                                        |
| 405  | `method_not_allowed`     | Non-POST on `/api/v1/calculate`                               |
| 415  | `unsupported_media_type` | `Content-Type` is not `application/json`                      |
| 422  | `division_by_zero`       | `divide` with `b == 0`                                        |
| 422  | `negative_sqrt`          | `sqrt` with `a < 0`                                           |
| 422  | `non_finite_result`      | Result is NaN or infinite (overflow, `0^-1`, `(-8)^0.5`)      |
| 500  | `internal`               | Unexpected failure; no detail is leaked                       |

400 means the request is not understood; 422 means it is well formed but has no valid answer.

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`.

### Examples

Output is the status line and response body.

```sh
curl -si -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":2,"b":3}'
# HTTP/1.1 200 OK
# {"result":5}

curl -si -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"percentage","a":15,"b":200}'
# HTTP/1.1 200 OK
# {"result":30}

curl -si -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"divide","a":1,"b":0}'
# HTTP/1.1 422 Unprocessable Entity
# {"error":{"code":"division_by_zero","message":"cannot divide by zero"}}

curl -si -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","a":-4}'
# HTTP/1.1 422 Unprocessable Entity
# {"error":{"code":"negative_sqrt","message":"cannot take the square root of a negative number"}}

curl -si -X POST localhost:8080/api/v1/calculate -H 'Content-Type: application/json' \
  -d '{"operation":'
# HTTP/1.1 400 Bad Request
# {"error":{"code":"invalid_json","message":"request body is not valid JSON"}}
```

## Design notes

- **float64.** Results are the raw IEEE 754 values, so `0.1 + 0.2` returns `0.30000000000000004`. Rounding for display is the client's job. Integers above 2^53 lose precision. NaN and infinite results are rejected with `non_finite_result`.
- **One endpoint with an `operation` field** instead of one route per operation: seven routes would mean seven handlers with no behavioral gain.
- **Typed errors, mapped at the edge.** `calc` returns sentinel errors (`ErrDivisionByZero`, `ErrNegativeSqrt`, ...). `api` maps them to HTTP statuses in one function (`mapError`). `calc` never sees HTTP or JSON.
- **Server computes.** All arithmetic rules live here, so the frontend stays a thin client.
- **Operation and arity are validated before `calc` runs**, so a request error names the missing operand. `calc` still checks arity itself.
- **Graceful shutdown** on SIGINT/SIGTERM with a 10 s deadline; the server sets read, write, header and idle timeouts. Panics become a generic `500 internal` and are logged.

## Layout

```
cmd/server/       config from env, wiring, graceful shutdown
internal/calc/    pure arithmetic: operations, arity, typed errors (no HTTP, no JSON)
internal/api/     handler, strict request decoding, error mapping, logging, security headers, static/SPA serving
```

## Tests

```sh
go vet ./...
go test ./...
go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out -o coverage.html
```

Statement coverage: `internal/calc` 100.0%, `internal/api` 97.2%, `cmd/server` 34.0%, **total 83.0%**. The low `cmd/server` figure is `main` and `run` (process wiring, no direct test); `loadConfig` and `serve` are tested. The race detector (`-race`) needs cgo and was not run.

## Limitations

- One operation per request; there is no expression parsing.
- No authentication, persistence or rate limiting.
- No CORS headers: a page on another origin cannot call the API by design.
- No Dockerfile in this repository; the combined image is built from the monorepo this was split from.
