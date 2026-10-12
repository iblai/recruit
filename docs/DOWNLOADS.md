# Downloads

Native builds of ibl.ai/recruit are produced by the release workflows in
[`.github/workflows/`](../.github/workflows/) and attached to GitHub Releases:

| Surface                            | Workflow                                                                            | Trigger                                | Artifact                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| macOS (Universal)                  | [`tauri-release-macos-dmg.yml`](../.github/workflows/tauri-release-macos-dmg.yml)   | push an `app-v*` tag (or run manually) | signed & notarized `.dmg`                 |
| Windows x64/arm64                  | [`tauri-release-windows.yml`](../.github/workflows/tauri-release-windows.yml)       | push an `app-v*` tag (or run manually) | signed NSIS `-setup.exe`                  |
| Windows MSIX                       | [`tauri-build-windows-msix.yml`](../.github/workflows/tauri-build-windows-msix.yml) | run manually                           | `.msix` for sideloading / Microsoft Store |
| Linux · macOS · Windows (unsigned) | [`tauri-build-desktop.yml`](../.github/workflows/tauri-build-desktop.yml)           | run manually                           | `.deb`, AppImage, `.app`, `.exe`          |
| iOS                                | [`tauri-build-ios.yml`](../.github/workflows/tauri-build-ios.yml)                   | run manually                           | `.ipa` (App Store Connect export)         |

The native app is versioned independently of the web app (its own `app-v<X>`
line, from `src-tauri/tauri.conf.json`).

## Releases

| Version    | Date | Download                                                               |
| ---------- | ---- | ---------------------------------------------------------------------- |
| app-v0.1.0 | —    | Push the `app-v0.1.0` tag to publish the first macOS + Windows builds. |

The latest build is always linked from the [README](../README.md#️-get-iblaicrm)
(`https://github.com/iblai/recruit/releases/latest`).

## Store listings

The iOS (App Store) and Android (Google Play) listings are not published yet.
The apps build today (`pnpm tauri ios build`, `pnpm tauri android build`) —
see [platform-deployment.md](platform-deployment.md) for signing and submission.
