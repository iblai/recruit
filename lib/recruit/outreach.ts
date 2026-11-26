/**
 * Who is due a message from the agents, and why. The model writes the words;
 * these rules decide who, when and how often. Nothing here sends anything.
 * Pure; relative imports only.
 */
import type { Activity, Deal, Person, Pipeline, PipelineStage } from "../crm/types";
import { contactRefusal, followUpOf, type Channel } from "./follow-ups";
import { CHANNELS, foundOf } from "./found";
import { eventIsOpen, type PageEvent } from "./landing-pages";

/** What a stage's cadence offers. */
export type Step = "course" | "event" | "check_in" | "welcome";
export type Reason = "confirmation" | "reminder" | Step | "introduction";

export const DAY = 24 * 60 * 60 * 1000;
export const REMINDER_DAYS = 3;
export const NUDGE_GAP_DAYS = 7;
export const MAX_DUE = 50;
/** A step more overdue than this is passed over, so switching outreach on never writes to last year's inquiries. */
export const OVERDUE_DAYS = 30;

/** Each stage's steps, in days from when the application entered it. */
export const CADENCE: Record<string, [Step, number][]> = {
  inquiry: [
    ["course", 2],
    ["event", 9],
    ["check_in", 23],
  ],
  engaged: [
    ["event", 3],
    ["check_in", 14],
  ],
  applied: [
    ["check_in", 5],
    ["event", 19],
  ],
  admitted: [
    ["welcome", 2],
    ["check_in", 9],
    ["check_in", 23],
  ],
  deposited: [
    ["check_in", 10],
    ["check_in", 40],
  ],
};

/** A stage the table does not name: one check-in at the funnel's stale period. */
const stepsOf = (stage: Pick<PipelineStage, "code">, rotten?: number): [Step, number][] =>
  CADENCE[stage.code] ?? [["check_in", rotten || 14]];

/** Days after entering a stage past which nothing in these funnels can be due. */
export const horizon = (pipelines: Pipeline[]) =>
  Math.max(
    ...Object.values(CADENCE).flatMap((s) => s.map(([, d]) => d)),
    ...pipelines.map((p) => p.rotten_days || 14),
  ) + OVERDUE_DAYS;

export interface EventSignUps {
  slug: string;
  title: string;
  event: PageEvent;
  /** Who signed up (form or chat) and when. */
  signUps: { person: string; at: string }[];
  /** For the cadence: only a published page is offered, to those whose program it names or to anyone. */
  published?: boolean;
  program?: string;
}

/** A published taster course, offered to inquiries in its program. */
export interface CourseOffer {
  slug: string;
  title: string;
  program: string;
}

/** Something a person is due, before their record is read. */
export interface Need {
  person: string;
  reason: Reason;
  channel: Channel;
  /** When the need began: the order they are answered in, oldest first. */
  since: number;
  event?: { slug: string; title: string; starts_at: string; place: string | null };
  course?: { slug: string; title: string };
  application?: { id: number; stage: string; days_in_stage: number };
  /** The cadence step (`<stage>:<what>:<days>`) this answers. */
  step?: string;
}

export interface NeedsInput {
  now: Date;
  deals: Deal[];
  pipelines: Pipeline[];
  events: EventSignUps[];
  courses?: CourseOffer[];
  /** When each application last changed stage: its newest "Stage changed" note. */
  entered?: Map<number, string>;
  /** Intended programs of people whose application names none (`job_title`). */
  programs?: Map<string, string>;
  /** People a connector found (`metadata.found`). */
  found: Person[];
  /** Every activity marked `follow_up`, drafted, sent or discarded. */
  followUps: Activity[];
}

const time = (s?: string | null) => (s ? new Date(s).getTime() : NaN);
const words = (s?: string | null): string[] => s?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/** Two names of one program: every word of the shorter is in the longer ("Nursing", "B.S. Nursing"). */
// ponytail: words only, so "Nursing" also finds "Nursing Informatics (M.S.)"; a program list pages and people share when that bites.
const same = (a?: string | null, b?: string | null) => {
  const [short, long] = [words(a), words(b)].sort((x, y) => x.length - y.length);
  return short.length > 0 && short.every((w) => long.includes(w));
};
const eventFacts = (e: EventSignUps) => ({
  slug: e.slug,
  title: e.title,
  starts_at: e.event.startsAt,
  place: e.event.place ?? null,
});

