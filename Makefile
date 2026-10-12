.PHONY: dev build start check test e2e e2e-ui tauri-dev tauri-build ios android

dev: ; pnpm dev
build: ; pnpm build
start: ; pnpm start
check: ; pnpm typecheck && pnpm lint && pnpm test
test: ; pnpm test
e2e: ; pnpm test:e2e
e2e-ui: ; pnpm test:e2e:ui
tauri-dev: ; pnpm tauri dev
tauri-build: ; pnpm tauri build
ios: ; pnpm tauri ios dev
android: ; pnpm tauri android dev
