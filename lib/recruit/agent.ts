/**
 * The Chief of Staff — the agent every member of the recruitment team talks
 * to. This module holds its identity (name, system prompt, suggested
 * prompts) and the idempotent setup procedure that creates it on the ibl.ai
 * platform, points it at this app's MCP tool server, and records its id in
 * the organization's metadata so every member's app finds it.
 *
 * Endpoints follow the vibe skills `iblai-api-agent-create`,
 * `iblai-api-agent-prompt`, `iblai-api-agent-mcp` and `iblai-api-org`.
 * Server-only (uses the org's Platform API Token). Relative imports on
 * purpose: vitest and the CLI resolve no `@/` alias.
 */
import { platformFetch, PlatformError } from "../iblai/platform";
import { mergeRecruitSettings, readRecruitSettings, type RecruitSettings } from "./org-settings";
import { RECRUIT_TOOLS } from "../mcp/tools";

export const AGENT_NAME = "Chief of Staff";
export const AGENT_DESCRIPTION =
  "Your recruitment team's chief of staff: knows every prospect, school and application, keeps the funnel moving, drafts outreach, and briefs you every morning.";

export const SUGGESTED_PROMPTS = [
  "Give me today's brief.",
  "Which applications have stalled, and who should follow up?",
  "Who are our new inquiries this week and where did they come from?",
  "Draft a warm follow-up email to admitted students who haven't deposited.",
  "Create a landing page for the Fall open house.",
  "Show me every applicant from Lincoln High School.",
];

/** What the agent is told about itself and the tools. Kept readable: admins may edit it in the OS. */
export function systemPrompt(institutionName = "the university"): string {
  return `You are the Chief of Staff for ${institutionName}'s recruitment and admissions team. Every counselor, recruiter, operations lead and director talks to you, and you work inside their CRM through tools.

## What you are for
- Keep the admissions funnel moving: surface what needs attention, who is stalled, which deadlines are near, and who has not been contacted.
- Save the team time: look things up, log calls and visits, schedule follow-ups, open and move applications, tag records, and draft outreach in the institution's voice.
- Brief leadership: give crisp numbers by funnel stage, by counselor, by source and by term, and say what changed and what you recommend.

## How to work
- Start from data, not memory. Call daily_brief for any "how are we doing / what needs attention" question; call search_prospects, get_prospect, list_applications, list_tasks before answering about specific people or numbers. Quote ids only when the user needs them.
- Funnels and stages are referenced by stable codes from list_funnels — look them up instead of guessing. Lifecycle stages of a prospect are Inquiry → Engaged → Applicant → Enrolled (or Withdrawn).
- Before creating a prospect, search for them by email or name so you do not create duplicates. If you find a likely duplicate, say so instead of creating another record.
- Write actions (create, update, move, mark_enrolled, mark_withdrawn, log_activity, tag_record, create_landing_page) are real and visible to the whole team. Do them when the request is clear. When a request is ambiguous (which funnel? which program? which of two matching prospects?), ask one short question first. Never mark an application withdrawn without a reason.
- Landing pages you create stay unpublished until a human reviews them, unless the user explicitly asks to publish.
- When you draft emails or texts: warm, specific, short, in the institution's voice, with one clear next step. Offer to log the outreach as an activity once it is sent.
- Be concise. Lead with the answer or the number, then the detail. Use short bullet lists for more than two items. Use dates like "Thu Oct 16", never raw ISO strings, unless the user asks for data exports.
- Student data is sensitive (FERPA). Only discuss records with the signed-in team; never invent facts about a student; do not speculate about protected characteristics; when asked for something you cannot see in the CRM, say so.
- You cannot delete or merge records. Point the user to the record page in the app for that.

## Tools you have
${RECRUIT_TOOLS.map((t) => `- ${t.name}: ${t.description.split(". ")[0]}.`).join("\n")}`;
}

export interface SetupInput {
  org: string;
  /** Platform username whose authority the setup calls run under (an org admin). */
  username: string;
  /** Public origin of this app, e.g. https://recruit.example.edu */
  appUrl: string;
  /** Shared secret the platform presents to /api/mcp/<org>. */
  mcpToken: string;
  institutionName?: string;
  log?: (line: string) => void;
}

export interface SetupResult {
  agentId: string;
  mcpServerId: number;
  created: { agent: boolean; mcpServer: boolean; connection: boolean };
}

