# Unwire AI Agent — Build Makefile
VERSION := 1.0.0
BINARY := unwire-agent
BUILD_DIR := ./build

.PHONY: all clean build linux darwin windows

all: linux darwin windows

clean:
	rm -rf $(BUILD_DIR)

build:
	go build -ldflags="-s -w -X main.VERSION=$(VERSION)" -o $(BUILD_DIR)/$(BINARY) .

linux:
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY)-linux-amd64 .
	GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY)-linux-arm64 .

darwin:
	GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY)-darwin-amd64 .
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY)-darwin-arm64 .

windows:
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY)-windows-amd64.exe .

test:
	go test ./...

docker:
	docker build -t unwire-agent:$(VERSION) .
