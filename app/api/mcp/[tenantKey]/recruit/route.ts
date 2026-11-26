import type { NextRequest } from "next/server";
import { bearerToken } from "@/lib/mcp/protocol";
import { createStudentServer } from "@/lib/mcp/student-tools";
import { CrmServer } from "@/lib/recruit/crm-server";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * Recruit's public tool server: the MCP endpoint the platform calls when the
 * agent prospective students talk to uses a tool.
 *
 * Auth: the platform presents `Authorization: Bearer <key>`, the
 * `recruit-student-tools` key setup minted with the CRM User role. Nothing
 * is dispatched until that key has reached the CRM, so a request without a
 * working key does nothing. The server holds no secret.
 */
export const dynamic = "force-dynamic";

const server = createStudentServer();

const unauthorized = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
  });

async function handle(req: NextRequest, params: Promise<{ tenantKey: string }>) {
  const { tenantKey } = await params;
  const org = decodeURIComponent(tenantKey ?? "");
  const key = bearerToken(req);
  const crm = new CrmServer(org, `Api-Token ${key}`);
  if (req.method === "POST" && (!key || !org || !(await crm.reachable()))) return unauthorized();
  const settings = await readRecruitSettingsServer(org);
  return server.handleHttp(req, { org, crm, settings }, () => true);
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
