# Development Guide

This is ibl.ai/recruit — the recruitment CRM with a Chief of Staff agent. The
platform mechanics below are shared with ibl.ai/recruit; the parts specific to
this app are in [chief-of-staff.md](chief-of-staff.md) and
[landing-pages.md](landing-pages.md).

## Prerequisites

- Node.js 22+ (26 is what `.tool-versions` pins; the `dev` script disables Node's experimental web storage)
- pnpm 12 — `corepack enable` installs the version pinned in `package.json`
- An ibl.ai account — [ibl.ai/join](https://ibl.ai/join) — that belongs to at least one organization
- For native builds: the Rust toolchain ([rustup](https://rustup.rs)); Xcode for iOS; Android Studio + NDK for Android

## Run

```bash
pnpm install --ignore-scripts
pnpm dev
```

The app redirects to `login.iblai.app`; after sign-in you land on
`/platform/<org>`. `http://localhost:3000` must be an allowed redirect origin
of the organization you sign in to (it is for ibl.ai's own organizations; ask
your operator otherwise).

## Environment

Nothing is required against hosted `iblai.app`. Copy `.env.example` to
`.env.local` to override the service URLs (self-hosting) or the community org.
`iblai.env` holds the platform shorthand used by the vibe skills
(`DOMAIN`, `PLATFORM`, `IBLAI_USERNAME`) — it is gitignored, and like
`.env.local` it holds no secret.

## How sign-in and organizations work

1. `providers/iblai-providers.tsx` initializes the SDK data layer and mounts
   `AuthProvider` → `TenantProvider`.
2. `AuthProvider` checks for a non-expired `axd_token`; without one it calls
   `redirectToAuthSpa()` (`lib/iblai/auth-utils.ts`) which goes through
   `/api/auth-redirect` to `login.<domain>/login?app=mentor&redirect-to=<origin>&tenant=<org>`.
3. The Auth SPA returns to `/sso-login-complete?data=…`; the SDK's `SsoLogin`
   stores `axd_token`, `dm_token`, `userData`, `tenants`, `current_tenant`.
   `lib/iblai/sso-redirect.ts` sanitizes the landing path and resets it to `/`
   when it names another organization.
4. `/` resolves the session's org (`lib/iblai/tenant.ts#pickLandingTenant`)
   and goes to `/platform/<org>`.
5. `TenantProvider` gets `requestedTenant` from the route and `currentTenant`
   from storage. When they differ it re-authenticates against the requested
   org and hands back a fresh org-scoped token pair (`saveUserTokens`).
6. Switching orgs (`OrgSwitcher`, or the SDK profile dropdown) calls the SDK's
   `handleTenantSwitch`, which clears storage, broadcasts to other tabs and
   re-enters the Auth SPA with `tenant=<new>`.

The app holds no server secrets: admin routes act with the caller's own
session, and the Chief of Staff's tools act with the `recruit-tools` key agent
setup mints and the platform presents (see `docs/chief-of-staff.md`).
`pnpm seed:demo` asks for the credential it acts with — an org admin's Platform
API key, or `Token <session token>` to act as yourself — on hidden input (or a
pipe) and keeps it nowhere. `NEXT_PUBLIC_APP_URL` must be the public https
origin in production.

The CRM API (`lib/crm/api.ts`) sends `Authorization: Token <dm_token>` to
`https://api.iblai.app/dm/api/crm/…`; the platform infers the organization
from that token. Every call also names the app (`app=recruit`,
`lib/crm/app.ts`): the platform keeps each app's records apart (crm 1.4.0),
recruit refuses any record that isn't its own and writes only once
`/overview/` echoes the app. Against an older platform every page says it
can't open the CRM (`components/crm/scope-gate.tsx`). The seed creates the
admissions funnel (`lib/recruit/admissions.ts`).

## Roles

Four roles are seeded per organization: **CRM Viewer**, **CRM User**,
**CRM Manager**, **CRM Inviter**. Assign them on `/platform/<org>/admin/users`
(the UI calls them counselors and admins)
(the SDK's Management surface, Roles + Policies tabs). Organization admins
hold every permission. The app shows every affordance and surfaces a
permission error from the API as a toast; `/settings` and `/admin/*` are
additionally hidden from non-admins.

## Project layout

See the [Architecture](../README.md#architecture) section of the README.
Shared record widgets live in `components/crm/` (tag picker, owner select,
inline fields, activity timeline, confirm dialog, badges, avatars); module
components live under `components/crm/<module>/`.

## Verify a change

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Then open the page you touched and take a screenshot for the PR.
`pnpm screenshots` regenerates the captures in `docs/images/` from the
Playwright session (`pnpm exec playwright test --project=setup-chromium` once,
with your credentials in `e2e/.env.development`).

## Native shell

`src-tauri/` is the vibe `iblai-vibe-ops-build` shell with recruit's values; the
generated Xcode and Gradle projects under `src-tauri/gen/` are committed.

```bash
pnpm tauri:dev                       # desktop, on the dev server (devUrl in src-tauri/tauri.conf.json)
pnpm tauri dev -c '{"build":{"devUrl":"https://recruit.ibl.ai","beforeDevCommand":""}}'   # the hosted app
pnpm tauri:build                     # installer for this platform
pnpm tauri:dev:ios "iPhone 16 Pro"   # a name from `xcrun simctl list devices`
pnpm tauri:dev:android "Pixel_9"     # a name from `emulator -list-avds`
pnpm shell:smoke                     # headless: the guard and both sign-in returns against a local page (CI runs it)
pnpm shell:touch                     # the installer's app against the hosted app, with the checklist (Linux, macOS)
pnpm shell:touch:android             # the debug APK on the phone over adb: scheme, launch, deep link, checklist
pnpm shell:touch:ios "iPhone 16 Pro" # the app on a simulator through `tauri ios dev`: URL types, the scheme, checklist
pnpm shell:touch:windows             # Windows: the debug exe (the one with a console) against the hosted app; `shell:smoke:windows` headless
pnpm shell:clear [android | ios]     # forget the shell's cookies and localStorage so the next run starts signed out (Windows: shell:clear:windows)
```

First time on a machine, `scripts/mobile-init.sh` generates the project for its
OS: macOS makes `gen/apple` (needs Xcode and rustup); Linux makes `gen/android`
(needs rustup, JDK 17 and the Android SDK with Platform-Tools, Build-Tools, a
platform and an NDK, exported as `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`). It
prints the one build that writes the URL scheme into the project; commit
`src-tauri/gen/` after it.

Sign-in: the auth app returns to the shell through `iblai-recruit://` from the
system browser and through its own `iblai-mentor://` from inside the webview;
`src-tauri/src/lib.rs` rewrites both onto the app URL (`/sso-login-complete`).
Provider sign-in opens in `ASWebAuthenticationSession` (macOS, iOS), the system
browser (Android) or a popup window (Windows, Linux).

`tauri-check.yml` checks the shell on every change under `src-tauri/`: fmt, check
and test on Linux, macOS and Windows, the iOS arm from the Mac, then
`pnpm shell:smoke` headless. The touch tests (`pnpm shell:touch`, `shell:touch:windows`,
`shell:touch:ios`, `shell:touch:android`) are yours: a throwaway organization, the checklist
each prints, the log judged at the end.