/**
 * The application that drives each person's cadence: the furthest along, then
 * the one longest in its stage. A form sign-up always opens a new application,
 * so one person often has several in the same stage.
 */
export function driving(
  deals: Deal[],
  { pipelines, entered }: Pick<NeedsInput, "pipelines" | "entered">,
): Deal[] {
  const stages = new Map(pipelines.flatMap((p) => (p.stages ?? []).map((s) => [s.id, s] as const)));
  const since = (d: Deal) => time(entered?.get(d.id) ?? d.created_at);
  const best = new Map<string, Deal>();
  for (const d of deals) {
    const stage = stages.get(d.stage);
    if (d.status !== "open" || !stage || stage.is_won || stage.is_lost) continue;
    const cur = best.get(d.person);
    const ahead = cur ? (stage.sort_order ?? 0) - (stages.get(cur.stage)?.sort_order ?? 0) : 1;
    if (ahead > 0 || (ahead === 0 && since(d) < since(cur!))) best.set(d.person, d);
  }
  return [...best.values()];
}

/** The first step of the cadence this open application is due now; null when none is. */
export function stepDue(
  d: Deal,
  { now, deals, pipelines, events, courses = [], entered, programs, followUps }: NeedsInput,
): Need | null {
  const pipeline = pipelines.find((p) => p.id === d.pipeline);
  const stage = pipeline?.stages?.find((s) => s.id === d.stage);
  if (d.status !== "open" || !stage || stage.is_won || stage.is_lost) return null;
  const t = now.getTime();
  // Never `updated_at`: any edit would restart the clock.
  const since = time(entered?.get(d.id) ?? d.created_at);
  const inStage = (t - since) / DAY;
  const program = String(d.metadata?.program ?? "") || programs?.get(d.person);
  for (const [what, days] of stepsOf(stage, pipeline?.rotten_days)) {
    const step = `${stage.code}:${what}:${days}`;
    if (!(inStage >= days && inStage <= days + OVERDUE_DAYS)) continue;
    if (followUps.some((a) => a.deal === d.id && followUpOf(a)?.step === step)) continue;
    const need: Need = {
      person: d.person,
      reason: what,
      channel: "email",
      since: since + days * DAY,
      application: { id: d.id, stage: stage.name, days_in_stage: Math.floor(inStage) },
      step,
    };
    if (what === "course") {
      // Not the course one of their applications came through.
      const taken = deals.filter((x) => x.person === d.person).map((x) => x.metadata?.course);
      const course = courses.find((c) => same(c.program, program) && !taken.includes(c.slug));
      if (!course) continue;
      return { ...need, course: { slug: course.slug, title: course.title } };
    }
    if (what === "event") {
      const event = events
        .filter(
          (e) =>
            e.published &&
            eventIsOpen(e.event, now) &&
            (!e.program?.trim() || same(e.program, program)) &&
            !e.signUps.some((s) => s.person === d.person),
        )
        .sort((a, b) => time(a.event.startsAt) - time(b.event.startsAt))[0];
      if (!event) continue;
      return { ...need, event: eventFacts(event) };
    }
    return need;
  }
  return null;
}

