/**
 * The Chief of Staff's tools — what the agent can look up and do in the
 * recruitment CRM on behalf of the team. Every tool runs with the
 * organization's authority (the server's Platform API Token) against the
 * same `/dm/api/crm/…` resources the app's screens use, so what the agent
 * changes is what the team sees, and vice versa.
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
  withMeta,
  type Metadata,
} from "../recruit/fields";
import { LIFECYCLE_LABELS, ACTIVITY_LABELS, STATUS_LABELS } from "../recruit/vocabulary";
import { landingPageUrl, newLandingPage, type LandingPage } from "../recruit/landing-pages";
import type { CrmServer } from "../recruit/crm-server";
import { McpServer, errorResult, type ToolDefinition } from "./protocol";

export interface ToolContext {
  org: string;
  crm: CrmServer;
  /** Public origin of this app, for landing-page links. */
  appUrl: string;
  /** Read the app's org settings (landing pages, …). */
  readSettings: () => Promise<{ landingPages?: LandingPage[]; [k: string]: unknown }>;
  /** Merge a patch into the app's org settings. */
  writeSettings: (patch: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
}

const DAY = 24 * 60 * 60 * 1000;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const limitOf = (v: unknown, dflt = 25, max = 100) => Math.min(max, Math.max(1, num(v) ?? dflt));

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
      const [{ pipelines, stageName, pipelineName }, deals, openActivities, people] =
        await Promise.all([
          stageIndex(ctx.crm),
          ctx.crm.allDeals({ status: "open" }, 10),
          ctx.crm.allActivities({ is_done: false }, 3),
          ctx.crm.listPersons({ page_size: 100 }),
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
      const weekAgo = new Date(now.getTime() - 7 * DAY);
      const newInquiries = people.results.filter((p) => new Date(p.created_at) >= weekAgo);
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
        new_inquiries_7d: newInquiries.length,
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
      "Find prospects (students, applicants, contacts) by name, email, phone or intended program, optionally narrowed by lifecycle stage, counselor or tag. Returns up to `limit` matches with their ids — use the id with get_prospect, create_application or log_activity.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Part of a name, email, phone or program. Omit to list recent prospects.",
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
      const q = str(args.query).toLowerCase();
      const limit = limitOf(args.limit);
      const filters = {
        lifecycle_stage: (str(args.stage) || undefined) as LifecycleStage | undefined,
        owner: num(args.counselor_id),
        tags: num(args.tag_id) ? String(args.tag_id) : undefined,
      };
      const rows = await ctx.crm.allPersons(filters, q ? 5 : 1);
      const hits = rows.filter(
        (p) =>
          !q ||
          [p.name, p.primary_email, p.job_title, ...(p.emails ?? []), ...(p.contact_numbers ?? [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      );
      return { count: hits.length, prospects: hits.slice(0, limit).map((p) => personView(p)) };
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
      const school = person.organization
        ? await ctx.crm
            .listOrganizations({ page_size: 100 })
            .then((r) => r.results.find((o) => o.id === person.organization))
        : undefined;
      return {
        prospect: personView(person, { school: school?.name ?? null }),
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
        const dupe = await ctx.crm.findPersonByEmail(email, 3);
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
      const current = await ctx.crm.getPerson(id);
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
      if (args.fields && typeof args.fields === "object") {
        let metadata: Metadata = { ...(current.metadata ?? {}) };
        for (const [k, v] of Object.entries(args.fields as Record<string, unknown>)) {
          const field = PROSPECT_FIELDS.find((f) => f.key === k) ?? {
            key: k,
            label: k,
            type: "text" as const,
          };
          metadata = withMeta(metadata, field, v as string | boolean | number | null);
        }
        body.metadata = metadata;
      }
      const person = await ctx.crm.updatePerson(id, body);
      return { updated: true, prospect: personView(person) };
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
          description: "Lead-source code, e.g. college_fair; created when missing.",
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
      const source = str(args.source_code)
        ? await ctx.crm.findOrCreateLeadSource(str(args.source_code))
        : undefined;
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
      const current = await ctx.crm.getDeal(id);
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
      let metadata: Metadata = { ...(current.metadata ?? {}) };
      for (const field of APPLICATION_FIELDS) {
        if (args[field.key] !== undefined)
          metadata = withMeta(metadata, field, args[field.key] as string | boolean | number | null);
      }
      body.metadata = metadata;
      const deal = await ctx.crm.updateDeal(id, body);
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
      "The public landing pages (inquiry / event / interest forms) this organization publishes, with their URLs and submission counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List landing pages", readOnlyHint: true },
    handler: async (_args, ctx) => {
      const settings = await ctx.readSettings();
      return {
        landing_pages: (settings.landingPages ?? []).map((p) => ({
          slug: p.slug,
          title: p.title,
          published: p.published,
          url: landingPageUrl(ctx.appUrl, ctx.org, p.slug),
          submissions: p.submissions ?? 0,
          program: p.program || null,
          term: p.term || null,
          fields: p.fields.map((f) => f.label),
        })),
      };
    },
  }),
  T({
    name: "create_landing_page",
    description:
      "Draft a new public landing page with an inquiry form (name, email, phone, school, graduation year, program, term, message by default). Returns its URL; it stays unpublished until a human reviews it in Landing pages and toggles Publish, unless `publish` is true.",
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
        cta_label: { type: "string" },
        publish: { type: "boolean" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { title: "Create landing page" },
    handler: async (args, ctx) => {
      const settings = await ctx.readSettings();
      const pages = settings.landingPages ?? [];
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
        ctaLabel: str(args.cta_label) || undefined,
        published: args.publish === true,
      });
      if (pages.some((p) => p.slug === page.slug))
        return errorResult(
          `A landing page with slug "${page.slug}" already exists. Pick another slug.`,
        );
      await ctx.writeSettings({ landingPages: [...pages, page] });
      return {
        created: true,
        slug: page.slug,
        published: page.published,
        url: landingPageUrl(ctx.appUrl, ctx.org, page.slug),
        edit_in_app: `${ctx.appUrl}/platform/${encodeURIComponent(ctx.org)}/landing-pages/${encodeURIComponent(page.slug)}`,
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
