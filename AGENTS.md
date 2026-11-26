# AGENTS.md — ibl.ai/recruit

Guidance for AI assistants (Claude Code, Cursor, Codex…) working in this
repository. `CLAUDE.md` is a symlink to this file.

## What this is

ibl.ai/recruit is a **university recruitment / admissions CRM** on the ibl.ai
platform, built with the [iblai/vibe](https://github.com/iblai/vibe) toolkit
and derived from [iblai/crm](https://github.com/iblai/crm). Four things make
it what it is:

1. **The Chief of Staff** — an ibl.ai agent every team member talks to. Home
   is the conversation (`app/(app)/platform/[tenantKey]/page.tsx`); a side
   panel offers it on every other page. The agent acts through this app's own
   MCP tool server (`app/api/mcp/[tenantKey]/route.ts` → `lib/mcp/tools.ts`)
   with the `recruit-tools` key agent setup mints.
2. **The CRM** — the platform's `/dm/api/crm/…` resources (persons,
   organizations, deals, pipelines, activities, tags) in a modern CRM's
   information architecture, shown in admissions vocabulary. Recruit sees
   only its own records (`app=recruit`, crm 1.4.0): the organization's own
   CRM and other apps never show, and never see recruit's. The one exception
   is a student a person kept from a social channel, also copied into the CRM
   app's records (rule 12).
3. **Landing pages** — public prospect-facing pages at `/p/<org>/<slug>`
   (`app/(public)/…`), each a CRM web form on the platform
   (`/dm/api/crm/web-forms/`, crm 1.4.0). Visitors submit straight to
   the platform's public endpoint, which files the prospect, the application,
   tags and a note — no credential involved.
4. **Recruit** — the agent prospective students talk to without signing in, as
   <https://sovereignuniversity.ai/recruit> describes it: in a frame on every
   landing page, at `/chat/<org>` (`app/(embed)/…`), or through
   `public/embed.js` on the university's own site. It answers from the
   sources an admin gives it; where this app has a public https address it
   also signs people up for event pages and hands over to a counselor,
   through its own narrow tool server
   (`app/api/mcp/[tenantKey]/recruit/route.ts` → `lib/mcp/student-tools.ts`)
   with the `recruit-student-tools` key. Its ids sit beside the Chief of
   Staff's in the org settings (`studentAgentId`, …).

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
Recruit adds `/needs-you`, `/conversations`, `/scoreboard` and `/recruit`, and
the Settings tabs Schedule and Connectors.

## Rules

1. **Organization from the URL.** Never hard-code a tenant. `useSession().tenantKey`;
   links via `useSession().href(path)`.
2. **SDK components first** (`@iblai/iblai-js`: `PlatformSidebar` + `SidebarProvider`/`SidebarInset`/`useSidebar` from `/web-containers/next` for the shell, `Chat`, profile dropdown,
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
   Find records with the platform's filters (`?primary_email=`,
   `?name__iexact=`, `?code=`, `?search=`, `/search/`) and keep an equality
   check on the result; edit `metadata` with the merge patch
   (`PATCH …/{id}/metadata/`, `metaPatch`), not a whole-object PATCH. A
   created-at window takes `start_date` and `end_date` together: either one
   alone is a 400.
   Every CRM call carries `app=recruit` (`lib/crm/app.ts`, added in the two
   clients above): recruit writes only once `/overview/` echoes it, refuses
   any record not its own, and `CrmScopeGate` says so on every page.
   `lib/recruit/crm-app.ts` is the only code that calls with no `app`: it
   writes the CRM app's copy of a kept student (its tags and a note), and reads
   there only to find that copy, refusing any row whose `app` is not blank. A
   new organization has no funnel; Applications offers _Set up admissions_
   (`lib/recruit/admissions.ts`, also the seed's).
4. **The server holds no credential.** The browser's `dm_token`
   (`Authorization: Token`) says who is calling, and admin routes act as the
   caller — the platform enforces their rights. The tools act with the
   `recruit-tools` Platform API Token setup mints with the admin's session —
   scoped to the CRM User policy where RBAC is on, owner mode where it is off;
   the platform presents it to `/api/mcp/<org>` as `Bearer` and the route
   forwards it as `Api-Token`, so tools touch the CRM only. `platformFetch`
   takes the Authorization explicitly. No env file holds a secret; the CLI asks
   for one. Never print or log a token.
5. **Org settings = `metadata.apps.recruit`** (agent id, MCP server id,
   tools access, branding). Public read, admin write. PUT merges into what is stored, nested
   objects too, so a key is unset by writing `null` (the `remove` argument of
   `mergeRecruitSettings`): always GET → `mergeRecruitSettings` → PUT (`lib/recruit/org-settings.ts`,
   `use-recruit-settings.ts`, `settings-server.ts`). Nothing secret goes there.
6. **Tools are the agent's hands.** Add a tool in `lib/mcp/tools.ts` with a
   precise description, a JSON-Schema `inputSchema`, `annotations`
   (`readOnlyHint` for reads), and a handler that returns a small JSON object.
   No deletes, no merges. Keep `systemPrompt()` in `lib/recruit/agent.ts` in
   step; re-running setup pushes it.
7. **Public pages stay public and small.** `app/(public)` must not import the
   SDK, Redux or anything that needs a session. Render only _published_ pages
   (the platform's public read serves nothing else); unknown or draft pages
   show the neutral "not available" state.
8. **Brand.** Primary `#0058cc`, tint `#eef6fc`, gradient CTA
   `className="ibl-button-primary"`, white cards with
   `border-[var(--border-color,#e5e7eb)]`. The house shell: Open Sans on the
   body and the SDK sidebar (`app/layout.tsx`, `--font-sans` in `globals.css`);
   the top bar in the OS's type (`components/crm/top-bar.tsx`: 64 px, a
   `#D0E0FF` hairline, the system font, 14 px medium `#646464`); Lucide renders
   at 1.75 through `globals.css`, no `strokeWidth` prop; dialog titles, labels
   and table heads carry the house classes in `components/ui`, never at the call
   site. Pages are client components: `<PageHeader/>` then
   `<div className="flex-1 overflow-auto">`. No dark mode unless asked. Landing
   pages use the institution's accent color from Settings → Branding, not the
   app brand.
9. **Verify before you say it works:** `pnpm typecheck && pnpm lint && pnpm
   format:check && pnpm test && pnpm build`; then `/iblai-vibe-ops-test`'s touch
   test: the page in a real browser (Claude in Chrome, or the `chrome-devtools`
   server in `.mcp.json`), every control you added, the console, the phone
   width; no browser tool → say so, never call it tested. Journeys live in
   `e2e/journeys/`.
10. **Commits:** conventional messages; never `--no-verify`.
11. **The public agent's boundary is code, not the prompt.** A visitor drives
    the model, so in `lib/mcp/student-tools.ts`: no tool returns a person's
    data; an existing person's fields never change from chat (a note is added;
    the one exception is an opt-out, which only reduces contact); every
    argument has a length and format limit; writes are capped; a platform
    error never reaches the model. The route proves the key before it
    dispatches. Its tools are its own server and nothing else: setup replaces
    the list, because a connector there would act for a visitor with a staff
    member's credentials, and turns off the template's virtual machine, memory
    and sub-agents on every run. Without a public https address it gets no key
    and no tools, and its prompt says so. `setupRecruit` refuses a platform
    that cannot limit keys by role when it connects tools, and the community
    platform.
12. **Nothing is sent or published without a person's press.** An agent's
    message is a draft (`queue_message`, `queue_event_messages`, `book_visit`)
    under Needs you. A person sends it from their own mail or phone or the
    university's social account, or presses Approve and send, for one email or
    for a batch listed in full: `app/api/admin/messages/send` relays each email
    through the outbox (`lib/recruit/outbox.ts`), a second agent whose only
    tool is the mail connector an admin chose. The Chief of Staff, which plans
    outreach, reads strangers' posts and runs on a schedule, never holds a send
    tool (`setupOutbox` takes the connector off it), and a page it creates is a
    draft a person publishes. Who is due a message, on which channel and how
    often is code (`lib/recruit/outreach.ts`: a cadence per stage, and a daily
    allowance of drafts from Settings → Schedule), never the prompt. A student
    found on a social channel (`CHANNELS` in `lib/recruit/found.ts`:
    Instagram, Reddit, X, YouTube) comes in only when a person picks them from
    a `shortlist_found_students` shortlist (the tool creates no person), and
    is written to once, there, by hand: `contactRefusal` refuses them email
    and text, and refuses anyone found on YouTube, which has no direct
    messages, everything. A kept student gets the tag "Found on <channel>" and
    a copy in the CRM app (`/api/admin/prospects/found-sync`, at the pick).
    A Do not contact goes one way, to less contact: Recruit marks the copy,
    from the record page and from the public agent, and never unmarks it; a
    student kept again whose copy is marked is marked in Recruit too. Their
    public profile on that channel, and nothing else,
    can be read into their record (`enrich_found_prospect`, which the Enrich
    button asks for through `/api/admin/prospects/enrich`). A saved search
    (Settings → Schedule) is a platform task that runs the Chief of Staff with
    `findingPrompt`; every run ends in a shortlist a person reviews. A contact with a published work address comes in through
    `add_found_prospects` and is written to by email. Both tools refuse until
    an admin wrote the basis in Settings → Connectors (`foundBasis`), and every
    message to someone found carries a line the code adds saying who is
    writing and how to stop.
13. **What Recruit leaves is a CRM activity with a marker.** A handoff is an
    open `task` with `metadata.handoff`, a follow-up an open activity with
    `metadata.follow_up`, a chat booking a `lunch` with `metadata.booking`;
    an event's applications carry `metadata.event`. A follow-up gains
    `approved`, then `sent` or `failed`, when it goes through the outbox; the
    code stamps the cadence `step` it answers, and a discarded draft becomes a
    done `note` with `discarded`, so it is not drafted again. A shortlist is an
    open `task` with `metadata.shortlist` on the School record "Students found
    on social channels" (an activity must hang off a record), emptied when a
    person reviews it or after 14 days; a reviewed one keeps the handles of
    those passed over (`metadata.passed`, `platform:handle` and nothing
    else) so new shortlists leave them out, until `expireShortlists` removes
    them after 90 days. A found person carries `metadata.found` (source,
    basis, when; for a social channel the platform, the handle and what they
    said; `found.profile` once their profile was read), and Do not contact is
    `metadata.opted_out`. Lists ask the platform (`metadata__has_key`), never
    filter in the browser. Helpers: `lib/recruit/follow-ups.ts`,
    `lib/recruit/found.ts`.
14. **A chat is tied to a person by its session id.** The public page puts
    `conversation: <session id>` in the chat's context metadata
    (`chatActions.setIframeContext`; the installed SDK ignores
    `MENTOR:CONTEXT_UPDATE`), the agent passes it to its tools, and they keep
    it in `person.metadata.conversations`. It is a label, never a way to read.
15. **The public chat is its own route group.** `app/(embed)` mounts the SDK
    `Chat` with the two contexts it reads and no session; rule 7 still holds
    for `app/(public)`, which shows the chat in a frame. What a visitor reads
    comes from `messages/` through `lib/recruit/locale.ts`, by
    `Accept-Language`. `proxy.ts` lets this app's own pages and the
    organization's `websiteOrigins` frame `/chat/*`, and nobody else.
16. **Ad tags are the university's, and checked before they run.** A Google
    tag ID, an Ads conversion label and a Meta Pixel ID (Settings → Branding)
    are format-checked in `lib/recruit/ad-tags.ts` before they reach a script
    address. They load on `/p/*` only, for a platform that set them, never
    inside the chat frame, and `proxy.ts` names their hosts in the policy for
    that platform's pages alone. An ad's click ID travels with the sign-up as
    `utm_gclid`, `utm_fbclid`, …: the platform keeps only `utm_*` keys.
17. **A headless turn with an agent goes to `/api/mentor/chat/`.** `askAgent`
    (`lib/recruit/draft-page.ts`) is the one way the server asks an agent
    something: a page from a brief, an approved email. The gateway in front
    of the realtime host answers its own 403 for `/api/agent/chat/`.

## Where things are

| Concern                               | File                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Config, env, service URLs             | `lib/iblai/config.ts`                                                                                                              |
| Org resolution, admin check, hrefs    | `lib/iblai/tenant.ts`, `hooks/use-session.ts`                                                                                      |
| Server: platform fetch, verify caller | `lib/iblai/platform.ts`                                                                                                            |
| Provider chain (+ service worker)     | `providers/iblai-providers.tsx`                                                                                                    |
| Vocabulary · recruitment fields       | `lib/recruit/vocabulary.ts`, `lib/recruit/fields.ts`                                                                               |
| Org settings namespace                | `lib/recruit/org-settings.ts` · `use-recruit-settings.ts` · `settings-server.ts`                                                   |
| Chief of Staff: prompt + setup        | `lib/recruit/agent.ts`, `app/api/admin/agent/route.ts`                                                                             |
| Chief of Staff: UI                    | `components/recruit/chief-of-staff/*` (chat, brief, assistant-panel, setup-card)                                                   |
| MCP server + tools                    | `lib/mcp/protocol.ts`, `lib/mcp/tools.ts`, `app/api/mcp/[tenantKey]/route.ts`                                                      |
| Server CRM client                     | `lib/recruit/crm-server.ts`                                                                                                        |
| Landing pages: model · web forms      | `lib/recruit/landing-pages.ts` · `use-landing-pages.ts` · `settings-server.ts` (public read)                                       |
| Landing pages: UI                     | `components/landing/*` (public), `components/recruit/landing-pages/*` (editor), `app/(app)/…/landing-pages/`                       |
| CRM data (browser)                    | `lib/crm/api.ts`, `lib/crm/types.ts`, `lib/crm/format.ts`                                                                          |
| Recruit's records only (app scope)    | `lib/crm/app.ts`, `components/crm/scope-gate.tsx`                                                                                  |
| Shell                                 | `app/(app)/platform/[tenantKey]/layout.tsx`, `components/crm/app-sidebar.tsx`, `top-bar.tsx`                                       |
| Record widgets                        | `components/crm/*.tsx` (tag picker, counselor select, inline fields, timeline)                                                     |
| Native shell                          | `src-tauri/`                                                                                                                       |
| Recruit: prompt + setup               | `lib/recruit/agent.ts` (`setupRecruit`), `app/api/admin/agent/route.ts`                                                            |
| Recruit: public tools                 | `lib/mcp/student-tools.ts`, `app/api/mcp/[tenantKey]/recruit/route.ts`                                                             |
| Recruit: the public chat              | `app/(embed)/chat/[tenantKey]/page.tsx`, `components/chat/public-chat.tsx`, `public/embed.js`, `proxy.ts`                          |
| Recruit: its page in the app          | `app/(app)/…/recruit/page.tsx`, `components/recruit/agent-frame.tsx`                                                               |
| Needs you: handoffs, follow-ups       | `app/(app)/…/needs-you/`, `lib/recruit/use-needs-you.ts`, `follow-ups.ts`, `components/recruit/needs-you/`                         |
| Conversations · scoreboard            | `app/(app)/…/conversations/`, `app/(app)/…/scoreboard/page.tsx`, `lib/recruit/scoreboard.ts`                                       |
| Event pages · a page from a brief     | `lib/recruit/landing-pages.ts`, `lib/recruit/draft-page.ts`, `app/api/admin/pages/draft/route.ts`                                  |
| Taster courses                        | `lib/recruit/landing-pages.ts` (`course`), `components/recruit/landing-pages/lessons-editor.tsx`                                   |
| Finding students on social channels   | `lib/recruit/found.ts`, `lib/recruit/connectors.ts`, `components/recruit/needs-you/shortlist-dialog.tsx`                           |
| Where students are talking            | `lib/recruit/scoreboard.ts` (`chatter`), `app/(app)/…/scoreboard/page.tsx`                                                         |
| Saved searches                        | `lib/recruit/schedule.ts` (`findingPrompt`), `components/recruit/settings/saved-searches.tsx`                                      |
| A kept student in the CRM app         | `lib/recruit/crm-app.ts`, `app/api/admin/prospects/found-sync/`                                                                    |
| Reading a kept student's profile      | `lib/mcp/tools.ts` (`enrich_found_prospect`), `app/api/admin/prospects/enrich/`, `components/recruit/found-card.tsx`               |
| Public words and locale               | `messages/*.json`, `lib/recruit/locale.ts`                                                                                         |
| Outreach: who is due, cadence, limits | `lib/recruit/outreach.ts`, `lib/mcp/tools.ts` (`list_outreach_due`, `queue_message`, `add_found_prospects`)                        |
| Outreach: the daily run               | `lib/recruit/schedule.ts`, `components/recruit/settings/schedule-tab.tsx`                                                          |
| Sending an approved email             | `lib/recruit/outbox.ts`, `app/api/admin/outbox/`, `app/api/admin/messages/send/`, `components/recruit/settings/connectors-tab.tsx` |
| Ad tags on landing pages              | `lib/recruit/ad-tags.ts`, `components/landing/ad-tags.tsx`, `components/recruit/settings/branding-tab.tsx`, `proxy.ts`             |
| Demo: catalog, open house, seed       | `demo/catalog/*.md`, `lib/recruit/demo-data.ts`, `scripts/seed-demo.ts`                                                            |

## What Recruit does not do

It sends no text and makes no call, and no email leaves without a person
pressing Approve and send, on that message or on a batch that lists it; the app
cannot see the mailbox, so "sent" is what the outbox reported. It sends no
direct message or comment on a social channel and signs in to none: a staff
member sends the one message to a student found there, by hand, from the
university's account, and nobody found that way is written to again unless
they sign up. It looks no one up on other sites: a profile read is of the channel where the
person was found, nothing else. The CRM app's copy goes one way: Recruit writes
it at the pick and its Do not contact after, and edits in the CRM app never
come back. Searching X needs a paid Apify plan. A taster course is a public
page, not a course on the learning platform. What a search found stays in the
Chief of Staff's chat history and the platform's audit log, which platform
admins can read: the CRM keeps only the people a person picked, and the app can
erase neither. Only an admin can send through the
outbox: a counselor sends from their own mail. It ships no scraper: what a
connector collects, and from where, is the university's choice. A counselor is
alerted in the app only: the platform sends no CRM notification for an app's
own records. Ad tags load for every visitor: there is no consent prompt yet.
A returning visitor does not see their earlier messages. No quiet hours; no
Slate, Salesforce or Banner connector. The scoreboard counts applications
completed, deposits and melt from the "Stage changed" notes the platform
writes, so a stage edited directly or an application created at a stage is
not counted; it says "Not recorded" for aid forms, because the funnel has no
aid stage.
