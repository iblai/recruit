import { NextResponse, type NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import {
  apiKeyFor,
  isOrgAdmin,
  isResponse,
  jsonBody,
  platformFailure,
  requireAdmin,
  verifyCaller,
} from "@/lib/iblai/platform";
import { setupChiefOfStaff } from "@/lib/recruit/agent";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * Chief of Staff setup, run from Settings → Chief of Staff by an org admin.
 *
 * GET  ?org=<key>  — what the server knows: whether it holds a key for the
 *                    org, whether the MCP secret is set, the public app URL,
 *                    and the agent currently recorded for the org. Any
 *                    signed-in member may read it (booleans only); when the
 *                    server holds no key for the org, admin status cannot be
 *                    verified and the checklist says so instead of failing.
 * POST { org, institutionName?, appUrl? } — create / re-sync the agent, its
 *                    MCP server + connection, and save the ids. Admins only;
 *                    idempotent.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org") ?? "";
  if (!org) return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const serverHasKey = !!apiKeyFor(org);
  let isAdmin: boolean | null = null;
  if (serverHasKey) {
    try {
      isAdmin = await isOrgAdmin(caller.username, org);
    } catch (e) {
      return platformFailure(e);
    }
  }
  const settings = await readRecruitSettingsServer(org);
  return NextResponse.json({
    org,
    agentId: config.defaultAgentId() || settings.agentId || "",
    pinnedByEnv: !!config.defaultAgentId(),
    mcpServerId: settings.mcpServerId ?? null,
    setupCompletedAt: settings.setupCompletedAt ?? null,
    serverHasKey,
    /** `null` when the server cannot ask the platform (no key for the org). */
    isAdmin,
    mcpTokenSet: config.mcpToken().length >= 16,
    appUrl: config.appUrl() || req.nextUrl.origin,
    username: caller.username,
  });
}

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  if (!org) return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  // With a key, the platform confirms the caller administers the org. Without
  // one, the setup runs as the caller (their own session token), so the
  // platform enforces their rights on every call.
  const serverHasKey = !!apiKeyFor(org);
  let caller;
  try {
    caller = serverHasKey ? await requireAdmin(req, org) : await verifyCaller(req);
  } catch (e) {
    return platformFailure(e);
  }
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (isResponse(caller)) return caller;
  const appUrl =
    (typeof body.appUrl === "string" && /^https?:\/\//.test(body.appUrl) ? body.appUrl : "") ||
    config.appUrl() ||
    req.nextUrl.origin;
  const log: string[] = [];
  try {
    const result = await setupChiefOfStaff({
      org,
      username: serverHasKey ? config.apiUsername() || caller.username : caller.username,
      appUrl,
      mcpToken: config.mcpToken(),
      sessionToken: serverHasKey ? undefined : caller.token,
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
