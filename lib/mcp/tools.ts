/**
 * The Chief of Staff's tools — what the agent can look up and do in the
 * recruitment CRM on behalf of the team. Every tool runs with the key the
 * platform presents (minted by setup: the CRM User role, or acting as that
 * admin where RBAC is off) against the same `/dm/api/crm/…` resources the
 * app's screens use, so what the agent changes is what the team sees.
 *
 * Design rules:
 *  - Read tools are cheap and answer in one call; write tools are explicit
 *    (`create_*`, `move_*`, `log_*`) and never cascade.
 *  - Stage and funnel references use stable `code`s, not numeric ids.
 *  - Nothing destructive is exposed (no deletes, no merges without a human).
 *  - Results are small JSON documents the model can quote back.
 */
import type { Activity, ActivityType, Deal, LifecycleStage, Person, Pipeline } from "../crm/types";
import {
  APPLICATION_FIELDS,
  PROSPECT_FIELDS,
  applicationTitle,
  metaPatch,
  type Metadata,
} from "../recruit/fields";
import { LIFECYCLE_LABELS, ACTIVITY_LABELS, STATUS_LABELS } from "../recruit/vocabulary";
import {
  fromWebForm,
  landingPageUrl,
  newLandingPage,
  toWebForm,
  validateLandingPage,
  type LandingPage,
} from "../recruit/landing-pages";
import type { CrmServer } from "../recruit/crm-server";
import {
  bookedEvent,
  contactRefusal,
  eventMessage,
  followUpOf,
  foundLine,
  handoffOf,
  withLine,
} from "../recruit/follow-ups";
import {
  CHANNELS,
  DM_MAX,
  FOUND_PER_DAY,
  OPEN_SHORTLISTS,
  PASSED_DAYS,
  PLATFORMS,
  SHORTLIST_DAYS,
  SHORTLIST_HOLDER,
  SHORTLIST_MAX,
  cleanCandidate,
  cleanProfile,
  dmLine,
  enrichRefusal,
  shortlistOf,
  uniqueIdOf,
  type FoundCandidate,
} from "../recruit/found";
import { cleanOrigins, type RecruitSettings } from "../recruit/org-settings";
import {
  driving,
  foundOf,
  horizon,
  needs,
  nudgeRefusal,
  outreachDue,
  stepDue,
  type EventSignUps,
  type NeedsInput,
} from "../recruit/outreach";
import { STAGE_CHANGED } from "../recruit/scoreboard";
import { McpServer, errorResult, type ToolDefinition } from "./protocol";

export interface ToolContext {
  org: string;
  crm: CrmServer;
  /** Public origin of this app, for landing-page links. */
  appUrl: string;
  /** The organization's recruit settings, for the institution's name and address. */
  settings?: RecruitSettings;
  now?: () => Date;
}

const DAY = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const limitOf = (v: unknown, dflt = 25, max = 100) => Math.min(max, Math.max(1, num(v) ?? dflt));

/** Drafts the agents may write in 24 hours on a platform, whichever tool writes them: Settings, else 50. */
function dailyDrafts(ctx: ToolContext): number {
  const n = ctx.settings?.dailyDrafts;
  return Number.isInteger(n) && n! >= 1 && n! <= 500 ? n! : 50;
}
/** Everything a profile read may hold (`metadata.found.profile`), so a new read replaces an old one. */
const PROFILE_KEYS = [
  "bio",
  "website",
  "city",
  "state",
  "school",
  "program",
  "graduation_year",
  "interests",
  "posts",
] as const;
/** What the agents and the public chat mark on a person; no tool that edits fields may clear one. */
const KEPT_MARKS = new Set(["opted_out", "opted_out_at", "found", "conversations"]);
const time = (s?: string | null) => (s ? new Date(s).getTime() : NaN);
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Records created from `from` on: the platform answers 400 to a `start_date` without an `end_date`. */
const createdSince = (from: number, now: number) => ({
  start_date: isoDay(from),
  end_date: isoDay(now + DAY),
});

/** The host of the first link in `body` that is not on this app or the university's own sites; "" when none. */
// ponytail: sees http(s):// and www. links only; a bare domain ("apply.example.edu") passes to the reviewer.
function foreignLink(body: string, ctx: ToolContext): string {
  const own = [ctx.appUrl, ...cleanOrigins(ctx.settings?.websiteOrigins)].filter(Boolean);
  const allowed = new Set(own.map((o) => new URL(o).origin));
  for (const [link] of body.matchAll(/(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi)) {
    let url: URL;
    try {
      url = new URL(/^www\./i.test(link) ? `https://${link}` : link);
    } catch {
      return link;
    }
    if (!allowed.has(url.origin)) return url.host;
  }
  return "";
}

type SignUps = EventSignUps["signUps"];
type Cadence = Pick<NeedsInput, "pipelines" | "events" | "courses" | "entered">;

/** What the pages offer the cadence: events still to come, with who signed up, and published courses. */
function offers(pages: LandingPage[], now: Date, signUps: Map<string, SignUps>) {
  return {
    events: pages
      .filter((p) => p.event && time(p.event.startsAt) > now.getTime())
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        event: p.event!,
        published: p.published,
        program: p.program ?? "",
        signUps: signUps.get(p.slug) ?? [],
      })),
    courses: pages
      .filter((p) => p.published && p.course && p.program)
      .map((p) => ({ slug: p.slug, title: p.title, program: p.program! })),
  };
}

/** The same for one person: their own applications' stage notes and their own sign-ups, a handful of reads. */
async function cadenceInputFor(
  ctx: ToolContext,
  now: Date,
  person: string,
  deals: Deal[],
): Promise<Cadence> {
  const [pipelines, forms, bookings, eventDeals] = await Promise.all([
    ctx.crm.listPipelines(),
    ctx.crm.listWebForms(),
    ctx.crm.listActivities({ person, metadata__has_key: "booking", page_size: 100 }),
    ctx.crm.listDeals({ person, metadata__has_key: "event", page_size: 100 }),
  ]);
  const entered = new Map<number, string>();
  for (const d of deals) {
    // A few, so a counselor's own note that says "Stage changed" does not hide the platform's.
    const { results } = await ctx.crm.listActivities({
      deal: d.id,
      type: "note",
      search: STAGE_CHANGED,
      ordering: "-created_at",
      page_size: 5,
    });
    const note = results.find((n) => n.title === STAGE_CHANGED);
    if (note) entered.set(d.id, note.created_at);
  }
  const pages = forms.map(fromWebForm);
  const theirs = new Set([
    ...eventDeals.results.map((d) => String(d.metadata?.event ?? "")),
    ...bookings.results.map(bookedEvent),
  ]);
  const signUps = new Map<string, SignUps>();
  for (const p of pages) {
    if (!p.event || !(time(p.event.startsAt) > now.getTime())) continue;
    // A sign-up through a form opens an application marked with the event; a page that opens none leaves only its submission.
    const signed =
      theirs.has(p.slug) ||
      (!p.createApplication &&
        (await ctx.crm.allWebFormSubmissions(p.slug)).some((s) => s.person === person));
    if (signed) signUps.set(p.slug, [{ person, at: "" }]);
  }
  return { pipelines, entered, ...offers(pages, now, signUps) };
}

/** What the cadence reads besides applications: funnels, pages on offer with their sign-ups, when each application entered its stage. */
async function cadenceInput(ctx: ToolContext, now: Date): Promise<Cadence> {
  const [pipelines, forms, bookings] = await Promise.all([
    ctx.crm.listPipelines(),
    ctx.crm.listWebForms(),
    ctx.crm.allActivities({ metadata__has_key: "booking" }),
  ]);
  // Exact: an application with no note in the window was created inside it (creation is its clock) or entered its stage before it (nothing is due).
  // ponytail: the newest 1,000 stage moves in the window; a per-application read when a platform moves more.
  const notes = await ctx.crm.allActivities(
    {
      type: "note",
      search: STAGE_CHANGED,
      ...createdSince(now.getTime() - horizon(pipelines) * DAY, now.getTime()),
      ordering: "-created_at",
    },
    10,
  );
  const entered = new Map<number, string>();
  for (const n of notes)
    if (n.title === STAGE_CHANGED && n.deal && !(time(entered.get(n.deal)) >= time(n.created_at)))
      entered.set(n.deal, n.created_at);
  const pages = forms.map(fromWebForm);
  const signUps = new Map<string, SignUps>();
  await Promise.all(
    pages
      .filter((p) => p.event && time(p.event.startsAt) > now.getTime())
      .map(async (p) =>
        signUps.set(p.slug, [
          ...(await ctx.crm.allWebFormSubmissions(p.slug))
            .filter((s) => s.person)
            .map((s) => ({ person: s.person!, at: s.created_at })),
          ...bookings
            .filter((a) => a.person && bookedEvent(a) === p.slug)
            .map((a) => ({ person: a.person!, at: a.created_at })),
        ]),
      ),
  );
  return { pipelines, entered, ...offers(pages, now, signUps) };
}

/** How many drafts the agents wrote in the last 24 hours. */
// ponytail: reads the follow-ups since yesterday, 600 at most, above the largest allowance (500).
async function draftsToday(ctx: ToolContext, now: Date): Promise<number> {
  const recent = await ctx.crm.allActivities(
    {
      metadata__has_key: "follow_up",
      ...createdSince(now.getTime() - DAY, now.getTime()),
      ordering: "-created_at",
    },
    6,
  );
  return recent.filter(
    (a) =>
      (followUpOf(a)?.by ?? "").endsWith(" (AI)") &&
      now.getTime() - new Date(a.created_at).getTime() < DAY,
  ).length;
}