type MentorSettings = {
  unique_id?: string;
  tool_slugs?: string[] | null;
  mcp_servers?: Array<number | { id: number }> | null;
  can_use_tools?: boolean;
  system_prompt?: string;
  [k: string]: unknown;
};

const enc = encodeURIComponent;

/**
 * Create (or re-sync) the Chief of Staff for an organization. Safe to run
 * repeatedly: an existing agent id in the org's metadata is reused, the
 * prompt is refreshed, the MCP server is matched by URL, the connection is
 * matched by server, and the agent's tool lists are merged, never replaced
 * blindly (see `iblai-api-agent-mcp` — those lists are replaced on write).
 */
export async function setupChiefOfStaff(input: SetupInput): Promise<SetupResult> {
  const { org, username, log = () => {} } = input;
  const appUrl = input.appUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(appUrl)) throw new Error("appUrl must be an absolute http(s) origin");
  if (!input.mcpToken || input.mcpToken.length < 16)
    throw new Error("RECRUIT_MCP_TOKEN must be set to a random secret of at least 16 characters");
  const mentorBase = `/dm/api/ai-mentor/orgs/${enc(org)}/users/${enc(username)}`;
  const metaPath = `/dm/api/core/orgs/${enc(org)}/metadata/`;

  // 0. Current settings.
  const metaRes = await platformFetch<{ metadata?: Record<string, unknown> }>(metaPath, { org });
  const metadata = metaRes?.metadata ?? {};
  const settings: RecruitSettings = readRecruitSettings(metadata);
  const created = { agent: false, mcpServer: false, connection: false };

  // 1. The agent.
  let agentId = settings.agentId ?? "";
  if (agentId) {
    try {
      await platformFetch(`${mentorBase}/mentors/${enc(agentId)}/settings/`, { org });
      log(`Agent ${agentId} exists — reusing it.`);
    } catch (e) {
      if (e instanceof PlatformError && e.status === 404) {
        log(`Agent ${agentId} no longer exists — creating a new one.`);
        agentId = "";
      } else throw e;
    }
  }
  if (!agentId) {
    const agent = await platformFetch<{ unique_id: string }>(
      `${mentorBase}/mentor-with-settings/`,
      {
        org,
        method: "POST",
        body: {
          template_name: "ai-mentor",
          new_mentor_name: AGENT_NAME,
          display_name: AGENT_NAME,
          description: AGENT_DESCRIPTION,
          system_prompt: systemPrompt(input.institutionName),
        },
      },
    );
    agentId = agent.unique_id;
    created.agent = true;
    log(`Created agent ${agentId}.`);
  }

  // 2. Prompt + greeting (send only the changed keys).
  await platformFetch(`${mentorBase}/mentors/${enc(agentId)}/settings/`, {
    org,
    method: "PUT",
    body: { system_prompt: systemPrompt(input.institutionName) },
  });
  await platformFetch(`${mentorBase}/mentors/${enc(agentId)}/settings/`, {
    org,
    method: "PUT",
    body: { description: AGENT_DESCRIPTION },
  }).catch(() => undefined);

  // 3. The MCP server record that points back at this app.
  const serverUrl = `${appUrl}/api/mcp/${enc(org)}`;
  type McpServerRow = { id: number; url?: string; name?: string };
  const existing = await platformFetch<{ results?: McpServerRow[] } | McpServerRow[]>(
    `${mentorBase}/mcp-servers/?page_size=100&search=${enc("ibl.ai/recruit")}`,
    { org },
  );
  const rows = Array.isArray(existing) ? existing : (existing?.results ?? []);
  let server =
    rows.find((r) => r.url === serverUrl) ??
    (settings.mcpServerId ? rows.find((r) => r.id === settings.mcpServerId) : undefined);
  if (server && server.url !== serverUrl) {
    await platformFetch(`${mentorBase}/mcp-servers/${server.id}/`, {
      org,
      method: "PATCH",
      body: { url: serverUrl },
    });
    log(`Updated MCP server ${server.id} URL → ${serverUrl}.`);
  }
  if (!server) {
    server = await platformFetch<McpServerRow>(`${mentorBase}/mcp-servers/`, {
      org,
      method: "POST",
      body: {
        name: "ibl.ai/recruit tools",
        description:
          "Prospects, schools, applications, activities, tags and landing pages of the recruitment CRM.",
        url: serverUrl,
        transport: "streamable_http",
        auth_type: "token",
        auth_scope: "platform",
        is_enabled: true,
        is_featured: false,
        clean_output: false,
      },
    });
    created.mcpServer = true;
    log(`Registered MCP server ${server.id} at ${serverUrl}.`);
  }

  // 4. The platform-scoped connection carrying the shared secret.
  type ConnRow = { id: number; server?: number | { id: number }; scope?: string };
  const conns = await platformFetch<{ results?: ConnRow[] } | ConnRow[]>(
    `${mentorBase}/mcp-server-connections/?page_size=100`,
    { org },
  );
  const connRows = Array.isArray(conns) ? conns : (conns?.results ?? []);
  const serverId = server.id;
  const conn = connRows.find(
    (c) =>
      (typeof c.server === "object" ? c.server?.id : c.server) === serverId &&
      (c.scope ?? "platform") === "platform",
  );
  if (conn) {
    // Rotate the secret so the platform always holds the current token.
    await platformFetch(`${mentorBase}/mcp-server-connections/${conn.id}/`, {
      org,
      method: "PATCH",
      body: { credentials: input.mcpToken, authorization_scheme: "Bearer", is_active: true },
    });
    log(`Refreshed connection ${conn.id}.`);
  } else {
    await platformFetch(`${mentorBase}/mcp-server-connections/`, {
      org,
      method: "POST",
      body: {
        server: serverId,
        scope: "platform",
        auth_type: "token",
        credentials: input.mcpToken,
        authorization_scheme: "Bearer",
      },
    });
    created.connection = true;
    log("Created the platform-scoped connection.");
  }

  // 5. Wire the server onto the agent — merge, never replace.
  const current = await platformFetch<MentorSettings>(
    `${mentorBase}/mentors/${enc(agentId)}/settings/`,
    { org },
  );
  const toolSlugs = new Set<string>(Array.isArray(current.tool_slugs) ? current.tool_slugs : []);
  toolSlugs.add("mcp-tool");
  const mcpIds = new Set<number>(
    (Array.isArray(current.mcp_servers) ? current.mcp_servers : [])
      .map((s) => (typeof s === "object" ? s.id : s))
      .filter((n) => Number.isFinite(n)),
  );
  mcpIds.add(serverId);
  await platformFetch(`${mentorBase}/mentors/${enc(agentId)}/settings/`, {
    org,
    method: "PUT",
    body: { tool_slugs: [...toolSlugs], mcp_servers: [...mcpIds], can_use_tools: true },
  });
  log(`Agent tools: ${[...toolSlugs].join(", ")}; MCP servers: ${[...mcpIds].join(", ")}.`);

  // 6. Suggested prompts (best effort; the list endpoint may already have them).
  try {
    const list = await platformFetch<
      { results?: Array<{ prompt: string }> } | Array<{ prompt: string }>
    >(
      `/dm/api/search/orgs/${enc(org)}/users/${enc(username)}/prompts/?mentor=${enc(agentId)}&limit=50`,
      { org },
    );
    const have = new Set((Array.isArray(list) ? list : (list?.results ?? [])).map((p) => p.prompt));
    for (const prompt of SUGGESTED_PROMPTS) {
      if (have.has(prompt)) continue;
      await platformFetch(`/dm/api/ai-prompt/orgs/${enc(org)}/users/${enc(username)}/prompt/`, {
        org,
        method: "POST",
        body: { prompt, category: "Recruitment", is_system: false, mentor: agentId, platform: org },
      });
    }
    log("Suggested prompts in place.");
  } catch (e) {
    log(`Suggested prompts skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 7. Remember the ids where every member's app can read them.
  const latest = await platformFetch<{ metadata?: Record<string, unknown> }>(metaPath, { org });
  const merged = mergeRecruitSettings(latest?.metadata ?? {}, {
    agentId,
    mcpServerId: serverId,
    setupCompletedAt: new Date().toISOString(),
    ...(input.institutionName && { institutionName: input.institutionName }),
  });
  await platformFetch(metaPath, { org, method: "PUT", body: { metadata: merged } });
  log("Saved the agent id to the organization's metadata.");

  return { agentId, mcpServerId: serverId, created };
}
