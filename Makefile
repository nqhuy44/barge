.PHONY: dev build-web run

dev:
	go run ./cmd/server/main.go

build-web:
	cd web && npm install && npm run build

run-web:
	cd web && npm run dev

run: build-web dev

#run frontend and backend without build
run-dev:
	go run ./cmd/server/main.go
	cd web && npm run dev
	