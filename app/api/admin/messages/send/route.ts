import { NextResponse, type NextRequest } from "next/server";
import { jsonBody, platformFailure, verifyCaller } from "@/lib/iblai/platform";
import { CrmServer } from "@/lib/recruit/crm-server";
import { NotStarted, askAgent } from "@/lib/recruit/draft-page";
import { institutionBranding, readRecruitSettings } from "@/lib/recruit/org-settings";
import { NotSent, relayOutcome, relayRequest, sendApproved } from "@/lib/recruit/outbox";
import { readOrgMetadata } from "@/lib/recruit/settings-server";

/**
 * POST { org, id, subject?, body?, to? } — send one drafted email a person has just
 * approved, through the outbox. Runs as the caller (their own session): the
 * platform decides whether they may read and change that record, and whether
 * they may use the outbox.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const id = Number(body.id);
  if (!org || !Number.isInteger(id))
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const metadata = await readOrgMetadata(org);
  const settings = readRecruitSettings(metadata);
  try {
    const result = await sendApproved({
      crm: new CrmServer(org, `Token ${caller.token}`),
      settings,
      institution: institutionBranding(metadata, org).name,
      id,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
      approvedBy: caller.username,
      relay: async (email) => {
        try {
          const reply = await askAgent({
            org,
            username: caller.username,
            token: caller.token,
            agentId: settings.outboxAgentId ?? "",
            prompt: relayRequest(email),
          });
          return relayOutcome(reply);
        } catch (e) {
          // Refused before the agent ran, so nothing went out. What is known, no more: a 403 here has been a gateway's.
          if (e instanceof NotStarted)
            return {
              sent: false,
              detail: `The platform refused the sending agent for your account (${e.status}). Open the message in your mail app, or ask an admin to send it.`,
            };
          throw e;
        }
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NotSent) return NextResponse.json({ error: e.message }, { status: 409 });
    return platformFailure(e);
  }
}
