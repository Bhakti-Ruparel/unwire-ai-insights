# Unwire AI Agent — Multi-platform build
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Download Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build for current platform
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /unwire-agent .

# Minimal runtime
FROM alpine:3.20

RUN apk add --no-cache ca-certificates

COPY --from=builder /unwire-agent /usr/local/bin/unwire-agent

ENTRYPOINT ["unwire-agent"]
CMD ["start"]
