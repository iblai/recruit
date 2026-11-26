import { describe, expect, it } from "vitest";
import type { Activity, Deal, Person, Pipeline } from "../lib/crm/types";
import { RECRUIT_TOOLS, type ToolContext } from "../lib/mcp/tools";
import { foundLine } from "../lib/recruit/follow-ups";
import { dmLine } from "../lib/recruit/found";
import { newLandingPage, toWebForm } from "../lib/recruit/landing-pages";
import {
  DAY,
  needs,
  outreachDue,
  type CourseOffer,
  type EventSignUps,
  type NeedsInput,
} from "../lib/recruit/outreach";

const NOW = new Date("2027-03-10T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const funnel = {
  id: 3,
  code: "admissions",
  rotten_days: 14,
  stages: [
    { id: 11, code: "inquiry", name: "Inquiry", sort_order: 0 },
    { id: 13, code: "applied", name: "Applied", sort_order: 2 },
    { id: 14, code: "admitted", name: "Admitted", sort_order: 3 },
    { id: 15, code: "enrolled", name: "Enrolled", sort_order: 5, is_won: true },
    { id: 16, code: "interview", name: "Interview", sort_order: 1 },
  ],
} as unknown as Pipeline;

const person = (id: string, extra: Partial<Person> = {}) =>
  ({
    id,
    name: `${id[0].toUpperCase()}${id.slice(1)} Park`,
    primary_email: `${id}@x.edu`,
    job_title: "Nursing",
    metadata: {},
    created_at: ago(30),
    ...extra,
  }) as Person;
/** An application created `days` ago, edited today: the clock is its creation, never `updated_at`. */
const deal = (id: number, who: string, stage: number, days: number, extra: Partial<Deal> = {}) =>
  ({
    id,
    person: who,
    pipeline: 3,
    stage,
    status: "open",
    created_at: ago(days),
    updated_at: ago(0),
    metadata: { program: "Nursing" },
    ...extra,
  }) as Deal;
const followUp = (
  who: string,
  extra: Partial<Activity> & {
    kind?: string;
    event?: string;
    step?: string;
    discarded?: boolean;
  } = {},
) => {
  const { kind = "nudge", event, step, discarded, ...rest } = extra;
  return {
    person: who,
    is_done: true,
    created_at: ago(30),
    done_at: ago(30),
    metadata: {
      follow_up: {
        channel: "email",
        kind,
        ...(event && { event }),
        ...(step && { step }),
        ...(discarded && { discarded }),
      },
    },
    ...rest,
  } as Activity;
};
const openHouse = (startsInDays: number, signUps: string[], extra: Partial<EventSignUps> = {}) => ({
  slug: "open-house",
  title: "Open house",
  event: { startsAt: ahead(startsInDays), timeZone: "UTC", place: "Hall" },
  signUps: signUps.map((p) => ({ person: p, at: ago(1) })),
  ...extra,
});
const taster: CourseOffer = {
  slug: "nursing-taster",
  title: "Nursing taster",
  program: " nursing ",
};
const found = (id: string) =>
  person(id, { metadata: { found: { source: "the fair list", basis: "asked", at: ago(2) } } });
const social = (id: string, extra: Partial<Person> = {}) =>
  person(id, {
    primary_email: undefined,
    metadata: {
      found: {
        source: "r/nursing",
        basis: "public post",
        at: ago(1),
        platform: "reddit",
        handle: id,
        said: "I want to be a nurse.",
      },
    },
    ...extra,
  });

function run(input: Partial<NeedsInput>, people: Person[], held?: Set<string>) {
  const full = {
    now: NOW,
    deals: [],
    pipelines: [funnel],
    events: [],
    found: [],
    followUps: [],
    ...input,
  };
  return outreachDue(needs(full), new Map(people.map((p) => [p.id, p])), full.followUps, NOW, held);
}
const reasons = (r: ReturnType<typeof run>) => r.due.map((d) => [d.person, d.reason]);
const ada = person("ada");

