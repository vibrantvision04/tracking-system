FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Build the server binary
RUN CGO_ENABLED=0 GOOS=linux go build -o tracker-backend ./cmd/server

FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/
COPY --from=builder /app/tracker-backend .

# Expose HTTP port (Railway injects PORT automatically)
EXPOSE 8080 
# Expose TCP Port for GPS Ingestion
EXPOSE 5027

CMD ["./tracker-backend"]
