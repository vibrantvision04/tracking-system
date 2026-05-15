FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Build the binaries
RUN CGO_ENABLED=0 GOOS=linux go build -o tracker-backend ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o migrate-db ./scripts/migrate_all.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/
COPY --from=builder /app/tracker-backend .
COPY --from=builder /app/migrate-db .
COPY --from=builder /app/migrations ./migrations

# Expose HTTP port (Railway injects PORT automatically)
ENV PORT=8080
EXPOSE 8080

CMD ["./tracker-backend"]
