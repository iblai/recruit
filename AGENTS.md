# AGENTS.md — ibl.ai/recruit

Guidance for AI assistants (Claude Code, Cursor, Codex…) working in this
repository. `CLAUDE.md` is a symlink to this file.

## What this is

ibl.ai/recruit is a **university recruitment / admissions CRM** on the ibl.ai
platform, built with the [iblai/vibe](https://github.com/iblai/vibe) toolkit
and derived from [iblai/crm](https://github.com/iblai/crm). Three things make
it what it is:

1. **The Chief of Staff** — an ibl.ai agent every team member talks to. Home
   is the conversation (`app/(app)/platform/[tenantKey]/page.tsx`); a side
   panel offers it on every other page. The agent acts through this app's own
   MCP tool server (`app/api/mcp/[tenantKey]/route.ts` → `lib/mcp/tools.ts`),
   signed with the organization's Platform API Token.
2. **The CRM** — the platform's `/dm/api/crm/…` resources (persons,
   organizations, deals, pipelines, activities, tags) in Twenty's information
   architecture, shown in admissions vocabulary.
3. **Landing pages** — public prospect-facing forms at `/p/<org>/<slug>`
   (`app/(public)/…`), defined in the org's metadata, submitted to
   `app/api/public/forms/[tenantKey]/[slug]/route.ts`.

Multi-organization (the os.ibl.ai model — architecture B in vibe's
`docs/auth-model.md`): the organization is in the URL, `/platform/[tenantKey]/…`.

Skills: `npx skills add iblai/vibe --all`. Relevant ones: `iblai-api-crm`
(endpoint contract), `iblai-vibe-crm-overview` (roles, seeds),
`iblai-vibe-agent-chat` (the `Chat` surface), `iblai-api-agent-mcp` /
`iblai-api-agent-create` / `iblai-api-agent-prompt` (what `lib/recruit/agent.ts`
does), `iblai-api-org` (org metadata), `iblai-vibe-auth` → "Going multi-org",
`iblai-vibe-ops-build` / `-release` (native shells).

## Vocabulary — the one rule that bites

**Code keeps the CRM API nouns; the UI speaks admissions.** `Person`, `Deal`,
`Organization`, `pipeline`, `lead_value`, `markDealWon`, file and component
names, props — unchanged. Every user-visible string goes through
`lib/recruit/vocabulary.ts`:

| API noun     | UI noun                  | API noun              | UI noun                                              |
| ------------ | ------------------------ | --------------------- | ---------------------------------------------------- |
| Person       | Prospect                 | won / lost            | Enrolled / Withdrawn                                 |
| Organization | School (CRM record only) | `lead_value`          | Est. net tuition                                     |
| Deal         | Application              | `expected_close_date` | Decision deadline                                    |
| Pipeline     | Funnel                   | `job_title`           | Intended program                                     |
| Lead source  | Source                   | activity `lunch`      | Visit                                                |
| Owner        | Counselor                | lifecycle stages      | Inquiry → Engaged → Applicant → Enrolled · Withdrawn |

The ibl.ai _tenant_ stays "organization" (switcher, Users & roles). Routes:
`/prospects`, `/schools`, `/applications`, `/activities`, `/landing-pages`,
`/dashboard`, `/tags`, `/settings`. Extra recruitment fields live in each
record's `metadata`, defined once in `lib/recruit/fields.ts` (`PROSPECT_FIELDS`,
`APPLICATION_FIELDS`, `withMeta`, `metaLabel`) — add a field there and it
appears in dialogs, record pages, tools and the landing-page mapping.

## Rules

1. **Organization from the URL.** Never hard-code a tenant. `useSession().tenantKey`;
   links via `useSession().href(path)`.
2. **SDK components first** (`@iblai/iblai-js`: `Chat`, profile dropdown,
   notifications, Account / Management, invitations, tenant switching), then
   shadcn/ui (`components/ui`, Base UI — `render` prop, not `asChild`;
   `DropdownMenuLabel` inside a `DropdownMenuGroup`; `CommandDialog` needs its
   own `<Command>`; popover search inputs get `autoFocus`), custom last. Never
   restyle the SDK `Chat`; never remount it except through its `key`
   (see `components/recruit/chief-of-staff/chat.tsx`).