describe("event messages", () => {
  it("confirms a sign-up and reminds within 3 days, once each per event", () => {
    expect(reasons(run({ events: [openHouse(10, ["ada"])] }, [ada]))).toEqual([
      ["ada", "confirmation"],
    ]);
    // Signed up two days before: the confirmation alone, never both on one day.
    expect(reasons(run({ events: [openHouse(2, ["ada", "ada"])] }, [ada]))).toEqual([
      ["ada", "confirmation"],
    ]);
    const confirmed = [followUp("ada", { kind: "confirmation", event: "open-house" })];
    expect(reasons(run({ events: [openHouse(2, ["ada"])], followUps: confirmed }, [ada]))).toEqual([
      ["ada", "reminder"],
    ]);
    expect(run({ events: [openHouse(10, ["ada"])], followUps: confirmed }, [ada]).due).toEqual([]);
    const had = [
      followUp("ada", { kind: "confirmation", event: "open-house", is_done: false }),
      followUp("ada", { kind: "reminder", event: "open-house" }),
    ];
    expect(run({ events: [openHouse(2, ["ada"])], followUps: had }, [ada]).due).toEqual([]);
  });

  it("waits for a confirmation that really went out: a discarded one is not sent", () => {
    const discarded = [
      followUp("ada", { kind: "confirmation", event: "open-house", discarded: true }),
    ];
    expect(run({ events: [openHouse(2, ["ada"])], followUps: discarded }, [ada]).due).toEqual([]);
  });

  it("asked-for messages ignore an open draft and the gap", () => {
    const recent = [followUp("ada", { is_done: false, created_at: ago(1) })];
    expect(reasons(run({ events: [openHouse(2, ["ada"])], followUps: recent }, [ada]))).toEqual([
      ["ada", "confirmation"],
    ]);
  });

  it("says nothing about an event that has started", () => {
    expect(run({ events: [openHouse(-0.1, ["ada"])] }, [ada]).due).toEqual([]);
  });
});

