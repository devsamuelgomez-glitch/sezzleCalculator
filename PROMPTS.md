# Prompts

The prompts given to Claude Code while building this project, in order. Prompts 1-9 are verbatim. Each has a one-line intent and an outcome note; the commit hashes are from this repository's history.

| #   | Prompt                        | Commit    |
| --- | ----------------------------- | --------- |
| 0   | Project setup (`CLAUDE.md`)   | `f461a5a` |
| 1   | Design document               | `efdc05d` |
| 2   | `calc` domain package         | `2af9e96` |
| 3   | REST API and server           | `92fa4d0` |
| 4   | Frontend scaffold, API client | `a1d82af` |
| 5   | Calculator reducer            | `ec736ff` |
| 6   | UI, hook, keyboard, a11y      | `1be42a9` |
| 7   | Makefile, coverage, Dockerfile | `a5dc0a5` |
| 8   | README                        | `8bea50b` |
| 9   | Final review and fixes        | `cffd8cb` |
| 10  | This prompt log               | see `git log` |

## Prompt 0: Project setup

**Intent:** Set the persistent project rules (goals, principles, commands, definition of done) that every later prompt builds on.

**Prompt:** _Not reproduced here. The text of this prompt was not available when this log was generated, and it is not reconstructed from memory. Paste it here to complete the log._

**Outcome:** `f461a5a` "chore: bootstrap repository" added `CLAUDE.md`, `.gitignore` and a stub `PROMPTS.md`. `CLAUDE.md` defines the Go + React scope, the stdlib-first and typed-error principles, the command table and the Definition of Done.

## Prompt 1: Design document

**Intent:** Decide the API, error model, numeric strategy, layout, serving model and test strategy on paper before any code.

~~~text
<role>Senior software architect.</role>

<task>
Read CLAUDE.md, then produce a design document at docs/DESIGN.md. Write no application code.
</task>

<decisions_to_make_and_justify>
Be decisive. For each item, give your recommendation, one alternative considered, and the trade-off.
1. API shape: a single `POST /api/v1/calculate` with an operation field versus one endpoint per operation. Also `GET /healthz`.
2. Request/response JSON schema, including unary operations (sqrt) and percentage semantics. Define percentage precisely (e.g. "a percent of b") and give an example.
3. Error model: a stable machine-readable `code`, a human `message`, HTTP status mapping (400 malformed JSON/unknown operation, 422 domain errors such as division by zero, negative sqrt, non-finite result).
4. Numeric strategy: float64 versus a decimal type. Handle NaN/Inf/overflow, and the classic 0.1 + 0.2 display problem. Pick one and document the limitation.
5. Backend package layout: pure domain package `calc` (no HTTP imports), `api` package (handlers, validation, JSON), `cmd/server` (wiring, config via env, graceful shutdown).
6. Frontend architecture: Vite + React + TS; separate (a) pure reducer/state machine for the calculator, (b) API client with injectable fetch, (c) presentational components. Say where validation lives.
7. Serving model: the Go binary serves the built frontend in production (single container); Vite dev-proxy in development. CORS stance.
8. Testing strategy per layer and the coverage tooling.
</decisions_to_make_and_justify>

<output_format>
docs/DESIGN.md with sections: Overview, API Contract (with 6+ concrete JSON examples including errors), Backend Design, Frontend Design, Testing Strategy, Risks and Non-goals. Keep it under 250 lines. End with an ordered implementation checklist that later prompts will follow.
</output_format>

<rules>
List any assumption you had to make under an "Assumptions" heading. Commit as "docs: add design and API contract".
</rules>
~~~

**Outcome:** `efdc05d` "docs: add design and API contract": `docs/DESIGN.md`, 167 lines at that commit. It fixes the single-endpoint API (`operation`, `a`, `b`), the `{"error":{"code","message"}}` envelope with 400/422 mapping, float64 with display rounding, the `calc`/`api`/`cmd/server` layout, same-origin serving with no CORS, and a 13-step implementation checklist.

## Prompt 2: `calc` domain package

**Intent:** Build the pure arithmetic package test-first, with typed errors and no HTTP or JSON imports.

~~~text
<task>
Implement backend/internal/calc, the pure domain package, following docs/DESIGN.md. Work test-first.
</task>

<process>
1. Write table-driven tests FIRST in calc_test.go and show them failing.
2. Implement the minimum code to pass.
3. Refactor for clarity; run gofmt and go vet.
</process>

<requirements>
- `type Operation string` with constants; `func Calculate(op Operation, operands ...float64) (float64, error)` or a similarly small, idiomatic API you justify in a comment.
- Sentinel/typed errors usable with errors.Is/As: ErrDivisionByZero, ErrNegativeSqrt, ErrInvalidOperandCount, ErrUnknownOperation, ErrNonFiniteResult.
- No imports from net/http or encoding/json in this package.
</requirements>

