# CLAUDE.md

## Project goal

A full-stack calculator built as a take-home assignment for Sezzle.

- **Backend:** Go REST microservice.
- **Frontend:** React + TypeScript app consuming that API.
- **Operations:** add, subtract, multiply, divide (required); power, sqrt, percentage (optional, included).
- **Non-functional:** idiomatic code, unit tests in both layers with coverage reports, a README (setup, API examples, design decisions), and a single Dockerfile for frontend + backend.
- **Budget:** roughly 2-4 hours. Correctness, clarity and maintainability beat feature count.

## Repo layout

```
backend/      Go REST service (net/http)
frontend/     React + TypeScript app
Dockerfile    Single image serving frontend + backend
Makefile      Entry point for all commands below
README.md     Setup, API examples, design decisions
PROMPTS.md    Log of AI prompts used
CLAUDE.md     This file
```

`backend/` and `frontend/` are created with their first real code.

## Engineering principles

- **Stdlib-first Go.** Use `net/http`; no web framework.
- **No premature abstraction.** Introduce an interface or layer only when a second use exists or a test needs it. Keep interfaces small.
- **Errors are values and are typed.** Use sentinel or typed errors (`errors.Is` / `errors.As`), wrap with context, and map them to HTTP status codes only at the transport edge.
- **Pure business logic, separate from transport.** Calculation code knows nothing about HTTP or JSON.
- **No global state.** Inject dependencies explicitly.
- **Tests document behavior.** Prefer table-driven tests with names that read as specifications.

## Commands



| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `make test`          | Run backend and frontend tests           |
| `make cover`         | Generate coverage reports for both layers|
| `make run-backend`   | Start the Go API                         |
| `make run-frontend`  | Start the frontend dev server            |
| `make docker-build`  | Build the Docker image                   |
| `make docker-run`    | Run the image on port 8080               |
| `make lint`          | gofmt, go vet, tsc, eslint, prettier     |

## Definition of done

A change is done only when:

- Tests are written and passing.
- Linters and formatters are clean: `gofmt`, `go vet`, `eslint`, `tsc --noEmit`.
- No TODOs are left behind.
- Docs (README, this file) are updated.

## Git conventions

- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).
- One commit per logical step.

## Rules of engagement

- State assumptions explicitly instead of silently guessing.
- Do not add features beyond the spec.
- Ask before adding any third-party dependency, and justify it in one sentence.
