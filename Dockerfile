# syntax=docker/dockerfile:1

# 1. Frontend build
FROM node:24.22.2-alpine3.24 AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Backend build: static, stripped binary
FROM golang:1.27.3-alpine3.24 AS backend
WORKDIR /src
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# 3. Runtime
FROM alpine:3.24.3
RUN adduser -D -H -u 10001 app
WORKDIR /app
COPY --from=backend /out/server /app/server
COPY --from=frontend /src/dist /app/static
ENV STATIC_DIR=/app/static PORT=8080
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/app/server"]