describe("the cadence", () => {
  const offers = {
    courses: [taster],
    events: [openHouse(20, [], { slug: "fair", published: true, program: "NURSING" })],
  };
  const at = (days: number, extra: Partial<NeedsInput> = {}) =>
    run({ deals: [deal(1, "ada", 11, days)], ...offers, ...extra }, [ada]).due;

  it("walks an inquiry through days 2, 8, 15, 40 and 60", () => {
    expect(at(1)).toEqual([]);
    expect(at(2)).toMatchObject([
      { reason: "course", step: "inquiry:course:2", course: { slug: "nursing-taster" } },
    ]);
    // Still the course at day 8: the first due step in the table's order.
    expect(at(8)).toMatchObject([{ reason: "course", application: { id: 1, days_in_stage: 8 } }]);
    const tookCourse = [
      followUp("ada", { deal: 1, step: "inquiry:course:2", created_at: ago(12) }),
    ];
    expect(at(15, { followUps: tookCourse })).toMatchObject([
      { reason: "event", step: "inquiry:event:9", event: { slug: "fair" } },
    ]);
    // Switched on late: what is more than 30 days overdue never goes out.
    expect(at(40)).toMatchObject([{ reason: "check_in", step: "inquiry:check_in:23" }]);
    expect(at(60)).toEqual([]);
  });

  it("passes over a step with nothing to offer", () => {
    const none = { courses: [], events: [] };
    expect(at(2, none)).toEqual([]);
    expect(at(9, none)).toEqual([]);
    expect(at(23, none)).toMatchObject([{ reason: "check_in" }]);
  });

  it("lets a draft nobody approves block the next step, and later steps expire rather than pile up", () => {
    const waiting = [
      followUp("ada", { deal: 1, step: "inquiry:course:2", is_done: false, created_at: ago(19) }),
    ];
    expect(at(21, { followUps: waiting })).toEqual([]);
    expect(at(40, { followUps: waiting })).toEqual([]);
    const thrownAway = [
      followUp("ada", { deal: 1, step: "inquiry:course:2", discarded: true, created_at: ago(53) }),
    ];
    expect(at(55, { followUps: thrownAway })).toEqual([]);
  });

  it("runs from the newest stage move, not the last edit", () => {
    const entered = new Map([[1, ago(6)]]);
    // Created long ago, edited today, moved to Applied six days ago.
    const r = run({ deals: [deal(1, "ada", 13, 300)], entered }, [ada]);
    expect(r.due).toMatchObject([{ reason: "check_in", step: "applied:check_in:5" }]);
    expect(run({ deals: [deal(1, "ada", 13, 3)] }, [ada]).due).toEqual([]);
  });

  it("gives a stage the table does not name one check-in at the funnel's stale period", () => {
    expect(run({ deals: [deal(1, "ada", 16, 13)] }, [ada]).due).toEqual([]);
    expect(run({ deals: [deal(1, "ada", 16, 15)] }, [ada]).due).toMatchObject([
      { reason: "check_in", step: "interview:check_in:14" },
    ]);
  });

  it("says nothing for a won stage or a closed application", () => {
    expect(run({ deals: [deal(1, "ada", 15, 15)] }, [ada]).due).toEqual([]);
    expect(run({ deals: [deal(1, "ada", 13, 6, { status: "lost" })] }, [ada]).due).toEqual([]);
  });

  it("welcomes an admitted student", () => {
    expect(run({ deals: [deal(1, "ada", 14, 2)] }, [ada]).due).toMatchObject([
      { reason: "welcome", step: "admitted:welcome:2" },
    ]);
  });

  it("offers a course only in their program, and not to someone who came through one", () => {
    const other = { metadata: { program: "History" } };
    expect(run({ deals: [deal(1, "ada", 11, 2, other)], courses: [taster] }, [ada]).due).toEqual(
      [],
    );
    const came = { metadata: { program: "Nursing", course: "nursing-taster" } };
    expect(run({ deals: [deal(1, "ada", 11, 2, came)], courses: [taster] }, [ada]).due).toEqual([]);
    // No program on the application: the person's.
    const unnamed = deal(1, "ada", 11, 2, { metadata: {} });
    const programs = new Map([["ada", "Nursing"]]);
    expect(run({ deals: [unnamed], courses: [taster], programs }, [ada]).due).toMatchObject([
      { reason: "course" },
    ]);
  });

  it("follows one application per person: the furthest along, then the longest in its stage", () => {
    // Two forms filled, so two applications: the inquiry is not nurtured beside the one that applied.
    const two = [deal(1, "ada", 11, 10), deal(2, "ada", 13, 6)];
    expect(run({ deals: two, ...offers }, [ada]).due).toMatchObject([
      { reason: "check_in", step: "applied:check_in:5", application: { id: 2 } },
    ]);
    // Both inquiries: the older one's clock, so the newer never brings the same event a second time.
    const same = [deal(1, "ada", 11, 30), deal(2, "ada", 11, 10)];
    const invited = [
      followUp("ada", { deal: 1, step: "inquiry:course:2", created_at: ago(28) }),
      followUp("ada", { deal: 1, step: "inquiry:event:9", created_at: ago(21) }),
    ];
    expect(run({ deals: same, ...offers, followUps: invited }, [ada]).due).toMatchObject([
      { reason: "check_in", step: "inquiry:check_in:23", application: { id: 1 } },
    ]);
  });

  it("does not offer the course another of their applications came through", () => {
    const deals = [
      deal(1, "ada", 11, 3),
      deal(2, "ada", 11, 1, { metadata: { program: "Nursing", course: "nursing-taster" } }),
    ];
    expect(run({ deals, courses: [taster] }, [ada]).due).toEqual([]);
  });

  it("stops for someone enrolled or withdrawn, whatever application is still open", () => {
    for (const lifecycle_stage of ["customer", "churned"] as const) {
      const gone = person("ada", { lifecycle_stage });
      expect(run({ deals: [deal(1, "ada", 13, 6)] }, [gone]).due).toEqual([]);
      // What they asked for still comes.
      expect(reasons(run({ events: [openHouse(10, ["ada"])] }, [gone]))).toEqual([
        ["ada", "confirmation"],
      ]);
    }
  });

  it("offers the soonest published event still open, for anyone or their program, that they are not signed up for", () => {
    const events = [
      openHouse(5, [], { slug: "draft", published: false }),
      openHouse(6, [], {
        slug: "closed",
        published: true,
        event: { startsAt: ahead(6), timeZone: "UTC", signUpBy: ago(1) },
      }),
      openHouse(7, ["ada"], { slug: "theirs", published: true }),
      openHouse(8, [], { slug: "law", published: true, program: "Law" }),
      openHouse(12, [], { slug: "later", published: true }),
      openHouse(9, [], { slug: "soonest", published: true, program: "" }),
    ];
    // Ada's confirmation for the one she signed up for went out long ago.
    const followUps = [followUp("ada", { kind: "confirmation", event: "theirs" })];
    expect(run({ deals: [deal(1, "ada", 11, 9)], events, followUps }, [ada]).due).toMatchObject([
      { reason: "event", event: { slug: "soonest" } },
    ]);
  });
});

