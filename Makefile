.PHONY: install install-api install-web dev dev-api dev-web dev-all build build-api build-web clean help

# Install dependencies
install: install-api install-web

install-api:
	cd apps/api && npm install

install-web:
	cd apps/web && npm install

# Development
dev-api:
	cd apps/api && npm run dev

dev-web:
	cd apps/web && npm run dev

dev-all:
	@echo "Starting API and Web in parallel..."
	@trap 'kill 0' INT; \
	(cd apps/api && npm run dev) & \
	(cd apps/web && npm run dev) & \
	wait

# Build
build: build-api build-web

build-api:
	cd apps/api && npm run build

build-web:
	cd apps/web && npm run build

# Clean
clean:
	rm -rf apps/api/node_modules apps/api/dist apps/api/api/index.js
	rm -rf apps/web/node_modules apps/web/.next

# Help
help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies for both apps"
	@echo "  make install-api  - Install API dependencies"
	@echo "  make install-web  - Install Web dependencies"
	@echo "  make dev-api      - Run API in development mode"
	@echo "  make dev-web      - Run Web in development mode"
	@echo "  make dev-all      - Run both API and Web together"
	@echo "  make build        - Build both apps"
	@echo "  make build-api    - Build API"
	@echo "  make build-web    - Build Web"
	@echo "  make clean        - Remove node_modules and build artifacts"
