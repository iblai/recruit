/**
 * Recruit's sample on the community organization: the demo workspace
 * (`../demo-data.ts`, what `pnpm seed:demo` writes) as the platform returns
 * it — ids, timestamps, names and `app: "recruit"` on every record — with the
 * visitor and three counselors as owners. Deterministic; dates sit relative to
 * `now`. Relative imports only, like the demo data.
 */
import { CRM_APP } from "../../crm/app";
import type {
  Activity,
  ActivityType,
  CrmMember,
  Deal,
  LeadSource,
  Organization,
  Person,
  Pipeline,
  PipelineStage,
  Tag,
  TagChip,
  WebForm,
  WebFormSubmission,
} from "../../crm/types";
import { ADMISSIONS_FUNNEL, ADMISSIONS_SOURCES, ADMISSIONS_STAGES } from "../admissions";
import {
  DEMO_PROSPECTS,
  DEMO_SCHOOLS,
  DEMO_TAGS,
  DEMO_TERM,
  demoLandingPage,
  lifecycleFor,
} from "../demo-data";
import { applicationTitle } from "../fields";
import { newLandingPage, toWebForm } from "../landing-pages";

/** A record as the platform tags it with the app it belongs to. */
export type Scoped<T> = T & { app: string };

/** The visitor, who owns a quarter of the sample. */
export interface SampleVisitor {
  id: number;
  username: string;
  name?: string;
}

export interface Sample {
  members: CrmMember[];
  tags: Scoped<Tag>[];
  sources: Scoped<LeadSource>[];
  pipeline: Scoped<Pipeline>;
  schools: Scoped<Organization>[];
  prospects: Scoped<Person>[];
  applications: Scoped<Deal>[];
  activities: Scoped<Activity>[];
  forms: Scoped<WebForm>[];
  submissions: WebFormSubmission[];
}

const PLATFORM = 1;
const DAY = 86_400_000;
const app = CRM_APP;

const COUNSELORS: CrmMember[] = [
  {
    id: 9102,
    username: "rosa.delgado",
    name: "Rosa Delgado",
    email: "rosa.delgado@example.edu",
    is_admin: false,
  },
  {
    id: 9103,
    username: "ben.achebe",
    name: "Ben Achebe",
    email: "ben.achebe@example.edu",
    is_admin: false,
  },
  {
    id: 9104,
    username: "mira.kapoor",
    name: "Mira Kapoor",
    email: "mira.kapoor@example.edu",
    is_admin: false,
  },
];

const pad = (n: number, width: number) => String(n).padStart(width, "0");
/** A stable UUID: `kind` 1 prospects, 2 schools, 3 submissions. */
const uuid = (kind: number, n: number) => `7ec0${pad(kind, 4)}-0000-4000-8000-${pad(n, 12)}`;

/** The sample's owners: the visitor first, then three counselors. */
export function sampleMembers(visitor: SampleVisitor): CrmMember[] {
  return [
    {
      id: visitor.id,
      username: visitor.username,
      name: visitor.name || visitor.username,
      email: null,
      is_admin: false,
    },
    ...COUNSELORS,
  ];
}