describe("who gets a nudge", () => {
  it("holds it for an open draft, within 7 days, a counselor's handoff, and to one per person", () => {
    const deals = [
      deal(1, "ada", 13, 6),
      deal(2, "ada", 14, 2),
      deal(3, "bo", 13, 6),
      deal(4, "cy", 13, 6),
      deal(5, "di", 13, 6),
    ];
    const followUps = [
      followUp("bo", { is_done: false }),
      followUp("cy", { created_at: ago(40), done_at: ago(6) }),
    ];
    const people = ["ada", "bo", "cy", "di"].map((id) => person(id));
    const r = run({ deals, followUps }, people, new Set(["di"]));
    expect(r.due.map((d) => d.person)).toEqual(["ada"]);
    // One open draft of any kind: a nudge waits behind a confirmation in the same answer.
    const both = run({ deals: [deal(1, "ada", 13, 6)], events: [openHouse(10, ["ada"])] }, [ada]);
    expect(reasons(both)).toEqual([["ada", "confirmation"]]);
  });

  it("does not count a discarded draft as written to", () => {
    const followUps = [followUp("ada", { created_at: ago(1), done_at: ago(1), discarded: true })];
    expect(reasons(run({ deals: [deal(1, "ada", 13, 6)], followUps }, [ada]))).toEqual([
      ["ada", "check_in"],
    ]);
  });

  it("never lists the opted out or the unreachable, and counts them by reason", () => {
    const r = run({ deals: [deal(1, "ada", 13, 6)], events: [openHouse(10, ["bo"])] }, [
      person("ada", { metadata: { opted_out: true } }),
      person("bo", { primary_email: "" }),
    ]);
    expect(r.due).toEqual([]);
    expect(r.refused).toEqual({ check_in: 1, confirmation: 1 });
  });

  it("answers 50 at most, oldest need first, and says how many are left", () => {
    const people = Array.from({ length: 60 }, (_, i) => person(`p${i}`));
    const deals = people.map((p, i) => deal(i, p.id, 13, 6 + i / 10));
    const r = run({ deals }, people);
    expect(r.due).toHaveLength(50);
    expect(r.left_over).toBe(10);
    expect(r.due[0].person).toBe("p59");
  });
});