<test_cases_must_include>
Normal cases for every operation; negatives; zero; division by zero; sqrt(0), sqrt(-1); power with 0^0, negative exponents, and overflow (1e308 * 10 -> non-finite error); percentage; wrong operand count; unknown operation; floating-point case 0.1 + 0.2 documented per the design's numeric strategy.
</test_cases_must_include>

<acceptance_criteria>
`go test ./... -race -cover` passes in backend/, coverage of calc >= 95%. Paste the command output in your reply. Commit as "feat(backend): add calculator domain package with tests".
</acceptance_criteria>
~~~

**Outcome:** `2af9e96` "feat(backend): add calculator domain package with tests": `internal/calc/calc.go` and `calc_test.go`. `Calculate(op, operands...)` with the five sentinel errors plus a typed `*OperandCountError`; `-0` results normalized to `+0`. Statement coverage of `calc` is 100% in the current tree.

## Prompt 3: REST API and server

**Intent:** Add the HTTP transport with strict decoding, a single error-mapping function, middleware and a gracefully shutting-down server.

~~~text
<task>
Implement backend/internal/api and backend/cmd/server per docs/DESIGN.md.
</task>

<requirements>
- Use net/http with Go 1.22+ method-aware ServeMux patterns; no router framework.
- Handler depends on a small interface for the calculator, so it can be faked in tests.
- Strict decoding: limit body size (http.MaxBytesReader), json.Decoder.DisallowUnknownFields, reject trailing data, require Content-Type: application/json.
- Map domain errors to the documented status codes and error JSON via a single function (errors.Is/As). Never leak internal error text on unexpected failures; return a generic 500 and log details with log/slog.
- Middleware: request logging (slog) and panic recovery. Keep it minimal.
- main: config via env (PORT, STATIC_DIR optional), http.Server with read/write/idle timeouts, graceful shutdown on SIGINT/SIGTERM. Serve STATIC_DIR with SPA fallback only if set.
- Handlers tested with net/http/httptest: success for each operation, malformed JSON, unknown field, wrong content type, oversize body, unknown op, division by zero, sqrt of negative, wrong operand count, method not allowed, healthz.
</requirements>

<acceptance_criteria>
- `go vet ./... && go test ./... -race -coverprofile=coverage.out` passes; report per-package coverage (api >= 90%).
- Start the server and show real curl calls for one success and two error cases with their output.
- Commit as "feat(backend): add REST API, validation and graceful server".
</acceptance_criteria>
~~~

**Outcome:** `92fa4d0` "feat(backend): add REST API, validation and graceful server": the `internal/api` package (handler, decoding, `mapError`, logging and recovery middleware, SPA static handler) and `cmd/server` (env config, timeouts, graceful shutdown), with `httptest` tests. `internal/api` coverage is 97.2% in the current tree.

## Prompt 4: Frontend scaffold and API client

**Intent:** Stand up the Vite + React + TypeScript toolchain and a typed, injectable API client, with no UI.

~~~text
<task>
Scaffold frontend/ with Vite + React + TypeScript (strict mode) and implement the typed API client. No UI yet.
</task>

<requirements>
- Tooling: Vitest + React Testing Library + jsdom, ESLint, Prettier. Ask before adding anything beyond these.
- `src/api/types.ts` mirrors the API contract in docs/DESIGN.md exactly (operation union type, request, success and error response types).
- `src/api/client.ts`: `createCalculatorClient({ baseUrl, fetchImpl })` returning `calculate(req)`; on non-2xx, throw a typed `ApiError` carrying the server `code` and `message`; on network failure, throw a distinct `NetworkError`; support AbortSignal.
- Vite dev proxy: /api -> http://localhost:8080.
- Tests for the client using an injected fake fetch: success, 4xx with error body, non-JSON error body, network failure, abort.
</requirements>

<acceptance_criteria>
`npm run lint && npx tsc --noEmit && npm test` all pass; paste output. Commit as "feat(frontend): scaffold app and typed API client".
</acceptance_criteria>
~~~

**Outcome:** `a1d82af` "feat(frontend): scaffold app and typed API client": Vite/React/TS (strict) project, ESLint and Prettier config, `api/types.ts`, `api/client.ts` (`ApiError`, `NetworkError`, abort support), the `/api` dev proxy, and client tests with a fake `fetch`.

## Prompt 5: Calculator reducer

**Intent:** Implement the calculator's state machine as a pure reducer that emits request intents instead of computing.

~~~text
<task>
Implement the calculator's state logic as a pure reducer in frontend/src/state/calculator.ts, with no React or network dependencies. Test-first.
</task>

