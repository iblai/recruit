import { NextResponse, type NextRequest } from "next/server";
import { apiKeyFor, PlatformError } from "@/lib/iblai/platform";
import { CrmServer } from "@/lib/recruit/crm-server";
import {
  pickUtm,
  planSubmission,
  validateSubmission,
  type Answers,
} from "@/lib/recruit/landing-pages";
import { readRecruitSettingsServer, writeRecruitSettings } from "@/lib/recruit/settings-server";
import { applySubmission } from "@/lib/recruit/submission";

/**
 * A prospect submitted a landing-page form. Public (no session): validate
 * against the published page definition, then create the prospect, the
 * school, the application, the tags and a note with the organization's
 * authority. Spam defences: a honeypot field, a per-IP rate limit, size caps.
 */
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, { n: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  entry.n += 1;
  return entry.n > MAX_PER_WINDOW;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ tenantKey: string; slug: string }> },
) {
  const { tenantKey, slug } = await ctx.params;
  const org = decodeURIComponent(tenantKey ?? "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    answers?: Answers;
    website?: string;
    utm?: Record<string, string>;
    pageUrl?: string;
  } | null;
  if (!body || typeof body !== "object" || !body.answers || typeof body.answers !== "object") {
    return NextResponse.json({ error: "Malformed submission" }, { status: 400 });
  }
  // Honeypot: real people never fill the hidden "website" field.
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const settings = await readRecruitSettingsServer(org);
  const page = (settings.landingPages ?? []).find((p) => p.slug === slug);
  if (!page || !page.published) {
    return NextResponse.json({ error: "This page is not accepting submissions." }, { status: 404 });
  }
  if (!apiKeyFor(org)) {
    return NextResponse.json(
      { error: "This organization is not configured to receive submissions yet." },
      { status: 503 },
    );
  }

  const answers: Answers = {};
  for (const f of page.fields) {
    const v = body.answers[f.key];
    if (v === undefined || v === null) continue;
    answers[f.key] = typeof v === "string" ? v.slice(0, 2000) : v;
  }
  const issues = validateSubmission(page, answers);
  if (issues.length)
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", issues },
      { status: 422 },
    );

  const plan = planSubmission(page, answers, {
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 500) : undefined,
    utm: pickUtm(body.utm ?? {}),
    submittedAt: new Date().toISOString(),
  });

  try {
    const crm = new CrmServer(org);
    const outcome = await applySubmission(crm, page, plan);
    // Count it (best effort; a lost increment is not worth failing the prospect).
    writeRecruitSettings(org, {
      landingPages: (settings.landingPages ?? []).map((p) =>
        p.slug === slug ? { ...p, submissions: (p.submissions ?? 0) + 1 } : p,
      ),
    }).catch(() => undefined);
    return NextResponse.json({
      ok: true,
      title: page.successTitle,
      message: page.successMessage,
      created: outcome.personCreated,
    });
  } catch (e) {
    const status = e instanceof PlatformError ? e.status : 500;
    console.error(
      "[recruit] landing-page submission failed",
      org,
      slug,
      status,
      e instanceof PlatformError ? e.body : e,
    );
    return NextResponse.json(
      { error: "We could not save your request right now. Please try again in a few minutes." },
      { status: 502 },
    );
  }
}
