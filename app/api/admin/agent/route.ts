import { NextResponse, type NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import { jsonBody, platformFailure, verifyCaller } from "@/lib/iblai/platform";
import { setupChiefOfStaff } from "@/lib/recruit/agent";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * Chief of Staff setup, run from Settings → Chief of Staff by an org admin.
 *
 * GET  ?org=<key>  — the agent currently recorded for the org and the public
 *                    app URL the platform will call back on. Any signed-in
 *                    member may read it.
 * POST { org, institutionName?, appUrl? } — create / re-sync the agent, its
 *                    MCP server + connection, and save the ids. Runs as the
 *                    caller (their own session token), so the platform
 *                    refuses anyone who does not administer the org;
 *                    idempotent.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") ?? "";
  if (!org) return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const settings = await readRecruitSettingsServer(org);
  return NextResponse.json({
    org,
    agentId: config.defaultAgentId() || settings.agentId || "",
    pinnedByEnv: !!config.defaultAgentId(),
    mcpServerId: settings.mcpServerId ?? null,
    setupCompletedAt: settings.setupCompletedAt ?? null,
    appUrl: config.appUrl() || req.nextUrl.origin,
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
    config.appUrl() ||
    req.nextUrl.origin;
  const log: string[] = [];
  try {
    const result = await setupChiefOfStaff({
      org,
      username: caller.username,
      appUrl,
      authorization: `Token ${caller.token}`,
      institutionName:
        typeof body.institutionName === "string"
          ? body.institutionName.trim() || undefined
          : undefined,
      log: (line) => log.push(line),
    });
    return NextResponse.json({ ...result, appUrl, log });
  } catch (e) {
    if (e instanceof Error && !("status" in e)) {
      return NextResponse.json({ error: e.message, log }, { status: 400 });
    }
    return platformFailure(e);
  }
}