<design_guidance>
State: current entry string, stored left operand, pending operation, last result, error, status (idle | entering | awaiting-result | error). Actions: digit, decimal, toggleSign, clear, backspace, selectBinaryOp, selectUnaryOp (sqrt, percent), equals, resultReceived, failed.
The reducer must NOT compute results. It emits a "request intent" and the hook (next prompt) calls the API, since the backend is the source of truth for arithmetic.
</design_guidance>

<input_validation_rules>
Single decimal point, max 15 digits, no leading zeros ("007" -> "7"), "-0" normalized, block equals when the right operand is missing, block input while a request is in flight, clear error on next input.
</input_validation_rules>

<tests>
Cover each rule above, operator chaining (2 + 3 * 4 resolves left to right via the API), repeated equals behavior (state your chosen behavior and test it), and the error then recover path.
</tests>

<acceptance_criteria>
Tests pass, reducer coverage >= 95%, no `any` types. Commit as "feat(frontend): add calculator state machine".
</acceptance_criteria>
~~~

**Outcome:** `ec736ff` "feat(frontend): add calculator state machine": `state/calculator.ts`, `state/format.ts` and their tests. The reducer sets `request` and `status: 'awaiting-result'` and waits for `resultReceived` or `failed`. Repeated `=` replays the last operation. Reducer coverage is 100% statements and branches in the current tree.

## Prompt 6: UI, hook, keyboard and accessibility

**Intent:** Build the user interface on the reducer and client, with loading and error states, keyboard support and a11y.

~~~text
<task>
Build the UI on top of the reducer and API client.
</task>

<requirements>
- `useCalculator` hook wires reducer + client (inject the client for testing); handle loading and error states; cancel the in-flight request on clear/unmount.
- Components: Display (aria-live="polite" result, separate error banner with role="alert"), Keypad, Key. Layout: a 4-column CSS grid for the keys. Operations are +, -, ×, ÷, xʸ, √, %.
- Plain CSS with custom properties (no UI library). Mobile-first; it must work at 320px width; touch targets >= 44px; respects prefers-color-scheme and prefers-reduced-motion.
- Keyboard support: digits, operators, Enter/= , Backspace, Escape. All keys are real <button>s with accessible names ("divide", "square root").
- Friendly error messages mapped from server error codes (e.g. DIVISION_BY_ZERO -> "Cannot divide by zero"); a distinct message for network failure.
- No arbitrary extras: no history panel, no theming toggle.
</requirements>

<tests_RTL>
Using a fake client: type 12 + 30 = shows 42; division by zero shows the alert and recovers; loading disables input; keyboard flow works; network error message is shown.
</tests_RTL>

<acceptance_criteria>
Lint, tsc and tests pass. Then run backend + frontend together, drive the real UI with the browser tools at 375px and desktop widths, take screenshots, and report any visual or functional defects you fix. Commit as "feat(frontend): calculator UI with keyboard and a11y support".
</acceptance_criteria>
~~~

**Outcome:** `1be42a9` "feat(frontend): calculator UI with keyboard and a11y support": `hooks/useCalculator.ts` (aborts in-flight requests through effect cleanup), `Display`/`Keypad`/`Key`, `keyboard.ts`, `api/messages.ts`, `index.css` and `App` tests. The frontend suite is 132 tests in total in the current tree.

## Prompt 7: Makefile, coverage and Dockerfile

**Intent:** Add the developer workflow and a single multi-stage, non-root Docker image.

~~~text
<task>
Add the developer workflow and deployment packaging.
</task>

<requirements>
- Makefile targets: test, cover (writes backend/coverage.out + coverage.html and frontend/coverage/ via vitest --coverage with v8), lint, run-backend, run-frontend, docker-build, docker-run.
- Multi-stage Dockerfile: (1) node build stage for the frontend, (2) golang build stage producing a static binary (CGO_ENABLED=0, -trimpath, stripped), (3) minimal final image (distroless or alpine) running as a non-root user, STATIC_DIR set, EXPOSE 8080, HEALTHCHECK. Add .dockerignore. Pin base-image versions.
- Commit the coverage summary as docs/COVERAGE.md (generated numbers, not invented).
</requirements>

<acceptance_criteria>
Run `make test cover`, `docker build`, then `docker run` and verify with curl against /healthz and /api/v1/calculate and that / serves the UI. Paste the evidence and the final image size. Commit as "build: add Makefile, coverage and Dockerfile".
</acceptance_criteria>
~~~

**Outcome:** `a5dc0a5` "build: add Makefile, coverage and Dockerfile": `Makefile`, a 3-stage `Dockerfile` (pinned `node:24.22.2-alpine3.24`, `golang:1.27.3-alpine3.24`, `alpine:3.24.3`; runs as uid 10001), `.dockerignore` and `docs/COVERAGE.md`. Verified with curl against the running container; the image was 23.2 MB. Make and Docker Desktop had to be installed first, and Docker needed WSL2 and a reboot.

