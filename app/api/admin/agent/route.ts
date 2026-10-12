import { NextResponse, type NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import {
  apiKeyFor,
  isResponse,
  jsonBody,
  platformFailure,
  requireAdmin,
} from "@/lib/iblai/platform";
import { setupChiefOfStaff } from "@/lib/recruit/agent";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * Chief of Staff setup, run from Settings → Chief of Staff by an org admin.
 *
 * GET  ?org=<key>  — what the server knows: whether it holds a key for the
 *                    org, whether the MCP secret is set, the public app URL,
 *                    and the agent currently recorded for the org.
 * POST { org, institutionName?, appUrl? } — create / re-sync the agent, its
 *                    MCP server + connection, and save the ids. Idempotent.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") ?? "";
  const caller = await requireAdmin(req, org);
  if (isResponse(caller)) return caller;
  const settings = await readRecruitSettingsServer(org);
  return NextResponse.json({
    org,
    agentId: config.defaultAgentId() || settings.agentId || "",
    pinnedByEnv: !!config.defaultAgentId(),
    mcpServerId: settings.mcpServerId ?? null,
    setupCompletedAt: settings.setupCompletedAt ?? null,
    serverHasKey: !!apiKeyFor(org),
    mcpTokenSet: config.mcpToken().length >= 16,
    appUrl: config.appUrl() || req.nextUrl.origin,
    username: caller.username,
  });
}

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const caller = await requireAdmin(req, org);
  if (isResponse(caller)) return caller;
  const appUrl =
    (typeof body.appUrl === "string" && /^https?:\/\//.test(body.appUrl) ? body.appUrl : "") ||
    config.appUrl() ||
    req.nextUrl.origin;
  const log: string[] = [];
  try {
    const result = await setupChiefOfStaff({
      org,
      username: config.apiUsername() || caller.username,
      appUrl,
      mcpToken: config.mcpToken(),
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
