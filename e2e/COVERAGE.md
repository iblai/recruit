# E2E coverage

Playwright journeys in `e2e/journeys/`, signed in once through the real Auth
SPA by `e2e/auth.setup.ts`. `e2e/coverage.json` is the checkpoint list; keep
it in sync when user-facing behavior changes.

| Journey | Checkpoints                                                                           |
| ------- | ------------------------------------------------------------------------------------- |
| auth    | A1 lands on `/platform/<org>` · A2 tokens + tenants stored · A3 URL org = session org |
| shell   | S1 sidebar navigation · S2 ⌘K palette · S3 OS footer cluster · S4 admin gate               |
| recruit | C1 prospect · C2 school · C3 application → board → enrolled · C4 activity · C5 tag · L1 public page 404 · L2 landing-page draft |

Run: `pnpm test:e2e` (all browsers), `pnpm test:e2e:ui`, `pnpm test:e2e:headed`.
Credentials go in `e2e/.env.development` (copy the example).
