# Calculator frontend

A React + TypeScript calculator UI (Vite, strict TypeScript, plain CSS). It does no arithmetic itself: every `=`, `√` and `%` is sent to the Go API, which is the source of truth for results and errors.

The API lives in the sibling repository [sezzleBackend](https://github.com/devsamuelgomez-glitch/sezzleBackend).

## Quick start

Prerequisites: Node and npm (built and tested with Node 26.12.0; the Docker image of the full project builds with Node 24.22.2) and Go 1.22+ for the backend.

```sh
# 1. backend, in the sezzleBackend repo (API on :8080)
go run ./cmd/server

# 2. frontend, in this repo
npm ci
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` to `http://localhost:8080` (`vite.config.ts`), so the browser sees one origin and no CORS setup is needed. Without the backend running, the UI loads but a calculation shows the "can't reach the server" message.

### Production build

```sh
npm run build        # tsc --noEmit && vite build, output in dist/
```

`dist/` is static. The backend can serve it: run it with `STATIC_DIR` pointing at this folder (see the backend README).

## Scripts

| Script             | What it does                       |
| ------------------ | ---------------------------------- |
| `npm run dev`      | Vite dev server on port 5173       |
| `npm run build`    | Type-check, then production build  |
| `npm run preview`  | Serve the production build locally |
| `npm run lint`     | ESLint, then Prettier `--check`    |
| `npm run format`   | Prettier `--write`                 |
| `npm test`         | Vitest, single run                 |
| `npm run coverage` | Vitest with v8 coverage            |

## Using it

Operations: `+`, `−`, `×`, `÷`, `xʸ`, `√`, `%`. Every key is a real `<button>` with an accessible name (for example "divide", "square root").

Keyboard: digits, `.` or `,`, `+ - * / ^ %`, `x` for multiply, `Enter` or `=` to evaluate, `Backspace`, `Escape` to clear.

Behavior worth knowing:

- Input is blocked while a request is in flight, except Clear, which cancels it.
- Operators chain left to right: `2 + 3 ×` evaluates `2 + 3` first.
- Pressing `=` again repeats the last operation.
- After `+` or `−`, `%` means "that percent of the left operand"; otherwise it divides by 100.
- Results display with up to 12 significant digits, so the API's `0.30000000000000004` shows as `0.3`.
- Errors appear in a separate `role="alert"` banner. Server codes map to messages such as "Cannot divide by zero"; a network failure gets its own message. The next input dismisses the error.

## Architecture

```
src/
  state/calculator.ts   pure reducer: (state, action) -> state; emits a request intent, never calls the API
  state/format.ts       display formatting (12 significant digits)
  api/client.ts         createCalculatorClient({ baseUrl, fetchImpl }); ApiError, NetworkError, AbortSignal support
  api/messages.ts       server error code -> user-facing message
  api/types.ts          request/response/error types mirroring the API contract
  hooks/useCalculator.ts  wires reducer + client; the effect cleanup aborts the in-flight request
  components/           Display, Keypad, Key (presentational, props only)
  keyboard.ts           keydown -> reducer actions
  App.tsx               wires the hook, keyboard listener and components
```

- **The reducer never computes.** When a result is needed it sets `request` and `status: 'awaiting-result'`. `useCalculator` makes the call in an effect and dispatches `resultReceived` or `failed`. A late reply after Clear or unmount is ignored.
- **The client takes an injectable `fetch`**, so tests use a fake. It throws a typed `ApiError { status, code, message }` for non-2xx responses and a distinct `NetworkError` for network failures; an aborted call rethrows the abort.
- **Validation is split on purpose.** The reducer prevents malformed input (one decimal point, 15-digit cap, no leading zeros, no `-0`). The backend decides what is arithmetically valid, and the UI shows its message.
- **Plain CSS with custom properties**, mobile-first, 56px keys, `prefers-color-scheme` and `prefers-reduced-motion` respected.

### API contract used

`POST /api/v1/calculate` with `{"operation": "add" | "subtract" | "multiply" | "divide" | "power" | "sqrt" | "percentage", "a": number, "b"?: number}`. Success is `{"result": number}`. Errors are `{"error": {"code": string, "message": string}}`. The full table of codes is in the backend README.

## Tests

```sh
npm test
npm run coverage
```

132 tests in 6 files (reducer, formatting, API client, error messages, keyboard map, and the full UI against a fake client). Coverage from `npm run coverage`: 98.25% statements, 97.4% branches, 97.56% functions, 99.32% lines. The report covers files the tests load, so `main.tsx` is not counted.

## Limitations

- No browser end-to-end tests.
- No history, theming toggle or scientific functions beyond the seven operations.
- float64 precision comes from the backend; integers above 2^53 lose precision.