describe("introductions", () => {
  it("writes once to a found person: by dm when found on a social channel with no email, else by email", () => {
    const r = run(
      {
        found: [found("fay"), social("sam"), found("gil")],
        followUps: [followUp("gil", { discarded: true })],
      },
      [found("fay"), social("sam"), found("gil")],
    );
    expect(r.due).toMatchObject([
      { person: "fay", reason: "introduction", channel: "email", found_source: "the fair list" },
      { person: "sam", reason: "introduction", channel: "dm" },
    ]);
    expect(r.due).toHaveLength(2);
  });

  it("writes to a student found on X by dm, and never to one found on YouTube, which has no direct messages", () => {
    const on = (id: string, platform: string) => {
      const p = social(id);
      return {
        ...p,
        metadata: { found: { ...(p.metadata?.found as object), platform } },
      } as Person;
    };
    const people = [on("xia", "x"), on("yul", "youtube")];
    const r = run({ found: people }, people);
    expect(r.due).toMatchObject([{ person: "xia", reason: "introduction", channel: "dm" }]);
    expect(r.due).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ tools
const tool = (name: string) => RECRUIT_TOOLS.find((t) => t.name === name)!;
const text = (r: unknown) => (r as { content?: { text: string }[] }).content?.[0].text ?? "";

const tasterPage = toWebForm(
  newLandingPage({
    title: "Nursing taster",
    slug: "nursing-taster",
    program: "Nursing",
    published: true,
    course: { lessons: [{ title: "One", body: ["Hello."] }] },
  }),
);

function platform({
  people = [] as Person[],
  activities = [] as Activity[],
  deals = [deal(1, "ada", 13, 20)],
  notes = [] as Partial<Activity>[],
  handoffs = [] as Partial<Activity>[],
  foundToday = 0,
  // Who signed up for the open house through its form.
  signUps = ["bo"],
  settings = {} as object,
  appUrl = "",
  // How many follow-ups the platform-wide read returns before it is cut.
  cap = Infinity,
} = {}) {
  const made: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const event = { startsAt: ahead(2), timeZone: "UTC", place: "Hall" };
  const crm = {
    listPipelines: async () => [funnel],
    allDeals: async (q: { person?: string }) =>
      deals.filter((d) => !q.person || d.person === q.person),
    listWebForms: async () => [
      toWebForm(newLandingPage({ title: "Open house", slug: "open-house", event })),
      tasterPage,
    ],
    allWebFormSubmissions: async () => signUps.map((p) => ({ person: p, created_at: ago(1) })),
    listDeals: async () => ({ results: [] }),
    listActivities: async (q: { type?: string; deal?: number }) => ({
      results: q.type === "note" ? notes.filter((n) => !q.deal || n.deal === q.deal) : [],
    }),
    allActivities: async (q: {
      metadata__has_key?: string;
      person?: string;
      type?: string;
      start_date?: string;
      end_date?: string;
    }) => {
      // As the platform: a date window takes both ends, or it answers 400.
      if (!q.start_date !== !q.end_date)
        throw new Error("400: start_date and end_date are required");
      return q.type === "note"
        ? notes
        : q.metadata__has_key === "handoff"
          ? handoffs
          : q.metadata__has_key === "follow_up"
            ? q.person
              ? [...activities, ...made].filter((a) => a.person === q.person)
              : [...activities, ...made].slice(0, cap)
            : [];
    },
    allPersons: async (q: { active?: boolean } = {}) =>
      people.filter((p) => p.metadata?.found && !(q.active && p.active === false)),
    listPersons: async () => ({ count: foundToday, results: [] }),
    // As the platform: someone deleted is a 404.
    getPerson: async (id: string) => {
      const p = byId.get(id);
      if (!p) throw new Error("404: Not found");
      return p;
    },
    findPersonByEmail: async (email: string) => people.find((p) => p.primary_email === email),
    findOrCreateOrganization: async (name: string) => ({ id: `org-${name}` }),
    createPerson: async (body: Record<string, unknown>) => {
      created.push(body);
      return { id: `new${created.length}`, ...body };
    },
    createActivity: async (body: Record<string, unknown>) => {
      made.push({ ...body, created_at: NOW.toISOString() });
      return { id: made.length, ...body };
    },
  };
  const ctx = {
    org: "northfield",
    crm,
    appUrl,
    now: () => NOW,
    settings: {
      institutionName: "Northfield University",
      mailingAddress: "1 Main St",
      ...settings,
    },
  } as unknown as ToolContext;
  return { ctx, made, created };
}

describe("list_outreach_due", () => {
  const due = async (ctx: ToolContext) =>
    ((await tool("list_outreach_due").handler({}, ctx)) as { due: Record<string, unknown>[] }).due;

  it("lists who, why and on which channel, with no address, phone or notes", async () => {
    const people = [
      person("ada", { contact_numbers: ["+1555"] }),
      person("bo"),
      found("fay"),
      social("sam"),
    ];
    const { ctx } = platform({
      people,
      notes: [{ title: "Stage changed", deal: 1, created_at: ago(6) }],
    });
    const out = await due(ctx);
    out.sort((a, b) => String(a.prospect_id).localeCompare(String(b.prospect_id)));
    expect(out).toEqual([
      {
        prospect_id: "ada",
        first_name: "Ada",
        intended_program: "Nursing",
        reason: "check_in",
        kind: "nudge",
        channel: "email",
        application: { id: 1, stage: "Applied", days_in_stage: 6 },
      },
      expect.objectContaining({
        prospect_id: "bo",
        reason: "confirmation",
        kind: "confirmation",
        event: expect.objectContaining({ slug: "open-house" }),
      }),
      expect.objectContaining({
        prospect_id: "fay",
        reason: "introduction",
        channel: "email",
        found_source: "the fair list",
      }),
      expect.objectContaining({
        prospect_id: "sam",
        reason: "introduction",
        channel: "dm",
        platform: "reddit",
        said: "I want to be a nurse.",
      }),
    ]);
    expect(JSON.stringify(out)).not.toMatch(/@x\.edu|\+1555/);
  });

  it("checks each person against their own history where the platform's list was cut", async () => {
    // A thousand newer follow-ups to others push Ada's check-in out of the list the rules read.
    const others = Array.from({ length: 1000 }, () => followUp("zed"));
    const hers = followUp("ada", { deal: 1, step: "applied:check_in:5", created_at: ago(20) });
    const args = { people: [ada], deals: [deal(1, "ada", 13, 30)], signUps: [] };
    const cut = platform({ ...args, activities: [...others, hers], cap: 1000 });
    expect(await due(cut.ctx)).toEqual([]);
    // With nothing of hers behind the cut, she is still listed.
    const clear = platform({ ...args, activities: others, cap: 1000 });
    expect(await due(clear.ctx)).toMatchObject([{ prospect_id: "ada", reason: "check_in" }]);
  });

  it("leaves out someone a counselor has an open handoff with", async () => {
    const { ctx } = platform({
      people: [ada],
      deals: [deal(1, "ada", 13, 6)],
      signUps: [],
      handoffs: [{ person: "ada", metadata: { handoff: { reason: "Aid" } } }],
    });
    expect(await due(ctx)).toEqual([]);
  });

  it("builds a course link with where it went and to whom, only on a public address", async () => {
    const people = [person("ada", { job_title: "nursing" })];
    const args = { people, deals: [deal(1, "ada", 11, 3, { metadata: {} })], signUps: [] };
    const [d] = await due(platform({ ...args, appUrl: "https://recruit.example.edu" }).ctx);
    expect(d).toMatchObject({
      reason: "course",
      course: {
        title: "Nursing taster",
        url: "https://recruit.example.edu/p/northfield/nursing-taster?utm_source=recruit&utm_medium=email&utm_content=ada",
      },
    });
    const [plain] = await due(platform({ ...args, appUrl: "http://localhost:3210" }).ctx);
    expect(plain.reason).toBe("course");
    expect(plain).not.toHaveProperty("course");
  });

  it("offers a student found on a social channel the taster for their program, by dm", async () => {
    const args = { people: [social("sam")], deals: [], signUps: [] };
    const [d] = await due(platform({ ...args, appUrl: "https://recruit.example.edu" }).ctx);
    expect(d).toMatchObject({
      prospect_id: "sam",
      reason: "introduction",
      channel: "dm",
      course: {
        title: "Nursing taster",
        url: "https://recruit.example.edu/p/northfield/nursing-taster?utm_source=reddit&utm_medium=dm&utm_content=sam",
      },
    });
    // The program as the page names it: "B.S. Nursing" finds the "Nursing" taster.
    const named = platform({
      ...args,
      people: [social("sam", { job_title: "B.S. Nursing" })],
      appUrl: "https://recruit.example.edu",
    });
    expect((await due(named.ctx))[0]).toMatchObject({ course: { title: "Nursing taster" } });
    // No taster for their program: no link.
    const other = platform({ ...args, people: [social("sam", { job_title: "Law" })] });
    expect((await due(other.ctx))[0]).not.toHaveProperty("course");
  });

  it("leaves out a record a merge retired, and someone deleted, without counting them as left over", async () => {
    const { ctx } = platform({
      people: [social("sam"), social("old", { active: false })],
      deals: [],
      // Signed up for the open house, then deleted.
      signUps: ["ghost"],
    });
    const out = (await tool("list_outreach_due").handler({}, ctx)) as {
      due: { prospect_id: string }[];
      left_over: number;
    };
    expect(out.due.map((d) => d.prospect_id)).toEqual(["sam"]);
    expect(out.left_over).toBe(0);
  });

  it("lists no more than the day's allowance has room for", async () => {
    const people = ["fay", "gil", "hal", "ivy"].map(found);
    const { ctx } = platform({ people, deals: [], signUps: [], settings: { dailyDrafts: 3 } });
    const out = (await tool("list_outreach_due").handler({}, ctx)) as {
      due: unknown[];
      left_over: number;
    };
    expect(out.due).toHaveLength(3);
    expect(out.left_over).toBe(1);
  });
});

describe("queue_message limits", () => {
  const queue = (ctx: ToolContext, args: object) =>
    tool("queue_message").handler(
      { prospect_id: "ada", channel: "email", body: "Hi.", ...args },
      ctx,
    );

  it("refuses a second open draft, but not a confirmation for an event they have none for", async () => {
    const { ctx, made } = platform({
      people: [person("ada")],
      activities: [followUp("ada", { is_done: false })],
      signUps: ["ada"],
    });
    expect(text(await queue(ctx, { kind: "reply" }))).toMatch(/already have a message waiting/);
    expect(await queue(ctx, { kind: "confirmation", event: "open-house" })).toMatchObject({
      queued: true,
    });
    expect(made[0].metadata).toEqual({
      follow_up: {
        channel: "email",
        kind: "confirmation",
        by: "Chief of Staff (AI)",
        event: "open-house",
      },
    });
    const again = platform({
      people: [person("ada")],
      activities: [followUp("ada", { kind: "confirmation", event: "open-house" })],
      signUps: ["ada"],
    });
    expect(text(await queue(again.ctx, { kind: "confirmation", event: "open-house" }))).toMatch(
      /already have a confirmation/,
    );
  });

  it("lets the word 'confirmation' skip no wait: the event must be real and theirs", async () => {
    // Ada has an open draft and is not signed up for anything.
    const { ctx, made } = platform({
      people: [person("ada")],
      activities: [followUp("ada", { is_done: false })],
    });
    expect(text(await queue(ctx, { kind: "confirmation", event: "made-up-1" }))).toMatch(
      /is not an event page/,
    );
    expect(text(await queue(ctx, { kind: "reminder", event: "open-house" }))).toMatch(
      /not signed up for that event/,
    );
    // With no event it is an ordinary message, and waits like one.
    expect(text(await queue(ctx, { kind: "confirmation" }))).toMatch(
      /already have a message waiting/,
    );
    expect(made).toEqual([]);
  });

  it("refuses any unasked message inside 7 days, whatever it is called", async () => {
    const { ctx, made } = platform({
      people: [person("ada")],
      activities: [followUp("ada", { done_at: ago(3) })],
    });
    for (const kind of ["nudge", "reply", "confirmation", undefined])
      expect(text(await queue(ctx, { kind }))).toMatch(/last 7 days/);
    expect(made).toEqual([]);
  });

  it("stops at the daily allowance: 50, or the platform's own from 1 to 500", async () => {
    const drafts = (n: number) =>
      Array.from(
        { length: n },
        () =>
          ({
            ...followUp("zed"),
            created_at: ago(0.5),
            metadata: { follow_up: { by: "Recruit (AI)" } },
          }) as Activity,
      );
    const { ctx } = platform({ people: [person("ada")], activities: drafts(50) });
    expect(text(await queue(ctx, { kind: "nudge" }))).toMatch(/50 drafts in the last 24 hours/);
    const low = platform({
      people: [person("ada")],
      activities: drafts(3),
      settings: { dailyDrafts: 3 },
    });
    expect(text(await queue(low.ctx, { kind: "nudge" }))).toMatch(/3 drafts in the last 24 hours/);
    const high = platform({
      people: [person("ada")],
      activities: drafts(60),
      settings: { dailyDrafts: 100 },
    });
    expect(await queue(high.ctx, { kind: "nudge" })).toMatchObject({ queued: true });
    const bad = platform({
      people: [person("ada")],
      activities: drafts(50),
      settings: { dailyDrafts: 501 },
    });
    expect(text(await queue(bad.ctx, { kind: "nudge" }))).toMatch(/50 drafts/);
  });

  it("stamps the cadence step the code finds due, and attaches it to that application", async () => {
    const { ctx, made } = platform({
      people: [person("ada")],
      notes: [{ title: "Stage changed", deal: 1, created_at: ago(6) }],
    });
    await queue(ctx, { kind: "nudge" });
    expect(made[0]).toMatchObject({
      deal: 1,
      metadata: { follow_up: { kind: "nudge", step: "applied:check_in:5" } },
    });
    // Nothing due: an ad-hoc message, as the agent wrote it, whatever it claims.
    const none = platform({ people: [person("ada")], deals: [deal(1, "ada", 13, 2)] });
    await queue(none.ctx, { kind: "nudge", step: "applied:check_in:5" });
    expect(none.made[0]).toMatchObject({ deal: null });
    expect(none.made[0].metadata).toEqual({
      follow_up: { channel: "email", kind: "nudge", by: "Chief of Staff (AI)" },
    });
    // A reply asked for in chat is not the step, which stays due.
    const reply = platform({
      people: [person("ada")],
      notes: [{ title: "Stage changed", deal: 1, created_at: ago(6) }],
    });
    await queue(reply.ctx, { kind: "reply" });
    expect(reply.made[0]).toMatchObject({ deal: null });
    expect(reply.made[0].metadata).toEqual({
      follow_up: { channel: "email", kind: "reply", by: "Chief of Staff (AI)" },
    });
  });

  it("refuses a record a merge retired", async () => {
    const { ctx, made } = platform({ people: [person("ada", { active: false })] });
    expect(text(await queue(ctx, { kind: "nudge" }))).toMatch(/retired by a merge/);
    expect(made).toEqual([]);
  });

  it("refuses a link that is not on this app or the university's own sites", async () => {
    const { ctx, made } = platform({
      people: [person("ada")],
      appUrl: "https://recruit.example.edu",
      settings: { websiteOrigins: ["https://www.northfield.edu"] },
    });
    for (const body of [
      "Apply at https://apply.other.org/x",
      "See www.other.org.",
      "Old http://www.northfield.edu",
    ])
      expect(text(await queue(ctx, { kind: "nudge", body }))).toMatch(
        /is not on this app or the university's own sites.*add it when they review/,
      );
    // The subject is read too.
    expect(
      text(await queue(ctx, { kind: "nudge", subject: "Verify at https://evil.example/s" })),
    ).toMatch(/evil\.example is not on this app/);
    expect(made).toEqual([]);
    expect(
      await queue(ctx, {
        kind: "nudge",
        body: "See https://recruit.example.edu/p/northfield/x and www.northfield.edu/visit.",
      }),
    ).toMatchObject({ queued: true });
  });

  it("writes to someone found by a connector by email only, with the line once", async () => {
    const { ctx, made } = platform({ people: [found("fay")] });
    const line = foundLine("Northfield University", "the fair list", "1 Main St");
    expect(text(await queue(ctx, { prospect_id: "fay", channel: "text" }))).toMatch(
      /never sent a text/,
    );
    expect(text(await queue(ctx, { prospect_id: "fay", channel: "dm" }))).toMatch(
      /only for a student found on a social channel/,
    );
    await queue(ctx, { prospect_id: "fay", kind: "nudge", body: `Hi Fay.\n\n${line}` });
    expect(made[0].comment).toBe(`Hi Fay.\n\n${line}`);
  });

  it("queues one dm to a student found on a social channel, with the line, under 900 characters", async () => {
    const line = dmLine("Northfield University", "reddit");
    const { ctx, made } = platform({
      people: [
        social("sam"),
        social("ola", { metadata: { ...social("ola").metadata, opted_out: true } }),
        social("lee", { primary_email: "lee@x.io" }),
      ],
    });
    const dm = (args: object) =>
      queue(ctx, { prospect_id: "sam", channel: "dm", kind: "nudge", ...args });
    expect(text(await dm({ prospect_id: "ola" }))).toMatch(/asked not to be contacted/);
    expect(text(await dm({ channel: "email" }))).toMatch(/found on a social channel/);
    // An address on their record changes nothing: the one message is on the channel, by hand.
    expect(text(await dm({ prospect_id: "lee", channel: "email" }))).toMatch(
      /found on a social channel/,
    );
    expect(text(await dm({ channel: "text" }))).toMatch(/never sent a text/);
    const long = "x".repeat(900 - line.length - 2 + 5);
    expect(text(await dm({ body: long }))).toMatch(/5 characters over the 900/);
    expect(await dm({ body: "Saw your post." })).toMatchObject({ queued: true });
    expect(made[0]).toMatchObject({
      type: "task",
      title: "Message on Reddit",
      comment: `Saw your post.\n\n${line}`,
      metadata: { follow_up: { channel: "dm", kind: "nudge", by: "Chief of Staff (AI)" } },
    });
    // One ever, even once it was discarded.
    const again = platform({
      people: [social("sam")],
      activities: [
        {
          ...followUp("sam", { discarded: true, created_at: ago(40), done_at: ago(40) }),
          metadata: { follow_up: { channel: "dm", discarded: true } },
        } as Activity,
      ],
    });
    expect(
      text(await queue(again.ctx, { prospect_id: "sam", channel: "dm", body: "Hi." })),
    ).toMatch(/already had their one message on Reddit/);
  });
});

describe("update_prospect", () => {
  it("cannot clear do-not-contact or where a found person came from", async () => {
    const patched: unknown[] = [];
    const { ctx } = platform({ people: [found("fay")] });
    Object.assign(ctx.crm, {
      updatePerson: async (...a: unknown[]) => patched.push(a),
      patchMetadata: async (...a: unknown[]) => patched.push(a),
    });
    const update = (fields: object) =>
      tool("update_prospect").handler({ prospect_id: "fay", fields }, ctx);
    for (const fields of [
      { opted_out: null },
      { opted_out: false },
      { opted_out_at: "" },
      { found: null },
      { conversations: [] },
      { gpa: "3.9", opted_out: null },
    ])
      expect(text(await update(fields))).toMatch(/cannot be set by an agent/);
    expect(patched).toEqual([]);
    // An ordinary recruitment field still goes through.
    await update({ gpa: "3.9" });
    expect(patched).toHaveLength(1);
  });
});

describe("add_found_prospects", () => {
  const basis = { foundBasis: "They asked for information at the fair." };
  const add = (ctx: ToolContext, people: object[], extra: object = {}) =>
    tool("add_found_prospects").handler(
      { source: "https://fair.example.org/list", people, ...extra },
      ctx,
    ) as Promise<Record<string, unknown>>;

  it("adds new people as found inquiries, never touches one on file, and counts", async () => {
    const { ctx, created, made } = platform({ people: [person("ada")], settings: basis });
    const out = await add(ctx, [
      { name: "Fay Lin", email: "FAY@x.edu", program: "Nursing", school: "Lincoln High" },
      { name: "Ada Park", email: "ada@x.edu" },
      { name: "Fay again", email: "fay@x.edu" },
      { name: "Bad", email: "not-an-email" },
    ]);
    expect(out).toEqual({
      added: 1,
      already_on_file: 2,
      refused: { "The email address is not valid.": 1 },
    });
    expect(created).toEqual([
      {
        name: "Fay Lin",
        primary_email: "fay@x.edu",
        job_title: "Nursing",
        organization: "org-Lincoln High",
        lifecycle_stage: "lead",
        metadata: {
          found: {
            source: "https://fair.example.org/list",
            basis: "They asked for information at the fair.",
            at: NOW.toISOString(),
          },
        },
      },
    ]);
    expect(made).toEqual([]);
  });

  it("stops at 200 a day and refuses a bad source, or no basis from Settings", async () => {
    const { ctx, created } = platform({ foundToday: 199, settings: basis });
    const out = await add(ctx, [
      { name: "A", email: "a@x.edu" },
      { name: "B", email: "b@x.edu" },
    ]);
    expect(out).toMatchObject({
      added: 1,
      refused: { "The platform's limit of 200 found people a day is reached.": 1 },
    });
    expect(created).toHaveLength(1);
    expect(
      text(await add(ctx, [{ name: "A", email: "a@x.edu" }], { source: "http://x.org" })),
    ).toMatch(/https URL/);
    // The basis is the admin's: one the agent gives is not taken.
    const unset = platform().ctx;
    const why = { basis: "They asked for information at the fair." };
    expect(text(await add(unset, [{ name: "A", email: "a@x.edu" }], why))).toMatch(
      /Settings → Connectors/,
    );
    expect(text(await add(ctx, []))).toMatch(/1 to 50/);
  });
});
