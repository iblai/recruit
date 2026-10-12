# The Chief of Staff

The agent every member of the recruitment team talks to. It is an ordinary
ibl.ai agent — created from the platform's `ai-mentor` template, tuned in the
Agentic OS like any other — plus one thing only this app provides: a **tool
server** the agent calls to read and change the CRM.

## How it fits together

```
member ─► <Chat> (SDK, in-process) ─► ibl.ai agent runtime (LLM, memory, guardrails, analytics)
                                            │ decides to use a tool
                                            ▼
                               POST https://<app>/api/mcp/<org>      Authorization: Bearer <RECRUIT_MCP_TOKEN>
                                            │ JSON-RPC: tools/list · tools/call
                                            ▼
                               lib/mcp/tools.ts ─► CrmServer (Api-Token for <org>) ─► …/dm/api/crm/…
```

- `lib/mcp/protocol.ts` — a dependency-free MCP server over the Streamable
  HTTP transport in JSON mode (`initialize`, `ping`, `tools/list`, `tools/call`;
  notifications → 202; GET → 405). Unit-tested in `__tests__/mcp.test.ts`.
- `lib/mcp/tools.ts` — the 22 recruitment tools. Each has a precise
  description (what the model reads), a JSON-Schema `inputSchema`,
  `annotations` (`readOnlyHint` for reads) and a handler over `CrmServer`.
  Funnels and stages are referenced by stable `code`s. Nothing deletes or merges.
- `app/api/mcp/[tenantKey]/route.ts` — the endpoint. It checks the bearer
  secret in constant time, refuses when the server holds no Platform API Token
  for the org, and hands every tool a `ToolContext` bound to that org.
- `lib/recruit/agent.ts` — the agent's identity (`AGENT_NAME`,
  `systemPrompt()`, `SUGGESTED_PROMPTS`) and `setupChiefOfStaff()`.

## Setup

**In the app:** an org admin opens _Settings → Chief of Staff_ and clicks
**Set up**. The route `POST /api/admin/agent` verifies the caller is an admin
of the org (session token → `verifyCaller` → `isOrgAdmin`) and runs the
procedure with the org's Platform API Token.

**Headless:** `pnpm setup:agent --org <key> --username <admin> --app-url https://recruit.example.edu [--institution "Northfield University"]`
(reads `IBLAI_API_KEY` / `TOKEN`, `RECRUIT_MCP_TOKEN`, `NEXT_PUBLIC_APP_URL`
from `.env.local` / `iblai.env`).

The procedure is idempotent (`setupChiefOfStaff`):

1. Read the org's metadata; reuse `apps.recruit.agentId` if the agent still exists.
2. Otherwise `POST …/mentor-with-settings/` (template `ai-mentor`, name
   "Chief of Staff", the system prompt).
3. `PUT …/mentors/{id}/settings/` with `system_prompt` (only the changed key).
4. Find the MCP server record whose URL is `<appUrl>/api/mcp/<org>`, or
   register one (`transport: streamable_http`, `auth_type: token`,
   `auth_scope: platform`).
5. Find the platform-scoped connection for that server, or create it with
   `credentials: RECRUIT_MCP_TOKEN`, `authorization_scheme: Bearer`; on re-runs
   the credential is rotated to the current secret.
6. **Merge** `mcp-tool` into the agent's `tool_slugs` and the server id into
   `mcp_servers` (those lists are replaced on write — never send them blindly).
7. Add the suggested prompts that are missing.
8. Save `agentId`, `mcpServerId`, `setupCompletedAt`, `institutionName` under
   `apps.recruit` in the org's metadata (GET → merge → PUT).

Prerequisites the Settings tab checks for you: a Platform API Token for the
org on the server (`IBLAI_API_KEY` or an `IBLAI_API_KEYS` entry),
`RECRUIT_MCP_TOKEN` set (≥ 16 chars; use `openssl rand -hex 32`), and a public
**https** `NEXT_PUBLIC_APP_URL` the platform can reach (the agent runtime
calls your deployment; `localhost` works only for the UI, not for tools).

## Tuning

Everything about the agent that is not the tool wiring lives in the OS:
_Settings → Chief of Staff → Tune in the Agentic OS_ opens
`https://os.ibl.ai/platform/<org>/<agentId>`. Change the LLM, add datasets
(your viewbook, program sheets, scholarship rules), enable memory, adjust
safety and privacy, review transcripts and costs. Re-running setup refreshes
the system prompt and tool wiring and keeps your changes.

To pin a specific agent at build time set `NEXT_PUBLIC_DEFAULT_AGENT_ID`; it
wins over the org's metadata.

## Adding a tool

1. Add a `ToolDefinition` to `RECRUIT_TOOLS` in `lib/mcp/tools.ts`: a name in
   `snake_case`, a description that says _when_ to use it, a JSON-Schema
   `inputSchema` with `additionalProperties: false`, `annotations`, a handler
   returning a small JSON object (or `errorResult("…")` for a user-facing
   problem).
2. Use `CrmServer` methods; add one in `lib/recruit/crm-server.ts` if missing.
3. Cover it in `__tests__/mcp.test.ts` with a fake `crm`.
4. The system prompt lists tools automatically; re-run setup to push it.

## Troubleshooting

| Symptom                                  | Likely cause                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home shows the setup card for everyone   | No `apps.recruit.agentId` in the org's metadata — run setup as an admin                                                                                                    |
| "Set up" button disabled                 | Server lacks `IBLAI_API_KEY`/`IBLAI_API_KEYS` for the org, or `RECRUIT_MCP_TOKEN` is unset                                                                                 |
| Agent answers but never uses tools       | `mcp-tool` missing from `tool_slugs` or the server id missing from `mcp_servers` — re-run setup                                                                            |
| Chat shows a 503 "warning" about tools   | The platform cannot reach `<appUrl>/api/mcp/<org>` (not https, firewall) or the bearer secret differs — check `NEXT_PUBLIC_APP_URL`, re-run setup to rotate the credential |
| `401` from `/api/mcp/<org>` in your logs | Bearer token mismatch — the platform holds an old secret; re-run setup                                                                                                     |
| `503` from `/api/mcp/<org>`              | No Platform API Token on the server for that org                                                                                                                           |
| Tools work in one org, not another       | Multi-institution deployment: add the org to `IBLAI_API_KEYS`                                                                                                              |

Smoke-test the endpoint without the platform:

```bash
curl -s -X POST "$NEXT_PUBLIC_APP_URL/api/mcp/<org>" \
  -H "Authorization: Bearer $RECRUIT_MCP_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```
