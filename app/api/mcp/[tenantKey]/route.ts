import type { NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import { apiKeyFor } from "@/lib/iblai/platform";
import { CrmServer } from "@/lib/recruit/crm-server";
import { readRecruitSettingsServer, writeRecruitSettings } from "@/lib/recruit/settings-server";
import { bearerToken, tokensEqual } from "@/lib/mcp/protocol";
import { createRecruitServer, type ToolContext } from "@/lib/mcp/tools";

/**
 * The Chief of Staff's tool server — an MCP endpoint (Streamable HTTP, JSON
 * mode) the ibl.ai agent runtime calls when the agent decides to use a tool.
 *
 * Auth: the platform presents `Authorization: Bearer <RECRUIT_MCP_TOKEN>`,
 * the shared secret the setup stored in the org's platform-scoped MCP
 * connection. Every tool then acts with the organization's Platform API
 * Token. One route per organization (`/api/mcp/<org>`), so a multi-institution
 * deployment keeps each org's records apart. Callers without the secret learn
 * nothing about how the server is configured.
 */
export const dynamic = "force-dynamic";

const server = createRecruitServer();

function context(org: string): ToolContext {
  return {
    org,
    crm: new CrmServer(org),
    appUrl: config.appUrl(),
    readSettings: () => readRecruitSettingsServer(org),
    writeSettings: (patch) => writeRecruitSettings(org, patch).then(() => undefined),
  };
}

async function handle(req: NextRequest, params: Promise<{ tenantKey: string }>) {
  const { tenantKey } = await params;
  const org = decodeURIComponent(tenantKey ?? "");
  const secret = config.mcpToken();
  const authorized = !!secret && tokensEqual(bearerToken(req), secret);
  if (!authorized || !org) {
    return server.handleHttp(req, context(org), () => false);
  }
  if (!apiKeyFor(org)) {
    return new Response(
      JSON.stringify({
        error: `This server holds no Platform API Token for organization "${org}" (set IBLAI_API_KEY or IBLAI_API_KEYS)`,
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  return server.handleHttp(req, context(org), () => true);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenantKey: string }> }) {
  return handle(req, ctx.params);
}
export async function GET(req: NextRequest, ctx: { params: Promise<{ tenantKey: string }> }) {
  return handle(req, ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ tenantKey: string }> }) {
  return handle(req, ctx.params);
}
