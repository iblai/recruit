import type { NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import { CrmServer } from "@/lib/recruit/crm-server";
import { bearerToken } from "@/lib/mcp/protocol";
import { createRecruitServer, type ToolContext } from "@/lib/mcp/tools";

/**
 * The Chief of Staff's tool server — an MCP endpoint (Streamable HTTP, JSON
 * mode) the ibl.ai agent runtime calls when the agent decides to use a tool.
 *
 * Auth: the platform presents `Authorization: Bearer <key>`, the
 * `recruit-tools` Platform API Token agent setup minted and stored in the
 * org's platform-scoped MCP connection. Every tool forwards it as
 * `Api-Token <key>`, so the platform authorizes each call: the key's own
 * organization bounds what it reaches, and its CRM User policy (where RBAC
 * is on) what it may do there. The server holds no secret.
 */
export const dynamic = "force-dynamic";

const server = createRecruitServer();

function context(org: string, authorization: string): ToolContext {
  return { org, crm: new CrmServer(org, authorization), appUrl: config.appUrl() };
}

async function handle(req: NextRequest, params: Promise<{ tenantKey: string }>) {
  const { tenantKey } = await params;
  const org = decodeURIComponent(tenantKey ?? "");
  const key = bearerToken(req);
  return server.handleHttp(req, context(org, `Api-Token ${key}`), () => !!key && !!org);
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