/** Whether this person signed up for the event page `slug`: through its form, or in chat. */
async function signedUpFor(ctx: ToolContext, person: string, slug: string): Promise<boolean> {
  const [deals, bookings] = await Promise.all([
    ctx.crm.listDeals({ person, metadata__has_key: "event", page_size: 100 }),
    ctx.crm.listActivities({ person, metadata__has_key: "booking", page_size: 100 }),
  ]);
  if (deals.results.some((d) => d.metadata?.event === slug)) return true;
  if (bookings.results.some((a) => bookedEvent(a) === slug)) return true;
  // A page that opens no application leaves only its submission.
  return (await ctx.crm.allWebFormSubmissions(slug)).some((sub) => sub.person === person);
}

/** These people, read ten at a time: the platform throttles a burst. One that cannot be read (deleted) is left out. */
async function readPeople(ctx: ToolContext, ids: string[]): Promise<Person[]> {
  const out: Person[] = [];
  for (let i = 0; i < ids.length; i += 10)
    for (const r of await Promise.allSettled(
      ids.slice(i, i + 10).map((id) => ctx.crm.getPerson(id)),
    ))
      if (r.status === "fulfilled") out.push(r.value);
  return out;
}

/** Empties every shortlist nobody reviewed in time, open or closed by hand: nothing about its people outlives the wait. */
// ponytail: the newest 200 old enough to expire; earlier runs took the ones before.
async function expireShortlists(ctx: ToolContext, now: Date): Promise<void> {
  const old = await ctx.crm.allActivities(
    {
      metadata__has_key: "shortlist",
      start_date: "2000-01-01",
      end_date: isoDay(now.getTime() - SHORTLIST_DAYS * DAY),
      ordering: "-created_at",
    },
    2,
  );
  for (const a of old) {
    const people = (a.metadata?.shortlist as { people?: unknown } | undefined)?.people;
    if (!Array.isArray(people) || !people.length) continue;
    if (now.getTime() - time(a.created_at) <= SHORTLIST_DAYS * DAY) continue;
    await ctx.crm.updateActivity(a.id, {
      is_done: true,
      metadata: {
        ...a.metadata,
        shortlist: {
          ...(a.metadata?.shortlist as object),
          proposed: shortlistOf(a)?.proposed ?? 0,
          people: [],
          expired: true,
        },
      },
    });
  }
  // A passed-over handle keeps someone out of new shortlists for PASSED_DAYS, then goes.
  const passed = await ctx.crm.allActivities(
    {
      metadata__has_key: "passed",
      start_date: "2000-01-01",
      end_date: isoDay(now.getTime() - PASSED_DAYS * DAY),
      ordering: "-created_at",
    },
    2,
  );
  for (const a of passed) {
    if (now.getTime() - time(a.created_at) <= PASSED_DAYS * DAY) continue;
    const { passed: _gone, ...rest } = a.metadata ?? {};
    await ctx.crm.updateActivity(a.id, { metadata: rest });
  }
}

function personView(p: Person, extra: Record<string, unknown> = {}) {
  return {
    id: p.id,
    name: p.name,
    email: p.primary_email ?? null,
    phones: p.contact_numbers ?? [],
    intended_program: p.job_title ?? null,
    stage: LIFECYCLE_LABELS[p.lifecycle_stage ?? "lead"],
    stage_code: p.lifecycle_stage ?? "lead",
    school_id: p.organization ?? null,
    counselor_id: p.owner ?? null,
    tags: (p.tags ?? []).map((t) => t.name),
    ...pickMeta(
      p.metadata,
      PROSPECT_FIELDS.map((f) => f.key),
    ),
    created_at: p.created_at,
    ...extra,
  };
}

function dealView(d: Deal, stageName?: string, pipelineName?: string) {
  return {
    id: d.id,
    title: d.title,
    status: STATUS_LABELS[d.status],
    status_code: d.status,
    funnel: pipelineName ?? null,
    stage: stageName ?? null,
    stage_id: d.stage,
    prospect_id: d.person,
    school_id: d.organization ?? null,
    counselor_id: d.owner ?? null,
    decision_deadline: d.expected_close_date ?? null,
    est_net_tuition: d.lead_value ? Number(d.lead_value) : null,
    currency: d.currency ?? null,
    withdrawn_reason: d.lost_reason || null,
    tags: (d.tags ?? []).map((t) => t.name),
    ...pickMeta(
      d.metadata,
      APPLICATION_FIELDS.map((f) => f.key),
    ),
    updated_at: d.updated_at,
  };
}

function activityView(a: Activity) {
  return {
    id: a.id,
    type: ACTIVITY_LABELS[a.type] ?? a.type,
    type_code: a.type,
    title: a.title,
    notes: a.comment ?? null,
    scheduled_for: a.schedule_from ?? null,
    done: !!a.is_done,
    done_at: a.done_at,
    prospect_id: a.person ?? null,
    application_id: a.deal ?? null,
    counselor_id: a.owner ?? null,
  };
}

function pickMeta(metadata: Metadata | undefined, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (metadata?.[k] !== undefined) out[k] = metadata[k];
  return out;
}

async function stageIndex(crm: CrmServer) {
  const pipelines = await crm.listPipelines();
  const stageName = new Map<number, string>();
  const stageCode = new Map<number, string>();
  const pipelineName = new Map<number, string>();
  for (const p of pipelines) {
    pipelineName.set(p.id, p.name);
    for (const s of p.stages ?? []) {
      stageName.set(s.id, s.name);
      stageCode.set(s.id, s.code);
    }
  }
  return { pipelines, stageName, stageCode, pipelineName };
}

function funnelView(p: Pipeline) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    is_default: !!p.is_default,
    stale_after_days: p.rotten_days ?? null,
    stages: [...(p.stages ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s) => ({
        code: s.code,
        name: s.name,
        probability: s.probability ?? null,
        outcome: s.is_won ? "enrolled" : s.is_lost ? "withdrawn" : "open",
      })),
  };
}

const LIFECYCLE_CODES: LifecycleStage[] = [
  "lead",
  "qualified",
  "opportunity",
  "customer",
  "churned",
];
const ACTIVITY_CODES: ActivityType[] = [
  "call",
  "meeting",
  "email",
  "note",
  "task",
  "lunch",
  "deadline",
];

const T = <A extends ToolDefinition<ToolContext>>(t: A) => t;