## Prompt 8: README

**Intent:** Write a README an evaluator can use in five minutes, with every example executed rather than invented.

~~~text
<task>
Write README.md for an evaluator who has 5 minutes.
</task>

<structure>
1. One-paragraph overview and a screenshot (from Prompt 6).
2. Quick start: Docker (2 commands) and local (prerequisites with versions, backend, frontend).
3. API reference: endpoint table, request/response schema, and copy-paste curl examples for success, division by zero, sqrt of a negative, malformed input. Every example must be executed by you and the output copied, not invented.
4. Architecture diagram (mermaid) and a repo map.
5. Design decisions and trade-offs: condense docs/DESIGN.md; include the float64 limitation, why the server computes, why no framework, and how the single-container serving works.
6. Testing: how to run, coverage numbers (from docs/COVERAGE.md).
7. Assumptions, known limitations, and what I would do next with more time.
8. AI usage: how Claude Code was used; link to PROMPTS.md.
</structure>

<rules>
Concise, no marketing language, no claims you have not verified. Commit as "docs: add README".
</rules>
~~~

**Outcome:** `8bea50b` "docs: add README": `README.md` plus `docs/screenshot.png`. The curl outputs were captured from the Docker image. The browser extension was not connected, so the screenshot is the idle UI from headless Chrome (480px wide), not the 375px and desktop shots from Prompt 6.

## Prompt 9: Final review

**Intent:** Get an adversarial whole-repo review, fix the blockers and should-fixes, and verify from a fresh clone.

~~~text
<task>
Act as a skeptical principal engineer doing a final review of the whole repository before submission. Do not rubber-stamp it.
</task>

<checklist>
- Spec compliance: walk through every line of the assignment requirements and mark met or not met, with a file reference.
- Correctness: edge cases in calc, error mapping and the reducer; race conditions or stale-response bugs in useCalculator.
- Idiom: Go (error wrapping, context use, naming, exported API surface), React (effects, keys, memoization only where needed), TypeScript (no any, exhaustive switches).
- Security: request size limits, headers (X-Content-Type-Options, etc.), error leakage, container user.
- Dead code, unused dependencies, inconsistent naming, comments that restate the code.
- Fresh clone test: clone to a temp dir, follow the README exactly, and note any step that fails.
</checklist>

<output>
A prioritized findings list (blocker / should-fix / nit). Fix all blockers and should-fixes, rerun all tests, update docs if behavior changed, then commit as "fix: address final review findings". Finish with a final pass/fail table for the deliverables: repo, README, tests + coverage, Dockerfile, prompts.
</output>
~~~

**Outcome:** `cffd8cb` "fix: address final review findings". Added security headers (`nosniff`, `Referrer-Policy`, a strict CSP) with tests, made the Docker `HEALTHCHECK` follow `PORT`, made `make test`/`cover`/`lint` run `npm ci` on a fresh clone, added `.gitattributes` to force LF (a Windows clone failed `make lint` on CRLF), and corrected the stale frontend section of `docs/DESIGN.md`. The one blocker, an empty `PROMPTS.md`, was left open at that point and is addressed by this file.

## Prompt 10: Prompt log

**Intent:** Record the prompts, their intents and outcomes, and the prompting approach, in this file.

The task text is: generate `PROMPTS.md` with Prompts 0-9 verbatim, a one-line intent and an outcome for each, and a closing "Prompting approach" section of 5 bullets; commit as "docs: add prompt log". Prompt 0 is a placeholder above because its text was not supplied.

**Outcome:** this file.

## Prompting approach

- **Persistent `CLAUDE.md`.** Project goals, engineering principles (stdlib-first, typed errors, no premature abstraction), the command table and the Definition of Done were written once and applied to every later prompt, so individual prompts could stay short and not repeat the rules.
- **Plan before code.** Prompt 1 forced the API contract, error model, numeric strategy and layout into `docs/DESIGN.md`, with an alternative and a trade-off for each decision, and ended with an ordered checklist. Prompts 2-8 followed that checklist, one commit per step.
- **Test-first gates.** The domain package and the reducer were specified test-first, with coverage floors in the acceptance criteria (`calc` at least 95%, `api` at least 90%, reducer at least 95%) and `go vet`, `tsc` and lint required to pass before a commit.
- **Evidence-based verification.** Prompts required pasted command output, real curl calls against a running server or container, and README examples that had been executed instead of written from memory. Numbers in `docs/COVERAGE.md` and the README come from `make cover`.
- **Independent review.** Prompt 9 reset the stance to a skeptical reviewer with a checklist, a fresh-clone test and a blocker/should-fix/nit ranking. It found problems the earlier steps had not: a hard-coded healthcheck port, stale design docs, and CRLF checkouts breaking `make lint`.
