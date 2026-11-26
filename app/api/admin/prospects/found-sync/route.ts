import { NextResponse, type NextRequest } from "next/server";
import { jsonBody, platformFailure, verifyCaller } from "@/lib/iblai/platform";
import { CrmServer } from "@/lib/recruit/crm-server";
import { channelTag, foundOf } from "@/lib/recruit/found";

/**
 * POST { org, personId, kept? } — a student found on a social channel, after a
 * person kept them (`kept`: their channel tag, and the CRM app's copy made) or
 * marked them Do not contact (the copy marked too). Runs as the caller (their
 * own session token).
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const personId = typeof body.personId === "string" ? body.personId : "";
  if (!org || !/^[0-9a-f-]{36}$/i.test(personId))
    return NextResponse.json({ error: "Organization and prospect are required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const crm = new CrmServer(org, `Token ${caller.token}`);
  try {
    // Read through Recruit's scope: only Recruit's own record is copied.
    const person = await crm.getPerson(personId);
    const found = foundOf(person);
    if (!found?.platform || person.active === false)
      return NextResponse.json(
        { error: "Only a student found on a social channel, on a record still in use" },
        { status: 400 },
      );
    const kept = body.kept === true;
    if (kept) {
      const tag = await crm.findOrCreateTag(channelTag(found.platform), "#6b7280");
      await crm.attachTag("persons", person.id, tag.id);
    }
    const copy = await crm.syncCrmCopy(person, kept);
    // Kept again while their copy says Do not contact: this record says so too, less contact and never more.
    if (kept && copy.stopped && person.metadata?.opted_out !== true) {
      await crm.patchMetadata("persons", person.id, {
        opted_out: true,
        opted_out_at: new Date().toISOString(),
      });
      await crm.createActivity({
        type: "note",
        title: "Asked not to be contacted",
        comment: "Their copy in the CRM app is marked Do not contact, so this record is too.",
        person: person.id,
        owner: person.owner ?? null,
        is_done: true,
      });
      return NextResponse.json({ ...copy, opted_out_here: true });
    }
    return NextResponse.json(copy);
  } catch (e) {
    return platformFailure(e);
  }
}