/** Every need, oldest first; limits are applied by `outreachDue`. */
export function needs(input: NeedsInput): Need[] {
  const { now, deals, events, courses = [], found, followUps } = input;
  const t = now.getTime();
  const out: Need[] = [];
  const has = (person: string, kind: string, event: string, sent = false) =>
    followUps.some(
      (a) =>
        a.person === person &&
        followUpOf(a)?.kind === kind &&
        followUpOf(a)?.event === event &&
        (!sent || (a.is_done && !followUpOf(a)?.discarded)),
    );
  for (const e of events) {
    const starts = time(e.event.startsAt);
    if (!(starts > t)) continue;
    const seen = new Set<string>();
    for (const s of e.signUps) {
      if (seen.has(s.person)) continue;
      seen.add(s.person);
      const base = { person: s.person, channel: "email" as const, event: eventFacts(e) };
      // The confirmation first: it carries the date, so a reminder waits until one has really gone out.
      if (!has(s.person, "confirmation", e.slug))
        out.push({ ...base, reason: "confirmation", since: time(s.at) });
      else if (
        starts - t <= REMINDER_DAYS * DAY &&
        has(s.person, "confirmation", e.slug, true) &&
        !has(s.person, "reminder", e.slug)
      )
        out.push({ ...base, reason: "reminder", since: starts - REMINDER_DAYS * DAY });
    }
  }
  for (const d of driving(deals, input)) {
    const need = stepDue(d, input);
    if (need) out.push(need);
  }
  // One unasked message to a found person, ever: anything written to them before, in any state, rules it out.
  const written = new Set(followUps.map((a) => a.person));
  for (const p of found) {
    if (written.has(p.id)) continue;
    const f = foundOf(p);
    // Found where nobody can be written to privately: they hear from the university only if they sign up.
    if (f?.platform && !CHANNELS[f.platform].dm) continue;
    // The taster course for their program, when one is published.
    const course = courses.find((c) => same(c.program, p.job_title));
    out.push({
      person: p.id,
      reason: "introduction",
      // Found on a social channel: there, by hand, whatever address their record gained since.
      channel: f?.platform ? "dm" : "email",
      since: time(f?.at ?? p.created_at),
      ...(course && { course: { slug: course.slug, title: course.title } }),
    });
  }
  return out.sort((a, b) => (a.since || 0) - (b.since || 0));
}

const ASKED: Reason[] = ["confirmation", "reminder"];

export { foundOf, type Found } from "./found";

/** Why a nudge to this person must wait; "" when it may be drafted. */
export function nudgeRefusal(person: string, followUps: Activity[], now: Date): string {
  const theirs = followUps.filter((a) => a.person === person);
  if (theirs.some((a) => !a.is_done)) return "They already have a message waiting under Needs you.";
  // A discarded draft wrote to nobody.
  const sent = theirs.filter((a) => !followUpOf(a)?.discarded);
  const last = Math.max(...sent.map((a) => Math.max(time(a.created_at), time(a.done_at) || 0)));
  if (now.getTime() - last < NUDGE_GAP_DAYS * DAY)
    return `They were written to in the last ${NUDGE_GAP_DAYS} days.`;
  return "";
}

export interface Due extends Need {
  first_name: string;
  intended_program: string | null;
  found_source?: string;
}

/** Who is due, after every limit: refusals, a counselor's handoff, one open draft, the gap and the cap. */
export function outreachDue(
  all: Need[],
  people: Map<string, Person>,
  followUps: Activity[],
  now: Date,
  /** People a counselor has an open handoff with. */
  handedOff = new Set<string>(),
  /** How many may be listed: the day's allowance left, at most `MAX_DUE`. */
  max = MAX_DUE,
): { due: Due[]; refused: Partial<Record<Reason, number>>; left_over: number } {
  const refused: Partial<Record<Reason, number>> = {};
  // A confirmation or reminder in this answer is the person's one message: their nudge waits, counted with it.
  const picked = new Set(all.filter((n) => ASKED.includes(n.reason)).map((n) => n.person));
  const due: Due[] = [];
  let left = 0;
  for (const n of all) {
    const p = people.get(n.person);
    if (!p) continue;
    if (contactRefusal(p, n.channel)) {
      refused[n.reason] = (refused[n.reason] ?? 0) + 1;
      continue;
    }
    // Enrolled or withdrawn: the cadence is over, whatever application is still open.
    if (n.step && (p.lifecycle_stage === "customer" || p.lifecycle_stage === "churned")) continue;
    // A nudge waits for a counselor, an open draft and the gap; what they asked for doesn't.
    if (
      !ASKED.includes(n.reason) &&
      (picked.has(n.person) || handedOff.has(n.person) || nudgeRefusal(n.person, followUps, now))
    )
      continue;
    if (due.length >= Math.min(max, MAX_DUE)) {
      left += 1;
      continue;
    }
    picked.add(n.person);
    const found = foundOf(p);
    due.push({
      ...n,
      first_name: p.name?.trim().split(/\s+/)[0] ?? "",
      intended_program: p.job_title || null,
      ...(found && { found_source: found.source }),
    });
  }
  return { due, refused, left_over: left };
}