3. **CRM API is the contract.** Types `lib/crm/types.ts`, browser hooks
   `lib/crm/api.ts`, server client `lib/recruit/crm-server.ts`. Deal
   `status`/`closed_at` are server-managed — use `move-stage/`, `won/`, `lost/`.
   Reference stages and funnels by `code`, never by id, in anything persisted
   (landing pages, tools). Lists are page-numbered (`next_page`), max 100.
4. **Two credentials, never confused.** The browser's `dm_token`
   (`Authorization: Token`) — who is calling. The org's Platform API Token
   (`Authorization: Api-Token`, `IBLAI_API_KEY` / `IBLAI_API_KEYS`,
   `lib/iblai/platform.ts#apiKeyFor`) — server only, for public submissions,
   the agent's tools and agent setup. `RECRUIT_MCP_TOKEN` is the shared secret
   the platform presents to `/api/mcp/<org>`; compare it in constant time.
   Never print or log a token.
5. **Org settings = `metadata.apps.recruit`** (agent id, MCP server id,
   landing pages, branding). Public read, admin write, PUT replaces: always
   GET → `mergeRecruitSettings` → PUT (`lib/recruit/org-settings.ts`,
   `use-recruit-settings.ts`, `settings-server.ts`). Nothing secret goes there.
6. **Tools are the agent's hands.** Add a tool in `lib/mcp/tools.ts` with a
   precise description, a JSON-Schema `inputSchema`, `annotations`
   (`readOnlyHint` for reads), and a handler that returns a small JSON object.
   No deletes, no merges. Keep `systemPrompt()` in `lib/recruit/agent.ts` in
   step; re-running setup pushes it.
7. **Public pages stay public and small.** `app/(public)` must not import the
   SDK, Redux or anything that needs a session. Render only _published_ pages;
   unknown or draft pages show the neutral "not available" state. Submissions
   are validated against the stored definition, never against client input.
8. **Brand.** Primary `#0058cc`, tint `#eef6fc`, gradient CTA
   `className="ibl-button-primary"`, Lucide icons `strokeWidth={1.75}`, white
   cards with `border-[var(--border-color,#e5e7eb)]`. Pages are client
   components: `<PageHeader/>` then `<div className="flex-1 overflow-auto">`.
   No dark mode unless asked. Landing pages use the institution's accent color
   from Settings → Branding, not the app brand.
9. **Verify before you say it works:** `pnpm typecheck && pnpm lint && pnpm test
&& pnpm build`; open the page; screenshot it. Journeys live in `e2e/journeys/`.
10. **Commits:** conventional messages; never `--no-verify`.

## Where things are

| Concern                                  | File                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Config, env, service URLs                | `lib/iblai/config.ts`                                                                                        |
| Org resolution, admin check, hrefs       | `lib/iblai/tenant.ts`, `hooks/use-session.ts`                                                                |
| Server: Api-Token per org, verify caller | `lib/iblai/platform.ts`                                                                                      |
| Provider chain (+ service worker)        | `providers/iblai-providers.tsx`                                                                              |
| Vocabulary · recruitment fields          | `lib/recruit/vocabulary.ts`, `lib/recruit/fields.ts`                                                         |
| Org settings namespace                   | `lib/recruit/org-settings.ts` · `use-recruit-settings.ts` · `settings-server.ts`                             |
| Chief of Staff: prompt + setup           | `lib/recruit/agent.ts`, `app/api/admin/agent/route.ts`, `scripts/setup-agent.ts`                             |
| Chief of Staff: UI                       | `components/recruit/chief-of-staff/*` (chat, brief, assistant-panel, setup-card)                             |
| MCP server + tools                       | `lib/mcp/protocol.ts`, `lib/mcp/tools.ts`, `app/api/mcp/[tenantKey]/route.ts`                                |
| Server CRM client                        | `lib/recruit/crm-server.ts`                                                                                  |
| Landing pages: model, submission         | `lib/recruit/landing-pages.ts`, `lib/recruit/submission.ts`, `app/api/public/forms/…`                        |
| Landing pages: UI                        | `components/landing/*` (public), `components/recruit/landing-pages/*` (editor), `app/(app)/…/landing-pages/` |
| CRM data (browser)                       | `lib/crm/api.ts`, `lib/crm/types.ts`, `lib/crm/format.ts`                                                    |
| Shell                                    | `app/(app)/platform/[tenantKey]/layout.tsx`, `components/crm/app-sidebar.tsx`, `top-bar.tsx`                 |
| Record widgets                           | `components/crm/*.tsx` (tag picker, counselor select, inline fields, timeline)                               |
| Native shell                             | `src-tauri/`                                                                                                 |
