import { NextResponse, type NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import { jsonBody, platformFailure, platformFetch, verifyCaller } from "@/lib/iblai/platform";
import { setupChiefOfStaff, setupRecruit } from "@/lib/recruit/agent";
import { connectorOf, type Connector } from "@/lib/recruit/connectors";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * Agent setup, run by an org admin: the Chief of Staff from Settings, Recruit
 * from its own page.
 *
 * GET  ?org=<key>  — the agents currently recorded for the org and the public
 *                    app URL the platform will call back on. Any signed-in
 *                    member may read it. `connectors` is what the Chief of
 *                    Staff holds, or null when the platform does not give it.
 * POST { org, agent?, institutionName?, voice?, appUrl? } — create / re-sync
 *                    one agent (`agent: "recruit"`, else the Chief of Staff),
 *                    its MCP server + connection, and save the ids. Runs as
 *                    the caller (their own session token), so the platform
 *                    refuses anyone who does not administer the org;
 *                    idempotent.
 * PATCH { org, connectorId } — let the Chief of Staff use the own key of a
 *                    pinned Apify connector it holds, as the caller.
 */
export const dynamic = "force-dynamic";

/** The connectors on an agent, as the caller may see them; null when the platform does not give them. */
async function connectorsOn(
  org: string,
  caller: { username: string; token: string },
  agentId: string,
): Promise<Connector[] | null> {
  if (!agentId) return [];
  const enc = encodeURIComponent;
  try {
    const settings = await platformFetch<{ mcp_servers?: unknown }>(
      `/dm/api/ai-mentor/orgs/${enc(org)}/users/${enc(caller.username)}/mentors/${enc(agentId)}/settings/`,
      `Token ${caller.token}`,
    );
    const rows = Array.isArray(settings?.mcp_servers) ? settings.mcp_servers : [];
    return rows
      .filter((r): r is { id: number } => !!r && typeof r === "object" && "id" in r)
      .map(connectorOf);
  } catch {
    // Refused, a deleted agent or an outage: the status still loads, so setup can repair it.
    return null;
  }
}

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") ?? "";
  if (!org) return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const settings = await readRecruitSettingsServer(org);
  const agentId = config.defaultAgentId() || settings.agentId || "";
  const connectors = await connectorsOn(org, caller, agentId);
  return NextResponse.json({
    org,
    agentId,
    connectors,
    pinnedByEnv: !!config.defaultAgentId(),
    mcpServerId: settings.mcpServerId ?? null,
    setupCompletedAt: settings.setupCompletedAt ?? null,
    studentAgentId: settings.studentAgentId ?? "",
    studentMcpServerId: settings.studentMcpServerId ?? null,
    studentSetupCompletedAt: settings.studentSetupCompletedAt ?? null,
    appUrl: config.publicOrigin() || req.nextUrl.origin,
    username: caller.username,
  });
}

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  if (!org) return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const appUrl =
    (typeof body.appUrl === "string" && /^https?:\/\//.test(body.appUrl) ? body.appUrl : "") ||
    config.publicOrigin() ||
    req.nextUrl.origin;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() || undefined : undefined);
  const log: string[] = [];
  const input = {
    org,
    username: caller.username,
    appUrl,
    authorization: `Token ${caller.token}`,
    institutionName: text(body.institutionName),
    log: (line: string) => log.push(line),
  };
  try {
    const result =
      body.agent === "recruit"
        ? await setupRecruit({
            ...input,
            // Kept with the settings, so a re-sync that names no voice pushes the same one.
            voice:
              typeof body.voice === "string"
                ? body.voice.trim()
                : (await readRecruitSettingsServer(org)).studentVoice,
          })
        : await setupChiefOfStaff(input);
    return NextResponse.json({ ...result, appUrl, log });
  } catch (e) {
    if (e instanceof Error && !("status" in e)) {
      return NextResponse.json({ error: e.message, log }, { status: 400 });
    }
    return platformFailure(e);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const id = typeof body.connectorId === "number" ? body.connectorId : NaN;
  if (!org || !Number.isInteger(id))
    return NextResponse.json({ error: "Organization and connector are required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const settings = await readRecruitSettingsServer(org);
  const agentId = config.defaultAgentId() || settings.agentId || "";
  const connector = (await connectorsOn(org, caller, agentId))?.find((c) => c.id === id);
  // Only a connector limited to the scrapers: a shared key to anything wider gives the agent the whole account.
  if (!connector?.pinned || !connector.keyIgnored)
    return NextResponse.json(
      { error: "Only a Chief of Staff connector limited to the scrapers, with an unused key" },
      { status: 400 },
    );
  const enc = encodeURIComponent;
  try {
    await platformFetch(
      `/dm/api/ai-mentor/orgs/${enc(org)}/users/${enc(caller.username)}/mcp-servers/${id}/`,
      `Token ${caller.token}`,
      { method: "PATCH", body: { auth_scope: "platform" } },
    );
  } catch (e) {
    return platformFailure(e);
  }
  return NextResponse.json({ ok: true });
}