export const RECRUIT_TOOLS: ToolDefinition<ToolContext>[] = [
  // ------------------------------------------------------------ the brief
  T({
    name: "daily_brief",
    description:
      "The Chief of Staff's morning brief for the recruitment team: open applications by funnel stage, work due today and overdue, inquiries received in the last 7 days, applications with no movement past the funnel's stale threshold, and decision deadlines inside 14 days. Call this first when asked how things are going, what needs attention, or for a summary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Daily brief", readOnlyHint: true },
    handler: async (_args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const weekAgo = new Date(now.getTime() - 7 * DAY);
      const [{ pipelines, stageName, pipelineName }, deals, openActivities, people, recent] =
        await Promise.all([
          stageIndex(ctx.crm),
          ctx.crm.allDeals({ status: "open" }, 10),
          ctx.crm.allActivities({ is_done: false }, 3),
          ctx.crm.listPersons({ page_size: 1 }),
          ctx.crm.listPersons({ created_at__gte: weekAgo.toISOString(), page_size: 1 }),
        ]);
      const byFunnel = pipelines.map((p) => ({
        funnel: p.name,
        stale_after_days: p.rotten_days ?? null,
        stages: [...(p.stages ?? [])]
          .filter((s) => !s.is_won && !s.is_lost)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((s) => ({ stage: s.name, count: deals.filter((d) => d.stage === s.id).length })),
        total_open: deals.filter((d) => d.pipeline === p.id).length,
      }));
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday.getTime() + DAY);
      const scheduled = openActivities.filter((a) => a.schedule_from);
      const overdue = scheduled.filter((a) => new Date(a.schedule_from as string) < startOfToday);
      const dueToday = scheduled.filter((a) => {
        const d = new Date(a.schedule_from as string);
        return d >= startOfToday && d < endOfToday;
      });
      const stale = deals.filter((d) => {
        const p = pipelines.find((x) => x.id === d.pipeline);
        if (!p?.rotten_days) return false;
        return now.getTime() - new Date(d.updated_at).getTime() > p.rotten_days * DAY;
      });
      const soon = deals.filter((d) => {
        if (!d.expected_close_date) return false;
        const t = new Date(d.expected_close_date).getTime();
        return t >= startOfToday.getTime() && t <= now.getTime() + 14 * DAY;
      });
      return {
        as_of: now.toISOString(),
        prospects_total: people.count,
        new_inquiries_7d: recent.count,
        open_applications: deals.length,
        funnels: byFunnel,
        due_today: dueToday.slice(0, 20).map(activityView),
        overdue: overdue.slice(0, 20).map(activityView),
        stale_applications: stale
          .slice(0, 20)
          .map((d) => dealView(d, stageName.get(d.stage), pipelineName.get(d.pipeline))),
        deadlines_next_14_days: soon
          .sort((a, b) =>
            String(a.expected_close_date).localeCompare(String(b.expected_close_date)),
          )
          .slice(0, 20)
          .map((d) => dealView(d, stageName.get(d.stage), pipelineName.get(d.pipeline))),
      };
    },
  }),

  // ------------------------------------------------------------- prospects
  T({
    name: "search_prospects",
    description:
      "Find prospects (students, applicants, contacts) by name, email or intended program, optionally narrowed by lifecycle stage, counselor or tag. Returns up to `limit` matches, newest first, with their ids — use the id with get_prospect, create_application or log_activity.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Part of a name, email or program. Omit to list recent prospects.",
        },
        stage: {
          type: "string",
          enum: LIFECYCLE_CODES,
          description:
            "lead=Inquiry, qualified=Engaged, opportunity=Applicant, customer=Enrolled, churned=Withdrawn",
        },
        counselor_id: {
          type: "integer",
          description: "Platform user id of the assigned counselor.",
        },
        tag_id: { type: "integer" },
        limit: { type: "integer", description: "Default 25, max 100." },
      },
      additionalProperties: false,
    },
    annotations: { title: "Search prospects", readOnlyHint: true },
    handler: async (args, ctx) => {
      const data = await ctx.crm.listPersons({
        search: str(args.query) || undefined,
        lifecycle_stage: (str(args.stage) || undefined) as LifecycleStage | undefined,
        owner: num(args.counselor_id),
        tags: num(args.tag_id) ? String(args.tag_id) : undefined,
        ordering: "-created_at",
        page_size: limitOf(args.limit),
      });
      return { count: data.count, prospects: data.results.map((p) => personView(p)) };
    },
  }),
  T({
    name: "get_prospect",
    description:
      "Everything about one prospect: profile and recruitment fields, their applications with stage, and their recent activities (calls, visits, notes, tasks).",
    inputSchema: {
      type: "object",
      properties: { prospect_id: { type: "string", description: "UUID from search_prospects." } },
      required: ["prospect_id"],
      additionalProperties: false,
    },
    annotations: { title: "Get prospect", readOnlyHint: true },
    handler: async (args, ctx) => {
      const id = str(args.prospect_id);
      const [person, deals, activities, { stageName, pipelineName }] = await Promise.all([
        ctx.crm.getPerson(id),
        ctx.crm.listDeals({ person: id, page_size: 50 }),
        ctx.crm.listActivities({ person: id, page_size: 50 }),
        stageIndex(ctx.crm),
      ]);
      return {
        prospect: personView(person, { school: person.organization_name ?? null }),
        applications: deals.results.map((d) =>
          dealView(d, stageName.get(d.stage), pipelineName.get(d.pipeline)),
        ),
        activities: activities.results
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 30)
          .map(activityView),
      };
    },
  }),
  T({
    name: "create_prospect",
    description:
      "Add a new prospect. Provide at least a name; add email and phone so they can be reached, the school they attend (found or created by name), intended program, graduation year, entry term and the counselor who owns them. Check search_prospects first to avoid duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        school: {
          type: "string",
          description: "Name of the high school / college; found or created.",
        },
        intended_program: { type: "string" },
        graduation_year: { type: "string" },
        entry_term: { type: "string", description: 'e.g. "Fall 2027"' },
        entry_type: {
          type: "string",
          enum: ["first_year", "transfer", "graduate", "international", "continuing_ed"],
        },
        residency: { type: "string", enum: ["in_state", "out_of_state", "international"] },
        stage: { type: "string", enum: LIFECYCLE_CODES },
        counselor_id: { type: "integer" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tag names; created when missing.",
        },
        notes: { type: "string", description: "Logged as a note on the new prospect." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { title: "Create prospect" },
    handler: async (args, ctx) => {
      const email = str(args.email).toLowerCase();
      if (email) {
        const dupe = await ctx.crm.findPersonByEmail(email);
        if (dupe)
          return errorResult(
            `A prospect with ${email} already exists: ${dupe.name} (id ${dupe.id}). Use update_prospect or log_activity instead.`,
          );
      }
      let organization: string | null = null;
      if (str(args.school))
        organization = (await ctx.crm.findOrCreateOrganization(str(args.school))).id;
      const metadata: Metadata = {};
      for (const key of ["graduation_year", "entry_term", "entry_type", "residency"]) {
        if (str(args[key])) metadata[key] = str(args[key]);
      }
      const person = await ctx.crm.createPerson({
        name: str(args.name),
        primary_email: email || undefined,
        contact_numbers: str(args.phone) ? [str(args.phone)] : undefined,
        job_title: str(args.intended_program) || undefined,
        organization,
        lifecycle_stage: (str(args.stage) || "lead") as LifecycleStage,
        owner: num(args.counselor_id) ?? null,
        metadata,
      });
      for (const name of (Array.isArray(args.tags) ? args.tags : []).map(String)) {
        const tag = await ctx.crm.findOrCreateTag(name);
        await ctx.crm.attachTag("persons", person.id, tag.id);
      }
      if (str(args.notes)) {
        await ctx.crm.createActivity({
          type: "note",
          title: "Note",
          comment: str(args.notes),
          person: person.id,
          is_done: true,
          owner: num(args.counselor_id) ?? null,
        });
      }
      return { created: true, prospect: personView(person) };
    },
  }),
  T({
    name: "update_prospect",
    description:
      "Change a prospect's details: contact info, lifecycle stage, counselor, intended program, school, or any recruitment field (graduation_year, entry_term, entry_type, residency, gpa, city, state, country, parent_name, parent_email, sms_consent). Only the fields you pass change.",
    inputSchema: {
      type: "object",
      properties: {
        prospect_id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        school: { type: "string", description: "Name; found or created. Empty string clears." },
        intended_program: { type: "string" },
        stage: { type: "string", enum: LIFECYCLE_CODES },
        counselor_id: { type: ["integer", "null"] },
        fields: {
          type: "object",
          description: 'Recruitment fields to set; null or "" clears one.',
          additionalProperties: true,
        },
      },
      required: ["prospect_id"],
      additionalProperties: false,
    },
    annotations: { title: "Update prospect", idempotentHint: true },
    handler: async (args, ctx) => {
      const id = str(args.prospect_id);
      const body: Record<string, unknown> = {};
      if (str(args.name)) body.name = str(args.name);
      if (args.email !== undefined) body.primary_email = str(args.email).toLowerCase() || undefined;
      if (args.phone !== undefined) body.contact_numbers = str(args.phone) ? [str(args.phone)] : [];
      if (args.intended_program !== undefined) body.job_title = str(args.intended_program);
      if (str(args.stage)) body.lifecycle_stage = str(args.stage);
      if (args.counselor_id !== undefined)
        body.owner = args.counselor_id === null ? null : num(args.counselor_id);
      if (args.school !== undefined) {
        body.organization = str(args.school)
          ? (await ctx.crm.findOrCreateOrganization(str(args.school))).id
          : null;
      }
      let patch: Metadata = {};
      if (args.fields && typeof args.fields === "object") {
        for (const [k, v] of Object.entries(args.fields as Record<string, unknown>)) {
          // "Do not contact" and where a found person came from are not an agent's to change.
          if (KEPT_MARKS.has(k))
            return errorResult(`Not changed. "${k}" cannot be set by an agent.`);
          const field = PROSPECT_FIELDS.find((f) => f.key === k) ?? {
            key: k,
            label: k,
            type: "text" as const,
          };
          patch = { ...patch, ...metaPatch(field, v as string | boolean | number | null) };
        }
      }
      // Merged under a row lock, so a teammate's edit to other fields survives.
      let person = Object.keys(body).length ? await ctx.crm.updatePerson(id, body) : undefined;
      if (Object.keys(patch).length) person = await ctx.crm.patchMetadata("persons", id, patch);
      return { updated: true, prospect: personView(person ?? (await ctx.crm.getPerson(id))) };
    },
  }),

  // --------------------------------------------------------------- schools
  T({
    name: "list_schools",
    description:
      "High schools, colleges, community organizations and other partners on record, optionally filtered by name. Returns ids for linking prospects.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer" } },
      additionalProperties: false,
    },
    annotations: { title: "List schools", readOnlyHint: true },
    handler: async (args, ctx) => {
      const q = str(args.query);
      const rows = q
        ? (await ctx.crm.listOrganizations({ name: q, page_size: 100 })).results
        : await ctx.crm.allOrganizations(2);
      return {
        count: rows.length,
        schools: rows.slice(0, limitOf(args.limit, 50)).map((o) => ({
          id: o.id,
          name: o.name,
          type: (o.metadata as Metadata | undefined)?.school_type ?? null,
          city: o.address?.city ?? null,
          state: o.address?.state ?? null,
          counselor_id: o.owner ?? null,
          tags: (o.tags ?? []).map((t) => t.name),
        })),
      };
    },
  }),
  T({
    name: "create_school",
    description:
      "Add a school or partner organization (high school, community college, CBO, agency, employer).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: {
          type: "string",
          enum: [
            "high_school",
            "community_college",
            "university",
            "community_org",
            "agency",
            "employer",
            "other",
          ],
        },
        city: { type: "string" },
        state: { type: "string" },
        country: { type: "string" },
        counselor_id: { type: "integer" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { title: "Create school" },
    handler: async (args, ctx) => {
      const school = await ctx.crm.findOrCreateOrganization(str(args.name), {
        address: {
          city: str(args.city) || undefined,
          state: str(args.state) || undefined,
          country: str(args.country) || undefined,
        },
        owner: num(args.counselor_id) ?? null,
        metadata: str(args.type) ? { school_type: str(args.type) } : {},
      });
      return { school: { id: school.id, name: school.name } };
    },
  }),

  // ---------------------------------------------------------- applications
  T({
    name: "list_funnels",
    description:
      "The admissions funnels (pipelines) and their stages with stable codes. Call before creating or moving an application so you use the right funnel and stage code.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List funnels", readOnlyHint: true },
    handler: async (_args, ctx) => ({ funnels: (await ctx.crm.listPipelines()).map(funnelView) }),
  }),
  T({
    name: "list_applications",
    description:
      "Applications in a funnel, filtered by stage code, status (open / won=enrolled / lost=withdrawn), counselor, prospect or school. Use it for 'who is in Admitted but not deposited', 'my applications', or 'applications for Fall 2027' (filter by term client-side from the result).",
    inputSchema: {
      type: "object",
      properties: {
        funnel_code: { type: "string" },
        stage_code: { type: "string" },
        status: { type: "string", enum: ["open", "won", "lost"] },
        counselor_id: { type: "integer" },
        prospect_id: { type: "string" },
        school_id: { type: "string" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
    annotations: { title: "List applications", readOnlyHint: true },
    handler: async (args, ctx) => {
      const { pipelines, stageName, pipelineName } = await stageIndex(ctx.crm);
      const pipeline = str(args.funnel_code)
        ? pipelines.find((p) => p.code === str(args.funnel_code))
        : undefined;
      if (str(args.funnel_code) && !pipeline)
        return errorResult(`No funnel with code "${str(args.funnel_code)}". Call list_funnels.`);
      const stage = str(args.stage_code)
        ? (
            pipeline ??
            pipelines.find((p) => p.stages?.some((s) => s.code === str(args.stage_code)))
          )?.stages?.find((s) => s.code === str(args.stage_code))
        : undefined;
      if (str(args.stage_code) && !stage)
        return errorResult(`No stage with code "${str(args.stage_code)}". Call list_funnels.`);
      const rows = await ctx.crm.allDeals(
        {
          pipeline: pipeline?.id,
          stage: stage?.id,
          status: (str(args.status) || undefined) as Deal["status"] | undefined,
          owner: num(args.counselor_id),
          person: str(args.prospect_id) || undefined,
          organization: str(args.school_id) || undefined,
        },
        5,
      );
      return {
        count: rows.length,
        applications: rows
          .slice(0, limitOf(args.limit, 50))
          .map((d) => dealView(d, stageName.get(d.stage), pipelineName.get(d.pipeline))),
      };
    },
  }),
  T({
    name: "create_application",
    description:
      "Open an application for a prospect in a funnel: program, entry term and entry type are recorded; it starts in the given stage (or the funnel's first stage). Title defaults to 'Name — Program · Term'.",
    inputSchema: {
      type: "object",
      properties: {
        prospect_id: { type: "string" },
        funnel_code: { type: "string", description: "Default: the default funnel." },
        stage_code: { type: "string" },
        program: { type: "string" },
        term: { type: "string" },
        entry_type: {
          type: "string",
          enum: ["first_year", "transfer", "graduate", "international", "continuing_ed"],
        },
        title: { type: "string" },
        decision_deadline: { type: "string", description: "YYYY-MM-DD" },
        est_net_tuition: { type: "number" },
        source_code: {
          type: "string",
          description: "Code of an existing lead source, e.g. college_fair.",
        },
        counselor_id: { type: "integer" },
        notes: { type: "string" },
      },
      required: ["prospect_id"],
      additionalProperties: false,
    },
    annotations: { title: "Create application" },
    handler: async (args, ctx) => {
      const person = await ctx.crm.getPerson(str(args.prospect_id));
      const pipeline = await ctx.crm.resolvePipeline(str(args.funnel_code) || undefined);
      if (!pipeline)
        return errorResult(
          "This organization has no funnel yet. Ask an admin to create one in Settings → Funnels.",
        );
      const stages = [...(pipeline.stages ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      const stage = str(args.stage_code)
        ? stages.find((s) => s.code === str(args.stage_code))
        : stages.find((s) => !s.is_won && !s.is_lost);
      if (!stage)
        return errorResult(`Stage "${str(args.stage_code)}" is not in funnel "${pipeline.name}".`);
      const sourceCode = str(args.source_code);
      const sources = sourceCode ? await ctx.crm.listLeadSources() : [];
      const source = sources.find((s) => s.code === sourceCode);
      if (sourceCode && !source)
        return errorResult(
          `Source "${sourceCode}" doesn't exist. Sources: ${sources.map((s) => s.code).join(", ") || "none"}.`,
        );
      const metadata: Metadata = {};
      if (str(args.program)) metadata.program = str(args.program);
      if (str(args.term)) metadata.term = str(args.term);
      if (str(args.entry_type)) metadata.entry_type = str(args.entry_type);
      const deal = await ctx.crm.createDeal({
        title: str(args.title) || applicationTitle(person.name, str(args.program), str(args.term)),
        person: person.id,
        organization: person.organization ?? null,
        pipeline: pipeline.id,
        stage: stage.id,
        source: source?.id ?? null,
        owner: num(args.counselor_id) ?? person.owner ?? null,
        expected_close_date: str(args.decision_deadline) || null,
        lead_value:
          num(args.est_net_tuition) !== undefined ? String(num(args.est_net_tuition)) : undefined,
        description: str(args.notes) || undefined,
        metadata,
      });
      return { created: true, application: dealView(deal, stage.name, pipeline.name) };
    },
  }),
  T({
    name: "move_application",
    description:
      "Move an application to another stage of its funnel by stage code (e.g. applied → admitted). For the terminal outcomes use mark_enrolled or mark_withdrawn.",
    inputSchema: {
      type: "object",
      properties: { application_id: { type: "integer" }, stage_code: { type: "string" } },
      required: ["application_id", "stage_code"],
      additionalProperties: false,
    },
    annotations: { title: "Move application" },
    handler: async (args, ctx) => {
      const deal = await ctx.crm.moveDealStage(num(args.application_id) as number, {
        stage_code: str(args.stage_code),
      });
      const { stageName, pipelineName } = await stageIndex(ctx.crm);
      return {
        moved: true,
        application: dealView(deal, stageName.get(deal.stage), pipelineName.get(deal.pipeline)),
      };
    },
  }),
  T({
    name: "mark_enrolled",
    description:
      "Close an application as enrolled (the funnel's won stage) and set the prospect's lifecycle stage to Enrolled.",
    inputSchema: {
      type: "object",
      properties: { application_id: { type: "integer" } },
      required: ["application_id"],
      additionalProperties: false,
    },
    annotations: { title: "Mark enrolled" },
    handler: async (args, ctx) => {
      const deal = await ctx.crm.markDealWon(num(args.application_id) as number);
      await ctx.crm
        .updatePerson(deal.person, { lifecycle_stage: "customer" })
        .catch(() => undefined);
      return { enrolled: true, application: dealView(deal) };
    },
  }),
  T({
    name: "mark_withdrawn",
    description:
      "Close an application as withdrawn or denied, with the reason (required). Does not change the prospect's lifecycle stage unless `withdraw_prospect` is true.",
    inputSchema: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        reason: { type: "string" },
        withdraw_prospect: { type: "boolean", description: "Also mark the prospect as Withdrawn." },
      },
      required: ["application_id", "reason"],
      additionalProperties: false,
    },
    annotations: { title: "Mark withdrawn" },
    handler: async (args, ctx) => {
      const deal = await ctx.crm.markDealLost(
        num(args.application_id) as number,
        str(args.reason).slice(0, 255),
      );
      if (args.withdraw_prospect === true)
        await ctx.crm
          .updatePerson(deal.person, { lifecycle_stage: "churned" })
          .catch(() => undefined);
      return { withdrawn: true, application: dealView(deal) };
    },
  }),
  T({
    name: "update_application",
    description:
      "Edit an application's program, term, entry type, decision deadline, estimated net tuition, scholarship, counselor or notes.",
    inputSchema: {
      type: "object",
      properties: {
        application_id: { type: "integer" },
        title: { type: "string" },
        program: { type: "string" },
        term: { type: "string" },
        entry_type: { type: "string" },
        financial_aid: { type: "boolean" },
        scholarship: { type: "string" },
        decision_deadline: {
          type: ["string", "null"],
          description: "YYYY-MM-DD or null to clear.",
        },
        est_net_tuition: { type: ["number", "null"] },
        counselor_id: { type: ["integer", "null"] },
        notes: { type: "string" },
      },
      required: ["application_id"],
      additionalProperties: false,
    },
    annotations: { title: "Update application", idempotentHint: true },
    handler: async (args, ctx) => {
      const id = num(args.application_id) as number;
      const body: Record<string, unknown> = {};
      if (str(args.title)) body.title = str(args.title);
      if (args.notes !== undefined) body.description = str(args.notes);
      if (args.decision_deadline !== undefined)
        body.expected_close_date =
          args.decision_deadline === null ? null : str(args.decision_deadline) || null;
      if (args.est_net_tuition !== undefined)
        body.lead_value =
          args.est_net_tuition === null ? "0" : String(num(args.est_net_tuition) ?? 0);
      if (args.counselor_id !== undefined)
        body.owner = args.counselor_id === null ? null : num(args.counselor_id);
      let patch: Metadata = {};
      for (const field of APPLICATION_FIELDS) {
        if (args[field.key] !== undefined)
          patch = {
            ...patch,
            ...metaPatch(field, args[field.key] as string | boolean | number | null),
          };
      }
      let deal = Object.keys(body).length ? await ctx.crm.updateDeal(id, body) : undefined;
      if (Object.keys(patch).length) deal = await ctx.crm.patchMetadata<Deal>("deals", id, patch);
      deal ??= await ctx.crm.getDeal(id);
      const { stageName, pipelineName } = await stageIndex(ctx.crm);
      return {
        updated: true,
        application: dealView(deal, stageName.get(deal.stage), pipelineName.get(deal.pipeline)),
      };
    },
  }),

  // -------------------------------------------------------------- activity
  T({
    name: "log_activity",
    description:
      "Record work on a prospect or application: a call, meeting, email, note, task, visit (campus tour / school visit) or deadline. Give `scheduled_for` (ISO datetime) to schedule future work — it then appears as a task until completed; leave it out and set `done` true to log something that already happened.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ACTIVITY_CODES, description: "lunch = Visit" },
        title: { type: "string" },
        notes: { type: "string" },
        prospect_id: { type: "string" },
        application_id: { type: "integer" },
        scheduled_for: { type: "string", description: "ISO 8601 datetime." },
        remind_at: {
          type: "string",
          description: "ISO 8601 datetime for the counselor's reminder.",
        },
        location: { type: "string" },
        counselor_id: { type: "integer" },
        done: { type: "boolean" },
      },
      required: ["type", "title"],
      additionalProperties: false,
    },
    annotations: { title: "Log activity" },
    handler: async (args, ctx) => {
      if (!str(args.prospect_id) && num(args.application_id) === undefined)
        return errorResult(
          "Give a prospect_id or an application_id so the activity lands on a record.",
        );
      let personId = str(args.prospect_id) || undefined;
      if (!personId && num(args.application_id) !== undefined)
        personId = (await ctx.crm.getDeal(num(args.application_id) as number)).person;
      const activity = await ctx.crm.createActivity({
        type: str(args.type) as ActivityType,
        title: str(args.title),
        comment: str(args.notes) || undefined,
        person: personId,
        deal: num(args.application_id) ?? null,
        schedule_from: str(args.scheduled_for) || null,
        reminder_at: str(args.remind_at) || null,
        location: str(args.location) || undefined,
        owner: num(args.counselor_id) ?? null,
        is_done: args.done === true || (!str(args.scheduled_for) && str(args.type) === "note"),
      });
      return { logged: true, activity: activityView(activity) };
    },
  }),
  T({
    name: "list_tasks",
    description:
      "Open (not done) activities — overdue, due today, this week, or everything scheduled — optionally for one counselor. Use for 'what's on my plate' and follow-up planning.",
    inputSchema: {
      type: "object",
      properties: {
        range: { type: "string", enum: ["overdue", "today", "week", "all"] },
        counselor_id: { type: "integer" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
    annotations: { title: "List tasks", readOnlyHint: true },
    handler: async (args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start.getTime() + DAY);
      const weekEnd = new Date(start.getTime() + 7 * DAY);
      const rows = await ctx.crm.allActivities(
        { is_done: false, owner: num(args.counselor_id) },
        3,
      );
      const range = str(args.range) || "all";
      const filtered = rows.filter((a) => {
        if (range === "all") return true;
        if (!a.schedule_from) return false;
        const t = new Date(a.schedule_from);
        if (range === "overdue") return t < start;
        if (range === "today") return t >= start && t < end;
        return t >= start && t < weekEnd;
      });
      filtered.sort((a, b) =>
        String(a.schedule_from ?? "9").localeCompare(String(b.schedule_from ?? "9")),
      );
      return {
        range,
        count: filtered.length,
        tasks: filtered.slice(0, limitOf(args.limit, 50)).map(activityView),
      };
    },
  }),
  T({
    name: "complete_task",
    description: "Mark an activity done.",
    inputSchema: {
      type: "object",
      properties: { activity_id: { type: "integer" } },
      required: ["activity_id"],
      additionalProperties: false,
    },
    annotations: { title: "Complete task", idempotentHint: true },
    handler: async (args, ctx) => ({
      done: true,
      activity: activityView(await ctx.crm.markActivityDone(num(args.activity_id) as number)),
    }),
  }),

  // ------------------------------------------------------------------ tags
  T({
    name: "list_tags",
    description: "The shared tags (e.g. 'Honors', 'First-gen', 'Web inquiry') with ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List tags", readOnlyHint: true },
    handler: async (_args, ctx) => ({
      tags: (await ctx.crm.listTags()).map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color ?? null,
      })),
    }),
  }),
  T({
    name: "tag_record",
    description:
      "Attach a tag (by name; created when missing) to a prospect, school or application.",
    inputSchema: {
      type: "object",
      properties: {
        record_type: { type: "string", enum: ["prospect", "school", "application"] },
        record_id: { type: ["string", "integer"] },
        tag: { type: "string" },
      },
      required: ["record_type", "record_id", "tag"],
      additionalProperties: false,
    },
    annotations: { title: "Tag record", idempotentHint: true },
    handler: async (args, ctx) => {
      const tag = await ctx.crm.findOrCreateTag(str(args.tag));
      const host =
        str(args.record_type) === "prospect"
          ? "persons"
          : str(args.record_type) === "school"
            ? "organizations"
            : "deals";
      await ctx.crm.attachTag(host, args.record_id as string | number, tag.id);
      return { tagged: true, tag: { id: tag.id, name: tag.name } };
    },
  }),

  // ------------------------------------------------------------------ team
  T({
    name: "list_team",
    description:
      "The recruitment team — members of the organization with their platform user ids (the counselor_id other tools take).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      additionalProperties: false,
    },
    annotations: { title: "List team", readOnlyHint: true },
    handler: async (args, ctx) => ({
      team: await ctx.crm.listMembers(str(args.query) || undefined),
    }),
  }),

  // --------------------------------------------------------- landing pages
  T({
    name: "list_landing_pages",
    description:
      "The public landing pages (inquiry / event / interest pages) this organization publishes, with their URLs and how many submissions each received. Every submission becomes a prospect, with an application when the page opens one.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List landing pages", readOnlyHint: true },
    handler: async (_args, ctx) => {
      const pages = (await ctx.crm.listWebForms()).map(fromWebForm);
      const counts = await Promise.all(pages.map((p) => ctx.crm.countWebFormSubmissions(p.slug)));
      return {
        landing_pages: pages.map((p, i) => ({
          slug: p.slug,
          title: p.title,
          published: p.published,
          url: landingPageUrl(ctx.appUrl, ctx.org, p.slug),
          program: p.program || null,
          term: p.term || null,
          fields: p.fields.map((f) => f.label),
          submissions: counts[i],
        })),
      };
    },
  }),
  T({
    name: "create_landing_page",
    description:
      "Draft a new public landing page with an inquiry form (name, email, phone, school, graduation year, program, term, message by default). It stays unpublished until a person reviews it in Landing pages and switches Publish on: you cannot publish it. Returns its URL and the link to its editor, for that person. For an open house or a visit day, also give the event's start, place, sign-up deadline and time zone.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: 'e.g. "Fall 2027 Nursing Open House"' },
        slug: { type: "string" },
        headline: { type: "string" },
        subheadline: { type: "string" },
        highlights: { type: "array", items: { type: "string" } },
        program: { type: "string" },
        term: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        counselor_id: { type: "integer" },
        funnel_code: { type: "string" },
        stage_code: { type: "string" },
        source_code: {
          type: "string",
          description:
            'Code of an existing Source, e.g. web. Omitted: "web" when the organization has it, else none.',
        },
        cta_label: { type: "string" },
        event_starts_at: {
          type: "string",
          description: "ISO 8601 with the offset, e.g. 2027-03-13T10:00:00-05:00.",
        },
        event_ends_at: { type: "string" },
        event_place: { type: "string" },
        sign_up_by: { type: "string", description: "ISO 8601; sign-ups close here." },
        time_zone: { type: "string", description: "IANA zone, e.g. America/New_York." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { title: "Create landing page" },
    handler: async (args, ctx) => {
      // The CRM User key cannot mint a Source, so a page routes to an existing one or none.
      const sources = await ctx.crm.listLeadSources();
      const requested = str(args.source_code);
      if (requested && !sources.some((s) => s.code === requested))
        return errorResult(
          `Source "${requested}" doesn't exist. Sources: ${sources.map((s) => s.code).join(", ") || "none"}.`,
        );
      const sourceCode = requested || (sources.some((s) => s.code === "web") ? "web" : "");
      const page = newLandingPage({
        title: str(args.title),
        slug: str(args.slug) || undefined,
        headline: str(args.headline) || undefined,
        subheadline: str(args.subheadline) || undefined,
        highlights: Array.isArray(args.highlights) ? args.highlights.map(String) : undefined,
        program: str(args.program) || undefined,
        term: str(args.term) || undefined,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        ownerId: num(args.counselor_id) ?? null,
        pipelineCode: str(args.funnel_code) || undefined,
        stageCode: str(args.stage_code) || undefined,
        sourceCode,
        ctaLabel: str(args.cta_label) || undefined,
        // A person publishes: the agent also reads strangers' posts, in a run nobody watches.
        published: false,
        ...(str(args.event_starts_at) && {
          event: {
            startsAt: str(args.event_starts_at),
            timeZone: str(args.time_zone),
            ...(str(args.event_ends_at) && { endsAt: str(args.event_ends_at) }),
            ...(str(args.event_place) && { place: str(args.event_place) }),
            ...(str(args.sign_up_by) && { signUpBy: str(args.sign_up_by) }),
          },
        }),
      });
      const taken = (await ctx.crm.listWebForms()).some((f) => f.slug === page.slug);
      if (taken)
        return errorResult(
          `A landing page with slug "${page.slug}" already exists. Pick another slug.`,
        );
      const problems = validateLandingPage(page, { publish: page.published });
      if (problems.length) return errorResult(`The page can't be saved: ${problems[0].message}`);
      await ctx.crm.createWebForm(toWebForm(page));
      return {
        created: true,
        slug: page.slug,
        published: page.published,
        source: page.sourceCode || null,
        url: landingPageUrl(ctx.appUrl, ctx.org, page.slug),
        edit_in_app: `${ctx.appUrl}/platform/${encodeURIComponent(ctx.org)}/landing-pages/${encodeURIComponent(page.slug)}`,
      };
    },
  }),
  // ------------------------------------------------------------ follow-ups
  T({
    name: "list_outreach_due",
    description:
      "Who is due a message today, on which channel and why: a confirmation or reminder for an event they signed up for, the next step of their application stage's cadence (a taster course, an event, a check-in or a welcome), or the one first message to someone a connector found. Who, when, how often and where are decided here, not by you: write one message for each person listed and queue it with queue_message, using the channel, kind and event given. Use a course or event link only when one is given, exactly as given. People who may not be written to are left out and counted. It lists no more than the day's allowance of drafts has room for; when people are left over, call it again once these are queued. It also empties shortlists nobody reviewed in time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List outreach due" },
    handler: async (_args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      // The daily run calls this: a shortlist expires even when nobody finds students again.
      await expireShortlists(ctx, now);
      // ponytail: 1,000 open applications, the latest 1,000 follow-ups and 500 found people a call; a per-person read when a platform keeps more.
      const [input, deals, followUps, found, handoffs, drafted] = await Promise.all([
        cadenceInput(ctx, now),
        ctx.crm.allDeals({ status: "open" }, 10),
        ctx.crm.allActivities({ metadata__has_key: "follow_up", ordering: "-created_at" }, 10),
        // A record a merge retired is not a student to write to.
        ctx.crm.allPersons({ metadata__has_key: "found", active: true }),
        ctx.crm.allActivities({ metadata__has_key: "handoff", is_done: false }, 2),
        draftsToday(ctx, now),
      ]);
      const people = new Map(found.map((p) => [p.id, p]));
      // An application that names no program takes its person's; only one that can still be due is read for it.
      const reach = horizon(input.pipelines) * DAY;
      const unnamed = deals
        .filter((d) => !d.metadata?.program && now.getTime() - time(d.updated_at) <= reach)
        .map((d) => d.person)
        .filter((id) => !people.has(id));
      // ponytail: reads the first 200 people named, here and below; the rest count as left over.
      for (const p of await readPeople(ctx, [...new Set(unnamed)].slice(0, 200)))
        people.set(p.id, p);
      const programs = new Map([...people.values()].map((p) => [p.id, p.job_title ?? ""]));
      const all = needs({ ...input, now, deals, programs, found, followUps });
      const unread = [...new Set(all.map((n) => n.person))].filter((id) => !people.has(id));
      const tried = new Set(unread.slice(0, 200));
      for (const p of await readPeople(ctx, [...tried])) people.set(p.id, p);
      const held = new Set(handoffs.filter(handoffOf).map((a) => a.person ?? ""));
      const room = Math.max(0, dailyDrafts(ctx) - drafted);
      const listed = outreachDue(all, people, followUps, now, held, room);
      const { refused, left_over } = listed;
      let due = listed.due;
      // What scrolled out of the newest 1,000 follow-ups is forgotten above: where the list was cut, each person is checked against their own.
      if (followUps.length >= 1000) {
        const checked: typeof due = [];
        for (let i = 0; i < due.length; i += 10)
          checked.push(
            ...(
              await Promise.all(
                due.slice(i, i + 10).map(async (d) => {
                  const theirs = await ctx.crm.allActivities(
                    { person: d.person, metadata__has_key: "follow_up" },
                    2,
                  );
                  const again = needs({
                    ...input,
                    now,
                    programs,
                    deals: deals.filter((x) => x.person === d.person),
                    found: found.filter((p) => p.id === d.person),
                    followUps: theirs,
                  }).filter((n) => n.person === d.person);
                  const still = outreachDue(again, people, theirs, now, held).due.some(
                    (n) =>
                      n.reason === d.reason && n.step === d.step && n.event?.slug === d.event?.slug,
                  );
                  return still ? [d] : [];
                }),
              )
            ).flat(),
          );
        due = checked;
      }
      const publicUrl = ctx.appUrl.startsWith("https://");
      // The platform keeps a sign-up's `utm_*` keys: where the link was sent, and to whom.
      const link = (slug: string, d: (typeof due)[number]) => {
        const url = new URL(landingPageUrl(ctx.appUrl, ctx.org, slug));
        const via = foundOf(people.get(d.person) ?? {})?.platform ?? "recruit";
        url.search = new URLSearchParams({
          utm_source: via,
          utm_medium: d.channel,
          utm_content: d.person,
        }).toString();
        return url.toString();
      };
      return {
        as_of: now.toISOString(),
        due: due.map((d) => {
          const found = foundOf(people.get(d.person) ?? {});
          return {
            prospect_id: d.person,
            first_name: d.first_name,
            intended_program: d.intended_program,
            reason: d.reason,
            kind: d.reason === "confirmation" || d.reason === "reminder" ? d.reason : "nudge",
            channel: d.channel,
            ...(d.event && { event: d.event }),
            ...(d.application && { application: d.application }),
            ...(d.found_source && { found_source: d.found_source }),
            ...(found?.platform && { platform: found.platform }),
            ...(found?.said && { said: found.said }),
            ...(publicUrl &&
              d.course && { course: { title: d.course.title, url: link(d.course.slug, d) } }),
            ...(publicUrl &&
              d.reason === "event" &&
              d.event && { event_url: link(d.event.slug, d) }),
          };
        }),
        not_contactable: refused,
        // Over the cap only: someone read and gone (a deleted sign-up) is nobody to write to.
        left_over:
          left_over + all.filter((n) => !people.has(n.person) && !tried.has(n.person)).length,
      };
    },
  }),
  T({
    name: "queue_message",
    description:
      "Put an email, a text or a message on a social channel (dm) for a prospect in the queue under Needs you, where a person reviews and sends it. You send nothing yourself. Refused when the prospect asked not to be contacted, has no address for the channel, or did not ask for texts; when they already have a message waiting (except a confirmation or reminder for an event they have none for); within 7 days of the last message to them; when the agents reached the platform's daily allowance of drafts; for a text to someone a connector found; for an email or a text to a student found on a social channel; for a dm to anyone not found on a social channel or found where there are no direct messages (YouTube), to anyone who already had one, or longer than 900 characters with the line added at its foot; for a record a merge retired; and when a link in the subject or the message is not on this app or the university's own sites. Never work around a refusal.",
    inputSchema: {
      type: "object",
      properties: {
        prospect_id: { type: "string" },
        channel: { type: "string", enum: ["email", "text", "dm"] },
        kind: { type: "string", enum: ["confirmation", "reminder", "nudge", "reply"] },
        subject: { type: "string", maxLength: 200, description: "For an email." },
        body: { type: "string", maxLength: 4000 },
        application_id: { type: "integer" },
        event: {
          type: "string",
          maxLength: 64,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          description: "The event page's slug, for a confirmation or a reminder.",
        },
      },
      required: ["prospect_id", "channel", "body"],
      additionalProperties: false,
    },
    annotations: { title: "Queue a message" },
    handler: async (args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const person = await ctx.crm.getPerson(str(args.prospect_id));
      const channel =
        str(args.channel) === "text" || str(args.channel) === "dm"
          ? (str(args.channel) as "text" | "dm")
          : "email";
      const kind = str(args.kind) || "reply";
      const event = str(args.event);
      const found = foundOf(person);
      if (person.active === false)
        return errorResult(
          "Not queued. This record was retired by a merge: write to the one it was merged into.",
        );
      // Drafts are approved in batches and the agent holds none of the university's documents: any other link is invented.
      const foreign = foreignLink(`${str(args.subject)}\n${str(args.body)}`, ctx);
      if (foreign)
        return errorResult(
          `Not queued. The link to ${foreign} is not on this app or the university's own sites. Leave it out: a person can add it when they review the draft.`,
        );
      if (found && channel === "text")
        return errorResult("Not queued. Someone a connector found is never sent a text.");
      if (channel === "dm" && !found?.platform)
        return errorResult(
          "Not queued. A dm is only for a student found on a social channel. Use email.",
        );
      const refusal = contactRefusal(person, channel);
      if (refusal) return errorResult(`Not queued. ${refusal}`);
      const theirs = await ctx.crm.allActivities(
        { person: person.id, metadata__has_key: "follow_up" },
        2,
      );
      if (channel === "dm" && theirs.some((a) => followUpOf(a)?.channel === "dm"))
        return errorResult(
          `Not queued. They already had their one message on ${CHANNELS[found!.platform!].label}.`,
        );
      const forEvent = !!event && (kind === "confirmation" || kind === "reminder");
      let step: ReturnType<typeof stepDue> = null;
      if (forEvent) {
        // Only for an event they signed up for: the kind alone would let any message skip the wait below.
        const form = (await ctx.crm.listWebForms()).find((f) => f.slug === event);
        if (!form || !fromWebForm(form).event)
          return errorResult(`Not queued. "${event}" is not an event page.`);
        if (!(await signedUpFor(ctx, person.id, event)))
          return errorResult("Not queued. They are not signed up for that event.");
        if (theirs.some((a) => followUpOf(a)?.kind === kind && followUpOf(a)?.event === event))
          return errorResult(`Not queued. They already have a ${kind} for ${event}.`);
      } else {
        // Everything else waits: one open draft, and a week since they were last written to.
        const wait = nudgeRefusal(person.id, theirs, now);
        if (wait) return errorResult(`Not queued. ${wait}`);
        // The cadence step is the code's to stamp, never the agent's to claim, and only on the nudge the list asked for.
        const over = person.lifecycle_stage === "customer" || person.lifecycle_stage === "churned";
        if (channel === "email" && !over && kind === "nudge") {
          const deals = await ctx.crm.allDeals({ person: person.id, status: "open" }, 1);
          if (deals.length) {
            const input = {
              ...(await cadenceInputFor(ctx, now, person.id, deals)),
              now,
              deals,
              programs: new Map([[person.id, person.job_title ?? ""]]),
              found: [],
              followUps: theirs,
            };
            const [driver] = driving(deals, input);
            step = driver ? stepDue(driver, input) : null;
          }
        }
      }
      const allowance = dailyDrafts(ctx);
      if ((await draftsToday(ctx, now)) >= allowance)
        return errorResult(
          `Not queued. The agents wrote ${allowance} drafts in the last 24 hours, the most allowed; try again tomorrow.`,
        );
      const name = ctx.settings?.institutionName?.trim() || ctx.org;
      const body =
        channel === "dm"
          ? withLine(str(args.body), dmLine(name, found!.platform!))
          : found
            ? withLine(str(args.body), foundLine(name, found.source, ctx.settings?.mailingAddress))
            : str(args.body);
      if (channel === "dm" && body.length > DM_MAX)
        return errorResult(
          `Not queued. With the line added at its foot it is ${body.length - DM_MAX} characters over the ${DM_MAX} a first message may have.`,
        );
      const activity = await ctx.crm.createActivity({
        type: channel === "email" ? "email" : "task",
        title:
          channel === "dm"
            ? `Message on ${CHANNELS[found!.platform!].label}`
            : str(args.subject) || (channel === "email" ? "Email" : "Text"),
        comment: body,
        person: person.id,
        deal: step?.application?.id ?? num(args.application_id) ?? null,
        owner: person.owner ?? null,
        is_done: false,
        metadata: {
          follow_up: {
            channel,
            kind,
            by: "Chief of Staff (AI)",
            ...(event ? { event } : {}),
            ...(step?.step && { step: step.step }),
          },
        },
      });
      return { queued: true, id: activity.id, waits_for: "a person, under Needs you" };
    },
  }),
  T({
    name: "shortlist_found_students",
    description: `Propose students found on a social channel (${PLATFORMS.map((p) => CHANNELS[p].label).join(", ")}) as a shortlist under Needs you, where a person picks who is kept. Nothing about anyone is stored as a prospect and no one is contacted: give each person's name, handle, what they said in public about their own studies or plans in their own words, and why they match. Anyone a person passed over in the last ${PASSED_DAYS} days is left out. Refused until an admin has written in Settings why the university may contact people it finds; at most 50 people a call, 5 shortlists waiting and 200 people a day. Returns counts only.`,
    inputSchema: {
      type: "object",
      properties: {
        criteria: {
          type: "string",
          maxLength: 300,
          description: "What the person asked for, 10 to 300 characters.",
        },
        source: {
          type: "string",
          maxLength: 200,
          description:
            'Where you looked, e.g. "r/ApplyingToCollege" or "#futurenurse on Instagram".',
        },
        people: {
          type: "array",
          maxItems: SHORTLIST_MAX,
          description: `1 to ${SHORTLIST_MAX} people.`,
          items: {
            type: "object",
            properties: {
              name: { type: "string", maxLength: 80 },
              platform: { type: "string", enum: Object.keys(CHANNELS) },
              handle: { type: "string", maxLength: 40 },
              said: { type: "string", maxLength: 500, description: "Their own words." },
              why: { type: "string", maxLength: 300 },
              post_url: { type: "string", maxLength: 300 },
              bio: { type: "string", maxLength: 300 },
              program: { type: "string", maxLength: 120 },
              city: { type: "string", maxLength: 80 },
              state: { type: "string", maxLength: 80 },
              graduation_year: { type: "string", pattern: "^(19|20)\\d\\d$" },
            },
            required: ["name", "platform", "handle", "said", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["criteria", "source", "people"],
      additionalProperties: false,
    },
    annotations: { title: "Shortlist found students" },
    handler: async (args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const t = now.getTime();
      // Before anything can refuse: switching finding off must not keep anyone's details.
      await expireShortlists(ctx, now);
      const basis = str(ctx.settings?.foundBasis);
      if (basis.length < 10 || basis.length > 300)
        return errorResult(
          "Nothing saved. An admin must first write, in Settings → Connectors, why the university may contact people it finds, in 10 to 300 characters.",
        );
      const criteria = str(args.criteria);
      const source = str(args.source);
      const raw = Array.isArray(args.people) ? args.people : [];
      if (criteria.length < 10 || criteria.length > 300)
        return errorResult("Nothing saved. Say what was asked for in 10 to 300 characters.");
      if (source.length < 3 || source.length > 200)
        return errorResult("Nothing saved. Say where you looked in 3 to 200 characters.");
      if (!raw.length || raw.length > SHORTLIST_MAX)
        return errorResult(`Nothing saved. Send 1 to ${SHORTLIST_MAX} people at a time.`);
      const waitingLists = await ctx.crm.allActivities(
        { metadata__has_key: "shortlist", is_done: false },
        2,
      );
      if (waitingLists.length >= OPEN_SHORTLISTS)
        return errorResult(
          `Nothing saved. ${OPEN_SHORTLISTS} shortlists are waiting for a person under Needs you; they are reviewed first.`,
        );
      const recent = await ctx.crm.allActivities(
        { metadata__has_key: "shortlist", ...createdSince(t - DAY, t) },
        2,
      );
      const today = recent
        .filter((a) => t - time(a.created_at) < DAY)
        .reduce((n, a) => n + (shortlistOf(a)?.proposed ?? 0), 0);
      const room = Math.max(0, FOUND_PER_DAY - today);
      // People a person passed over lately: their handle alone was kept, for this.
      const passedOver = new Set(
        (
          await ctx.crm.allActivities(
            { metadata__has_key: "passed", ...createdSince(t - PASSED_DAYS * DAY, t) },
            5,
          )
        ).flatMap((a) =>
          Array.isArray(a.metadata?.passed)
            ? a.metadata.passed.filter((u): u is string => typeof u === "string")
            : [],
        ),
      );
      const waiting = new Set(
        waitingLists.flatMap(
          (a) => shortlistOf(a)?.people.map((c) => uniqueIdOf(c.platform, c.handle)) ?? [],
        ),
      );
      const refused: Record<string, number> = {};
      const refuse = (why: string) => (refused[why] = (refused[why] ?? 0) + 1);
      const kept: FoundCandidate[] = [];
      const seen = new Set<string>();
      let twice = 0;
      let alreadyWaiting = 0;
      let passedRecently = 0;
      for (const r of raw) {
        const c = cleanCandidate(r);
        if (typeof c === "string") {
          refuse(c);
          continue;
        }
        delete c.on_file; // set below from the record, never from what the agent sent
        const uid = uniqueIdOf(c.platform, c.handle);
        if (seen.has(uid)) twice += 1;
        else if (waiting.has(uid)) alreadyWaiting += 1;
        else if (passedOver.has(uid)) passedRecently += 1;
        else if (kept.length >= room)
          refuse(`The platform's limit of ${FOUND_PER_DAY} students found a day is reached.`);
        else kept.push(c);
        seen.add(uid);
      }
      let onFile = 0;
      for (let i = 0; i < kept.length; i += 10)
        await Promise.all(
          kept.slice(i, i + 10).map(async (c) => {
            const uid = uniqueIdOf(c.platform, c.handle);
            // `search` is a substring match ("instagram:jess" finds "instagram:jessica"): a full page, then the exact one.
            const { results } = await ctx.crm.listPersons({ search: uid, page_size: 100 });
            const match = results.find((p) => p.unique_id === uid);
            if (match) {
              c.on_file = match.id;
              onFile += 1;
            }
          }),
        );
      const counts = {
        shortlisted: kept.length,
        already_on_file: onFile,
        listed_twice: twice,
        already_waiting: alreadyWaiting,
        passed_over_recently: passedRecently,
        refused,
      };
      if (!kept.length)
        return errorResult(`Nothing saved: nobody could be kept. ${JSON.stringify(counts)}`);
      const holder = await ctx.crm.findOrCreateOrganization(SHORTLIST_HOLDER);
      await ctx.crm.createActivity({
        type: "task",
        title: `Students found: ${criteria}`.slice(0, 255),
        comment: `${kept.length} found on ${source}, for a person to pick who is kept.`,
        organization: holder.id,
        is_done: false,
        metadata: {
          shortlist: {
            criteria,
            source,
            basis,
            at: now.toISOString(),
            proposed: kept.length,
            people: kept,
          },
        },
      });
      return { ...counts, waits_for: "a person, under Needs you" };
    },
  }),
  T({
    name: "enrich_found_prospect",
    description:
      "Save what a kept student's public profile shows, read with the connector's scraper on the channel they were found on and nowhere else: bio, website, city, state, school, program, class year, up to 5 interests and up to 3 of their own recent posts about their studies, each with its link. It replaces what an earlier read saved, fills the record's program, city, state and class year only where they are empty, and notes what was added. Refused for anyone not found on a social channel, anyone who asked not to be contacted, a record a merge retired, and until an admin has written in Settings why the university may contact people it finds.",
    inputSchema: {
      type: "object",
      properties: {
        prospect_id: { type: "string" },
        bio: { type: "string", maxLength: 300 },
        website: {
          type: "string",
          maxLength: 200,
          description: "An https link from their profile.",
        },
        city: { type: "string", maxLength: 80 },
        state: { type: "string", maxLength: 80 },
        school: { type: "string", maxLength: 120 },
        program: { type: "string", maxLength: 120 },
        graduation_year: { type: "string", pattern: "^(19|20)\\d\\d$" },
        interests: { type: "array", maxItems: 5, items: { type: "string", maxLength: 40 } },
        posts: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              said: { type: "string", maxLength: 500, description: "Their own words." },
              post_url: { type: "string", maxLength: 300 },
            },
            required: ["said"],
            additionalProperties: false,
          },
        },
      },
      required: ["prospect_id"],
      additionalProperties: false,
    },
    annotations: { title: "Enrich a found student" },
    handler: async (args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const person = await ctx.crm.getPerson(str(args.prospect_id));
      const refusal = enrichRefusal(person, ctx.settings?.foundBasis);
      if (refusal) return errorResult(`Nothing saved. ${refusal}`);
      const platform = foundOf(person)!.platform!;
      const profile = cleanProfile(platform, args);
      if (typeof profile === "string") return errorResult(`Nothing saved. ${profile}`);
      // A merge patch: `null` drops what an earlier read saved and this one did not find.
      const read = Object.fromEntries(PROFILE_KEYS.map((k) => [k, profile[k] ?? null]));
      const meta = person.metadata ?? {};
      const fill = Object.fromEntries(
        (["city", "state", "graduation_year"] as const)
          .filter((k) => profile[k] && !str(meta[k]))
          .map((k) => [k, profile[k]]),
      );
      await ctx.crm.patchMetadata("persons", person.id, {
        found: { profile: { ...read, at: now.toISOString() } },
        ...fill,
      });
      const program = profile.program && !person.job_title?.trim() ? profile.program : "";
      if (program) await ctx.crm.updatePerson(person.id, { job_title: program });
      const added = Object.keys(profile);
      await ctx.crm.createActivity({
        type: "note",
        title: `Read their public ${CHANNELS[platform].label} profile`,
        comment: `Saved from their profile: ${added.join(", ")}.`,
        person: person.id,
        owner: person.owner ?? null,
        is_done: true,
      });
      return {
        enriched: true,
        added,
        filled_where_empty: [...Object.keys(fill), ...(program ? ["program"] : [])],
      };
    },
  }),
  T({
    name: "add_found_prospects",
    description:
      "Add contacts with a published work address that a connector (such as a web scraper) found: school counselors, advisers, a published list. Never students found on a social channel: those go to shortlist_found_students, for a person to pick. Give where they were found. Refused until an admin has written, in Settings → Connectors, why the university may contact people it finds; that is kept with each person. An email already on file is skipped and that person is left unchanged; everyone else becomes an inquiry marked as found, with no phone number. At most 200 a day. Contacts no one and drafts nothing; returns counts only.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          maxLength: 200,
          description: "Where they were found: a name, or an https URL.",
        },
        people: {
          type: "array",
          description: "1 to 50 people.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", maxLength: 80 },
              email: { type: "string", maxLength: 254, pattern: EMAIL_PATTERN },
              program: { type: "string", maxLength: 120 },
              school: { type: "string", maxLength: 120 },
              note: { type: "string", maxLength: 500 },
            },
            required: ["name", "email"],
            additionalProperties: false,
          },
        },
      },
      required: ["source", "people"],
      additionalProperties: false,
    },
    annotations: { title: "Add found prospects" },
    handler: async (args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const source = str(args.source);
      // The admin's, from Settings: an agent reading a scraped page does not decide who may be written to.
      const basis = str(ctx.settings?.foundBasis);
      const people = Array.isArray(args.people) ? (args.people as Record<string, unknown>[]) : [];
      if (
        source.length < 3 ||
        source.length > 200 ||
        (/^\w+:/.test(source) && !/^https:\/\/\S+$/.test(source))
      )
        return errorResult(
          "Nothing added. The source is a name or an https URL, 3 to 200 characters.",
        );
      if (basis.length < 10 || basis.length > 300)
        return errorResult(
          "Nothing added. An admin must first write, in Settings → Connectors, why the university may contact people it finds, in 10 to 300 characters.",
        );
      if (!people.length || people.length > 50)
        return errorResult("Nothing added. Send 1 to 50 people at a time.");
      const { count } = await ctx.crm.listPersons({
        metadata__has_key: "found",
        created_at__gte: new Date(now.getTime() - DAY).toISOString(),
        page_size: 1,
      });
      let room = Math.max(0, 200 - count);
      let added = 0;
      let onFile = 0;
      const refused: Record<string, number> = {};
      const refuse = (why: string) => (refused[why] = (refused[why] ?? 0) + 1);
      const seen = new Set<string>();
      for (const p of people) {
        const name = str(p?.name);
        const email = str(p?.email).toLowerCase();
        const [program, school, note] = [str(p?.program), str(p?.school), str(p?.note)];
        if (!name || name.length > 80) refuse("A name is missing or longer than 80 characters.");
        else if (email.length > 254 || !new RegExp(EMAIL_PATTERN).test(email))
          refuse("The email address is not valid.");
        else if (program.length > 120 || school.length > 120 || note.length > 500)
          refuse("A program, school or note is too long.");
        else if (seen.has(email) || (await ctx.crm.findPersonByEmail(email))) onFile += 1;
        else if (room <= 0) refuse("The platform's limit of 200 found people a day is reached.");
        else {
          const organization = school ? (await ctx.crm.findOrCreateOrganization(school)).id : null;
          const person = await ctx.crm.createPerson({
            name,
            primary_email: email,
            job_title: program || undefined,
            organization,
            lifecycle_stage: "lead",
            metadata: { found: { source, basis, at: now.toISOString() } },
          });
          if (note)
            await ctx.crm.createActivity({
              type: "note",
              title: "Note",
              comment: note,
              person: person.id,
              is_done: true,
            });
          room -= 1;
          added += 1;
        }
        seen.add(email);
      }
      return { added, already_on_file: onFile, refused };
    },
  }),
  T({
    name: "queue_event_messages",
    description:
      "Queue a confirmation or a reminder for everyone signed up for an event page, through its form or in chat, who has none of that kind yet. Each is a draft under Needs you for a person to review and send; you send nothing. People who asked not to be contacted or have no email address are skipped and counted.",
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "The event page's slug, from list_landing_pages." },
        kind: { type: "string", enum: ["confirmation", "reminder"] },
      },
      required: ["event", "kind"],
      additionalProperties: false,
    },
    annotations: { title: "Queue event messages" },
    handler: async (args, ctx) => {
      const now = (ctx.now ?? (() => new Date()))();
      const slug = str(args.event);
      const kind = str(args.kind) === "reminder" ? "reminder" : "confirmation";
      const form = (await ctx.crm.listWebForms()).find((f) => f.slug === slug);
      const page = form && fromWebForm(form);
      const event = page?.event;
      if (!page || !event)
        return errorResult(
          `"${slug}" is not an event page. Call list_landing_pages for the slugs.`,
        );
      const [submissions, bookings, written] = await Promise.all([
        ctx.crm.allWebFormSubmissions(slug),
        ctx.crm.allActivities({ metadata__has_key: "booking" }),
        ctx.crm.allActivities({ metadata__has_key: "follow_up", ordering: "-created_at" }, 10),
      ]);
      const signedUp = new Set<string>();
      for (const s of submissions) if (s.person) signedUp.add(s.person);
      for (const a of bookings) if (a.person && bookedEvent(a) === slug) signedUp.add(a.person);
      const has = new Set(
        written
          .filter((a) => followUpOf(a)?.kind === kind && followUpOf(a)?.event === slug)
          .map((a) => a.person),
      );
      const waiting = [...signedUp].filter((id) => !has.has(id));
      const skipped: Record<string, number> = {};
      let queued = 0;
      // The day's allowance is shared with queue_message; the rest wait for another day.
      const batch = waiting.slice(0, Math.max(0, dailyDrafts(ctx) - (await draftsToday(ctx, now))));
      for (const person of await readPeople(ctx, batch)) {
        const id = person.id;
        const refusal = contactRefusal(person, "email");
        if (refusal) {
          skipped[refusal] = (skipped[refusal] ?? 0) + 1;
          continue;
        }
        const { subject, body } = eventMessage(kind, person, { title: page.title, event });
        await ctx.crm.createActivity({
          type: "email",
          title: subject,
          comment: body,
          person: id,
          owner: person.owner ?? page.ownerId ?? null,
          is_done: false,
          metadata: {
            follow_up: { channel: "email", kind, by: "Chief of Staff (AI)", event: slug },
          },
        });
        queued += 1;
      }
      return {
        queued,
        already_had_one: signedUp.size - waiting.length,
        skipped,
        left_for_another_call: waiting.length - batch.length,
        waits_for: "a person, under Needs you",
      };
    },
  }),
];

export const RECRUIT_MCP_INFO = {
  name: "iblai-recruit",
  title: "ibl.ai/recruit",
  version: "0.1.0",
  instructions:
    "Tools over a university recruitment CRM: prospects, schools, applications in admissions funnels, activities, tags, landing pages. Stage and funnel arguments are stable codes from list_funnels. Nothing here deletes data.",
};

/** The MCP server with every recruitment tool registered. */
export function createRecruitServer(): McpServer<ToolContext> {
  const server = new McpServer<ToolContext>(RECRUIT_MCP_INFO);
  for (const t of RECRUIT_TOOLS) server.tool(t);
  return server;
}