/** The sample for `now`'s day, owned in part by `visitor`. */
export function buildSample(now: Date, visitor: SampleVisitor): Sample {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const at = (days: number, hour = 9) =>
    new Date(today.getTime() + days * DAY + hour * 3_600_000).toISOString();
  const day = (days: number) => at(days, 0).slice(0, 10);
  const members = sampleMembers(visitor);
  const owner = (i: number) => members[i % members.length].id;
  const stamp = { created_at: at(-120), updated_at: at(-120) };

  const tags: Scoped<Tag>[] = DEMO_TAGS.map(([name, color], i) => ({
    id: i + 1,
    platform: PLATFORM,
    name,
    color,
    app,
    ...stamp,
  }));
  const chips = (names: readonly string[]): TagChip[] =>
    names
      .map((n) => tags.find((t) => t.name === n)!)
      .map((t) => ({ id: t.id, name: t.name, color: t.color ?? "" }));

  const sources: Scoped<LeadSource>[] = ADMISSIONS_SOURCES.map((s, i) => ({
    id: i + 1,
    platform: PLATFORM,
    name: s.name,
    code: s.code,
    app,
    ...stamp,
  }));

  const stages: PipelineStage[] = ADMISSIONS_STAGES.map((s, i) => ({
    id: 21 + i,
    pipeline: 2,
    code: s.code,
    name: s.name,
    probability: s.probability,
    sort_order: i,
    is_won: !!s.is_won,
    is_lost: !!s.is_lost,
    ...stamp,
  }));
  const stageOf = (code: string) => stages.find((s) => s.code === code)!;
  const pipeline: Scoped<Pipeline> = {
    id: 2,
    platform: PLATFORM,
    name: `${ADMISSIONS_FUNNEL.name} ${DEMO_TERM}`,
    code: ADMISSIONS_FUNNEL.code,
    is_default: true,
    rotten_days: ADMISSIONS_FUNNEL.rotten_days,
    stages,
    app,
    ...stamp,
  };

  const schools: Scoped<Organization>[] = DEMO_SCHOOLS.map((s, i) => ({
    id: uuid(2, i + 1),
    platform: PLATFORM,
    name: s.name,
    address: { city: s.city, state: s.state, country: "United States" },
    owner: owner(i),
    tags: [],
    metadata: { school_type: s.type },
    app,
    created_at: at(-110 + i, 10),
    updated_at: at(-60 + i, 10),
  }));

  const prospects: Scoped<Person>[] = DEMO_PROSPECTS.map((p, i) => ({
    id: uuid(1, i + 1),
    platform: PLATFORM,
    name: p.name,
    primary_email: p.email,
    emails: [p.email],
    contact_numbers: [`+1 512 555 01${pad(i, 2)}`],
    job_title: p.program,
    organization: schools[p.school].id,
    organization_name: schools[p.school].name,
    owner: owner(i),
    platform_user: null,
    lifecycle_stage: lifecycleFor(p.stage),
    active: true,
    tags: chips(p.tags),
    metadata: {
      graduation_year: p.grad,
      entry_term: DEMO_TERM,
      entry_type: p.entry ?? "first_year",
      residency: p.residency,
      gpa: Number((3.2 + (i % 8) / 10).toFixed(1)),
    },
    app,
    created_at: at(-40 + 3 * i, 11),
    updated_at: at(-20 + i, 15),
  }));

  const applications: Scoped<Deal>[] = DEMO_PROSPECTS.map((p, i) => {
    const won = p.stage === "enrolled";
    const lost = p.stage === "withdrawn";
    const person = prospects[i];
    return {
      id: 301 + i,
      platform: PLATFORM,
      title: applicationTitle(p.name, p.program, DEMO_TERM),
      lead_value: (18000 + (i % 5) * 2500).toFixed(2),
      currency: "USD",
      status: won ? "won" : lost ? "lost" : "open",
      ...(lost ? { lost_reason: "Chose another institution" } : {}),
      expected_close_date: day(20 + i * 5),
      closed_at: won || lost ? at(-3 - i, 16) : null,
      person: person.id,
      person_name: person.name,
      organization: person.organization ?? null,
      organization_name: person.organization_name ?? null,
      pipeline: pipeline.id,
      stage: stageOf(won ? "enrolled" : lost ? "withdrawn" : p.stage).id,
      source: sources[i % sources.length].id,
      owner: person.owner ?? null,
      tags: [],
      metadata: {
        program: p.program,
        term: DEMO_TERM,
        entry_type: p.entry ?? "first_year",
        financial_aid: i % 2 === 0,
      },
      app,
      created_at: person.created_at,
      updated_at: at(-2 - (i % 6), 13),
    };
  });

  const activity = (
    id: number,
    i: number,
    type: ActivityType,
    title: string,
    offset: number,
    done: boolean,
  ): Scoped<Activity> => ({
    id,
    platform: PLATFORM,
    title,
    type,
    ...(type === "lunch" ? { location: "Campus café" } : {}),
    comment: "",
    schedule_from: at(offset, 10 + (i % 6)),
    schedule_to: at(offset, 11 + (i % 6)),
    is_done: done,
    done_at: done ? at(offset, 11 + (i % 6)) : null,
    deal: applications[i].id,
    person: prospects[i].id,
    owner: prospects[i].owner ?? null,
    reminder_at: null,
    reminder_sent: false,
    app,
    created_at: at(Math.min(offset, 0) - 1),
    updated_at: at(done ? offset : Math.min(offset, 0) - 1),
  });
  const activities: Scoped<Activity>[] = [
    ...DEMO_PROSPECTS.map((_, i) =>
      activity(
        401 + i,
        i,
        i % 3 === 0 ? "call" : i % 3 === 1 ? "email" : "lunch",
        i % 3 === 2 ? "Campus tour" : "Intro conversation",
        -14 + i,
        true,
      ),
    ),
    ...DEMO_PROSPECTS.flatMap((p, i) =>
      i % 2 === 0
        ? [
            activity(
              431 + i,
              i,
              "task",
              `Follow up with ${p.name.split(" ")[0]} about ${p.program.replace(/^B\.[A-Z.]+\s/, "")}`,
              i - 4,
              false,
            ),
          ]
        : [],
    ),
  ];

  const input = toWebForm(newLandingPage(demoLandingPage(DEMO_TERM)));
  const form: Scoped<WebForm> = {
    id: 1,
    platform: PLATFORM,
    slug: input.slug ?? "request-information",
    name: input.name ?? "Request information",
    is_published: input.is_published ?? true,
    fields: input.fields ?? [],
    routing: input.routing!,
    metadata: input.metadata ?? {},
    success_title: input.success_title ?? "",
    success_message: input.success_message ?? "",
    app,
    created_at: at(-30, 9),
    updated_at: at(-30, 9),
  };
  const submissions: WebFormSubmission[] = DEMO_PROSPECTS.flatMap((p, i) =>
    p.tags.includes("Web inquiry")
      ? [
          {
            id: uuid(3, i + 1),
            person: prospects[i].id,
            deal: applications[i].id,
            answers: { name: p.name, email: p.email, program: p.program },
            utm: { utm_source: "search", utm_campaign: "fall-open-house" },
            page_url: `/p/main/${form.slug}`,
            created_at: prospects[i].created_at,
          },
        ]
      : [],
  );

  return {
    members,
    tags,
    sources,
    pipeline,
    schools,
    prospects,
    applications,
    activities,
    forms: [form],
    submissions,
  };
}
