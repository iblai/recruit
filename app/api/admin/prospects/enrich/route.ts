import { NextResponse, type NextRequest } from "next/server";
import config from "@/lib/iblai/config";
import { jsonBody, platformFailure, verifyCaller } from "@/lib/iblai/platform";
import { CrmServer } from "@/lib/recruit/crm-server";
import { askAgent } from "@/lib/recruit/draft-page";
import { enrichPrompt, enrichRefusal, foundOf } from "@/lib/recruit/found";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * POST { org, personId } — the Enrich button on a kept student: the Chief of
 * Staff reads their public profile on the channel they were found on, through
 * its connector, and saves it with `enrich_found_prospect`. Runs as the caller.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const personId = typeof body.personId === "string" ? body.personId : "";
  if (!org || !/^[0-9a-f-]{36}$/i.test(personId))
    return NextResponse.json({ error: "Organization and prospect are required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const settings = await readRecruitSettingsServer(org);
  const agentId = config.defaultAgentId() || settings.agentId || "";
  if (!agentId)
    return NextResponse.json({ error: "Set the Chief of Staff up first." }, { status: 400 });
  const crm = new CrmServer(org, `Token ${caller.token}`);
  try {
    // Refused here before an agent turn spends anything; the tool refuses the same again.
    const person = await crm.getPerson(personId);
    const refusal = enrichRefusal(person, settings.foundBasis);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
    const before = foundOf(person)?.profile?.at ?? "";
    const reply = await askAgent({
      org,
      username: caller.username,
      token: caller.token,
      agentId,
      prompt: enrichPrompt(person),
      metadata: { purpose: "enrich" },
    });
    const after = foundOf(await crm.getPerson(personId))?.profile?.at ?? "";
    if (after && after !== before) return NextResponse.json({ ok: true });
    // Nothing saved: the agent says why (a private profile, a scraper that failed).
    return NextResponse.json(
      { error: reply.trim().slice(0, 300) || "The profile was not read." },
      { status: 422 },
    );
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      return NextResponse.json(
        {
          error:
            "Still reading after a minute: reload the page shortly to see whether it was saved.",
        },
        { status: 504 },
      );
    return platformFailure(e);
  }
}
