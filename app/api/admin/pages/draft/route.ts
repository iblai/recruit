import { NextResponse, type NextRequest } from "next/server";
import { jsonBody, platformFailure, verifyCaller } from "@/lib/iblai/platform";
import { BRIEF_MAX, draftPage } from "@/lib/recruit/draft-page";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

/**
 * POST { org, brief, timeZone, kind?, program? } — a landing-page draft from a brief (or a taster course about a program), written
 * by Recruit from the university's sources. Runs as the caller (their own
 * session token); returns the page for the browser to save as a draft.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const validZone = (zone: unknown): zone is string => {
  try {
    return typeof zone === "string" && !!new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    return false;
  }
};

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const org = typeof body.org === "string" ? body.org : "";
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const kind =
    body.kind === "course" ? "course" : body.kind == null || body.kind === "page" ? "page" : null;
  const program = typeof body.program === "string" ? body.program.trim() : "";
  if (!org || !kind || brief.length > BRIEF_MAX || (kind === "page" && !brief))
    return NextResponse.json({ error: "A brief is required." }, { status: 400 });
  if (kind === "course" && (!program || program.length > 120))
    return NextResponse.json({ error: "A program is required." }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { studentAgentId } = await readRecruitSettingsServer(org);
  if (!studentAgentId)
    return NextResponse.json({ error: "Set Recruit up first." }, { status: 400 });
  try {
    const page = await draftPage({
      org,
      username: caller.username,
      token: caller.token,
      agentId: studentAgentId,
      brief,
      kind,
      program,
      timeZone: validZone(body.timeZone) ? body.timeZone : "UTC",
    });
    return NextResponse.json({ page });
  } catch (e) {
    if (e instanceof Error && !("status" in e))
      return NextResponse.json({ error: e.message }, { status: 422 });
    return platformFailure(e);
  }
}
