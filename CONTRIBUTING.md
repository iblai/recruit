# Contributing to ibl.ai/recruit

Thanks for helping build the open-source recruitment CRM for universities on the ibl.ai platform.

## Setup

1. Fork and clone the repository
2. `pnpm install --ignore-scripts`
3. `pnpm dev`, sign in with your ibl.ai account

## Workflow

1. Branch from `main`: `git checkout -b feat/my-feature`
2. Make the change
3. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
4. Add or update a Playwright journey in `e2e/journeys/` when user-facing behavior changes
5. Open a pull request against `main` with a screenshot of the affected screen

## Guidelines

- **SDK components first** — `@iblai/iblai-js` (profile, notifications, account/management, invitations) before shadcn/ui, before anything custom
- **Never override SDK styles** — SDK components ship with their own
- **Organization comes from the URL** — build every in-app link with `useSession().href(path)`
- **The CRM API is the source of truth** — types in `lib/crm/types.ts`, endpoints in `lib/crm/api.ts`; never write `status` / `closed_at` on deals, use the actions
- **Brand** — primary `#0058cc`, gradient buttons via `ibl-button-primary`, Lucide icons at 1.75 through `globals.css`, Open Sans
- **pnpm 12** as the package manager (`corepack enable`); conventional commit messages

See [AGENTS.md](AGENTS.md) for the rules AI assistants follow in this repo.
