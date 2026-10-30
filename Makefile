IMAGE ?= sezzle-calculator
PORT  ?= 8080

.PHONY: test cover lint run-backend run-frontend docker-build docker-run

# Installs frontend dependencies on a fresh clone; re-runs when the lockfile changes.
frontend/node_modules: frontend/package-lock.json
	cd frontend && npm ci
	touch frontend/node_modules

test: frontend/node_modules
	cd backend && go test ./...
	cd frontend && npm test

cover: frontend/node_modules
	cd backend && go test ./... -coverprofile=coverage.out
	cd backend && go tool cover -func=coverage.out | tail -n 1
	cd backend && go tool cover -html=coverage.out -o coverage.html
	cd frontend && npx vitest run --coverage --coverage.provider=v8 --coverage.reportsDirectory=coverage --coverage.reporter=text --coverage.reporter=html --coverage.reporter=json-summary

lint: frontend/node_modules
	@test -z "$$(gofmt -l backend)" || { gofmt -l backend; echo "gofmt: files need formatting"; exit 1; }
	cd backend && go vet ./...
	cd frontend && npx tsc --noEmit && npm run lint

run-backend:
	cd backend && PORT=$(PORT) go run ./cmd/server

run-frontend: frontend/node_modules
	cd frontend && npm run dev

docker-build:
	docker build -t $(IMAGE) .

docker-run:
	docker run --rm -p $(PORT):8080 $(IMAGE)
