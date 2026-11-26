import type { NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import { CrmServer } from "@/lib/recruit/crm-server";
import { bearerToken } from "@/lib/mcp/protocol";
import { createRecruitServer, type ToolContext } from "@/lib/mcp/tools";
import { institutionBranding, readRecruitSettings } from "@/lib/recruit/org-settings";
import { readOrgMetadata } from "@/lib/recruit/settings-server";

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

async function context(org: string, authorization: string): Promise<ToolContext> {
  const metadata = org ? await readOrgMetadata(org) : {};
  // The name a recipient reads: the university's own, else the platform's.
  const settings = {
    ...readRecruitSettings(metadata),
    institutionName: institutionBranding(metadata, org).name,
  };
  return { org, crm: new CrmServer(org, authorization), appUrl: config.publicOrigin(), settings };
}

async function handle(req: NextRequest, params: Promise<{ tenantKey: string }>) {
  const { tenantKey } = await params;
  const org = decodeURIComponent(tenantKey ?? "");
  const key = bearerToken(req);
  return server.handleHttp(req, await context(org, `Api-Token ${key}`), () => !!key && !!org);
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
