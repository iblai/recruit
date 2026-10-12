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
"build": { "devUrl": "https://crm.example.com", "frontendDist": "https://crm.example.com" }
```

and add the host to `src-tauri/capabilities/default.json` → `remote.urls` and
to the navigation allow-list in `src-tauri/src/lib.rs` if it is not under
`.ibl.ai` / `.iblai.app`.

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
pnpm tauri build --bundles deb,appimage
```

## 6. iOS

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
pnpm tauri ios init
pnpm tauri ios dev "iPhone 16 Pro"            # simulator
pnpm tauri ios build --export-method app-store-connect
```

`bundle.iOS.developmentTeam` in `tauri.conf.json` is the Apple team; the
`tauri-build-ios.yml` workflow exports an `.ipa` with an App Store Connect API
key (`APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`). Submit
with Fastlane per the vibe `iblai-vibe-ops-release` skill. The deep-link
host entries in `tauri.conf.json` need an `apple-app-site-association` on the
web host for universal links; the custom scheme `iblai-recruit://` works without it.

## 7. Android

```bash
pnpm tauri android init
pnpm tauri android dev
pnpm tauri android build --aab
```

Google Play cannot accept the first upload via API — create the listing and
push one `.aab` by hand once.

## 8. Organization-locked builds

```bash
IBL_TENANT=acme pnpm tauri build
```

pins the binary to one organization (the switcher is hidden and every user is
signed in to `acme`).
