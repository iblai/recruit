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
4. `/` resolves the session's org (`lib/iblai/tenant.ts#resolveDefaultTenant`)
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
from that token.

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

```bash
pnpm tauri dev            # desktop, loads the URL in src-tauri/tauri.conf.json
pnpm tauri build          # installer for this platform
pnpm tauri ios init && pnpm tauri ios dev "iPhone 16 Pro"
pnpm tauri android init && pnpm tauri android dev
```

The shell loads the hosted app (`devUrl` / `frontendDist` in
`src-tauri/tauri.conf.json`, `https://recruit.ibl.ai`). Point it at a local server
by editing those two values (`http://localhost:3000`). OAuth providers open in
the system browser (macOS / iOS: `ASWebAuthenticationSession`; Windows/Linux:
a popup window); the deep link `iblai-recruit://mobile-sso-login?data=…` finishes
the sign-in on mobile.
