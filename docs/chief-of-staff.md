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
                               POST https://<app>/api/mcp/<org>      Authorization: Bearer <recruit-tools key>
                                            │ JSON-RPC: tools/list · tools/call
                                            ▼
                               lib/mcp/tools.ts ─► CrmServer (Api-Token <same key>) ─► …/dm/api/crm/…
```

- `lib/mcp/protocol.ts` — a dependency-free MCP server over the Streamable
  HTTP transport in JSON mode (`initialize`, `ping`, `tools/list`, `tools/call`;
  notifications → 202; GET → 405). Unit-tested in `__tests__/mcp.test.ts`.
- `lib/mcp/tools.ts` — the 22 recruitment tools. Each has a precise
  description (what the model reads), a JSON-Schema `inputSchema`,
  `annotations` (`readOnlyHint` for reads) and a handler over `CrmServer`.
  Funnels and stages are referenced by stable `code`s. Nothing deletes or merges.
- `app/api/mcp/[tenantKey]/route.ts` — the endpoint. The bearer the platform
  presents is the `recruit-tools` key setup minted; every tool forwards it as
  `Api-Token`, so the platform authorizes each call and the key's own
  organization bounds it. No bearer → 401; at most 10 messages per request.
- `lib/recruit/agent.ts` — the agent's identity (`AGENT_NAME`,
  `systemPrompt()`, `SUGGESTED_PROMPTS`) and `setupChiefOfStaff()`.

## Setup

**In the app:** an org admin opens _Settings → Chief of Staff_ and clicks
**Set up**. The route `POST /api/admin/agent` verifies the caller's session
(`verifyCaller`) and runs the procedure as them, so the platform refuses
anyone who does not administer the org.

The procedure is idempotent (`setupChiefOfStaff`):

1. Read the org's metadata; reuse `apps.recruit.agentId` if the agent still exists.
2. Otherwise `POST …/mentor-with-settings/` (template `ai-mentor`, name
   "Chief of Staff", the system prompt).
3. `PUT …/mentors/{id}/settings/` with `system_prompt` (only the changed key).
4. Find the MCP server record whose URL is `<appUrl>/api/mcp/<org>`, or
   register one (`transport: streamable_http`, `auth_type: token`,
   `auth_scope: platform`).
5. Mint the tools' key — `DELETE /api/core/platform/api-tokens/recruit-tools?platform_key=<org>`
   (no trailing slash; 404 is fine), look up the platform's **CRM User**
   policy (`GET /api/core/rbac/policies/?name=CRM%20User`, exact name), and
   `POST /api/core/platform/api-tokens/` `{ name: "recruit-tools", platform_key,
   mode: "token_policies", policies_to_add: [<id>] }`. A probe
   (`GET /api/crm/pipelines/?page_size=1` with the key) confirms the CRM takes
   it; where it does not (RBAC off), or there is no such policy, the key is
   replaced by an owner-mode one (`{ name, platform_key }`). The key goes into
   the server's platform-scoped connection (`credentials: <key>`,
   `authorization_scheme: Bearer`), creating the connection if needed. It is
   never logged and the app keeps no copy; re-runs rotate it.
6. **Merge** `mcp-tool` into the agent's `tool_slugs` and the server id into
   `mcp_servers` (those lists are replaced on write — never send them blindly).
7. Add the suggested prompts that are missing.
8. Save `agentId`, `mcpServerId`, `toolsAccess` (`crm-user` or `owner`),
   `setupCompletedAt`, `institutionName` under `apps.recruit` in the org's
   metadata (GET → merge → PUT).

The one prerequisite, checked by the Settings tab: a public **https**
`NEXT_PUBLIC_APP_URL` the platform can reach (the agent runtime calls your
deployment; `localhost` works only for the UI, not for tools).

## Whose authority the tools carry

Where the platform enforces RBAC, every tool call acts with the **CRM User**
role: `recruit-tools` is a `token_policies` key holding that policy only, so
it reaches the CRM (prospects, schools, applications, activities, tags,
landing pages, the member list) and nothing else on the platform. Where RBAC
is off the CRM takes no scoped key, and the tools act as the admin who last
ran setup (an owner-mode key); _Settings → Chief of Staff_ says which. Either
way the agent runtime never forwards the chatting member's own credential. An
owner key fails once its admin loses admin rights or leaves the organization,
until another admin re-runs setup. The key never expires; to retire the Chief
of Staff, delete `recruit-tools` in OS → Admin → Integrations → APIs.

**Upgrading from a version with `RECRUIT_MCP_TOKEN`:** tools answer 401 until
an admin re-runs setup once. Then remove `IBLAI_API_KEY`, `IBLAI_API_KEYS`,
`IBLAI_USERNAME` and `RECRUIT_MCP_TOKEN` from the deployment and revoke the
old key in the OS (it never expires).

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

| Symptom                                      | Likely cause                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Home shows the setup card for everyone       | No `apps.recruit.agentId` in the org's metadata — run setup as an admin                                                         |
| "Set up" button disabled                     | You are not an admin of this organization, or the status could not load                                                         |
| Agent answers but never uses tools           | `mcp-tool` missing from `tool_slugs` or the server id missing from `mcp_servers` — re-run setup                                 |
| Chat shows a warning about tools             | The platform cannot reach `<appUrl>/api/mcp/<org>` (not https, firewall) — check `NEXT_PUBLIC_APP_URL` and re-run setup         |
| `401` from `/api/mcp/<org>` in your logs     | The call carried no bearer — the connection holds no key; re-run setup                                                          |
| Tools answer "Platform request failed (401)" | The key was deleted, its admin left the organization, or this deployment still holds the old `RECRUIT_MCP_TOKEN` — re-run setup |
| Tools answer "Platform request failed (403)" | The admin who ran setup lost admin rights, or the platform's CRM User policy lost a permission — another admin re-runs setup    |

Smoke-test the endpoint without the platform (`$TOKEN` is any Platform API
Token of that organization; a `tools/call` acts with what the key may do):

```bash
curl -s -X POST "$NEXT_PUBLIC_APP_URL/api/mcp/<org>" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```
