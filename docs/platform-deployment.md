# Platform deployment — every surface on your own backend

ibl.ai/recruit is one web app. The native apps are Tauri 2 WebView shells that load
it, so deploying to all surfaces means: deploy the web app once, then build the
shells against that URL.

## 1. Web

```bash
pnpm build
PORT=3000 pnpm start          # or: docker build -t iblai-recruit . && docker run -p 3000:3000 iblai-recruit
```

Set `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_AUTH_URL` /
`NEXT_PUBLIC_PLATFORM_BASE_DOMAIN` in the environment when the platform is
self-hosted. Register the deployed origin as an allowed redirect origin.

## 2. Point the shells at it

Edit `src-tauri/tauri.conf.json`:

```json
"build": { "frontendDist": "https://recruit.example.com" }
```

The app's own origin needs no capability entry. A self-hosted platform (its
auth and API hosts) goes into `ALLOWED_HOST_SUFFIXES` in `src-tauri/src/lib.rs`.

## 3. macOS

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm tauri build --target universal-apple-darwin --bundles app,dmg
```

Signed + notarized releases: push an `app-v*` tag with the
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`
secrets and `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID` variables set
(`.github/workflows/tauri-release-macos-dmg.yml`).

## 4. Windows

```bash
pnpm tauri build                              # NSIS + MSI for the host arch
```

`tauri-release-windows.yml` builds x64 + arm64 signed installers on an
`app-v*` tag; `tauri-build-windows-msix.yml` produces an MSIX for sideloading
or the Microsoft Store (`src-tauri/build-msix.ps1` — see the vibe
`iblai-vibe-windows-msix` skill).

## 5. Linux

```bash
pnpm tauri build --bundles appimage
```

`tauri-build-desktop.yml` builds the same AppImage on demand.

## 6. iOS

```bash
scripts/mobile-init.sh                        # once, on a Mac: generates src-tauri/gen/apple
pnpm tauri:dev:ios "iPhone 16 Pro"            # simulator
pnpm tauri:build:ios --export-method app-store-connect
```

`bundle.iOS.developmentTeam` in `tauri.conf.json` is the Apple team; the
`tauri-build-ios.yml` workflow exports an `.ipa` with an App Store Connect API
key (`APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`). Submit
with Fastlane per the vibe `iblai-vibe-ops-release` skill. Sign-in returns
through the custom scheme `iblai-recruit://`, which needs no
`apple-app-site-association`.

## 7. Android

```bash
scripts/mobile-init.sh                        # once, on Linux: generates src-tauri/gen/android
pnpm tauri:dev:android
pnpm tauri:build:android --aab                # or --apk
```

`tauri-build-android.yml` builds an unsigned `.aab` and `.apk` on demand. Sign
the AAB with your upload keystore (Tauri's Android signing guide) before the
first Play Console upload, which cannot go through the API.

## 8. Organization-locked builds

```bash
IBL_TENANT=acme pnpm tauri build
```

pins the binary to one organization (the switcher is hidden and every user is
signed in to `acme`).
