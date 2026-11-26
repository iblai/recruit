import { NextResponse, type NextRequest } from "next/server";
import { jsonBody, platformFailure, verifyCaller } from "@/lib/iblai/platform";
import { setupOutbox } from "@/lib/recruit/outbox";

/**
 * POST { org, connectorId } — give the outbox this mail connector (`null`
 * takes it away). Runs as the caller, so the platform refuses anyone who does
 * not administer the org.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const connectorId = body.connectorId === null ? null : Number(body.connectorId);
  if (!org || (connectorId !== null && !Number.isInteger(connectorId)))
    return NextResponse.json({ error: "A connector is required." }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const result = await setupOutbox({
      org,
      username: caller.username,
      authorization: `Token ${caller.token}`,
      connectorId,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && !("status" in e))
      return NextResponse.json({ error: e.message }, { status: 400 });
    return platformFailure(e);
  }
}
