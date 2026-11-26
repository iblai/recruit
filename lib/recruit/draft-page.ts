/**
 * A landing page drafted from a brief: Recruit, which holds the university's
 * sources, is asked for the page as JSON, and the answer is checked before it
 * becomes a draft. An answer that cannot be read is an error, never a default
 * page; nothing here publishes.
 *
 * Relative imports on purpose: vitest resolves no `@/` alias for lib files.
 */
import config from "../iblai/config";
import { platformFetch, PlatformError } from "../iblai/platform";
import {
  COURSE_LIMITS,
  newLandingPage,
  slugify,
  validateLandingPage,
  type LandingPage,
  type Lesson,
} from "./landing-pages";

export const BRIEF_MAX = 2000;

/** What Recruit is asked. `purpose: draft` in the turn's metadata tells it to answer in JSON. */
export function draftPrompt(brief: string, today: string, timeZone: string): string {
  return `Draft a landing page for this brief from the admissions team:

"""
${brief}
"""

Today is ${today}. Times are in ${timeZone}.
Answer with one JSON object and nothing else:
{
  "title": "a short internal title",
  "headline": "the page's headline, under 80 characters",
  "subheadline": "one or two sentences",
  "highlights": ["up to four short facts"],
  "program": "the program it is for, or an empty string",
  "term": "the entry term, or an empty string",
  "cta_label": "the button text, under 30 characters",
  "event": null
}
For an event (an open house, a visit day), "event" is {"starts_at": "ISO 8601 with the offset", "ends_at": "the same, or null", "place": "where, or an empty string", "sign_up_by": "ISO 8601 with the offset, or null"}. A date with no year is the next such date.
Use only facts from the university's documents and the brief. Leave out what is in neither.`;
}

/** What Recruit is asked for a taster course: the program named in words, so its passages are retrieved. */
export function coursePrompt(program: string, brief: string): string {
  const max = COURSE_LIMITS;
  return `Draft a short taster course about the program "${program}" at this university, for prospective students who are thinking of applying to ${program}.
${brief ? `\nWhat the admissions team wants emphasized:\n"""\n${brief}\n"""\n` : ""}
Write 3 to 5 lessons. Each lesson says one thing a prospective student would want to know about ${program} at this university (what you study, how the program is built, what the first year looks like, where it leads, how to apply), in plain words, from the university's documents only. Where the documents say too little for a lesson, write fewer lessons. State no cost, deadline or requirement that the documents do not state. Prospective students read this text: name no source or document in it, since a staff member checks every lesson against the documents before it is published.
Answer with one JSON object and nothing else:
{
  "title": "the course's name as a browser tab shows it, under 60 characters",
  "headline": "the page's headline, under 80 characters",
  "subheadline": "one or two sentences about what the reader will learn",
  "lessons": [
    {
      "title": "the lesson's title, under ${max.title} characters",
      "body": ["up to ${max.paragraphs} short paragraphs, each under ${max.paragraph} characters"],
      "question": "one question for the reader to think about, under ${max.question} characters, or an empty string"
    }
  ],
  "cta_label": "the text on the button of the form beside the lessons, which asks to hear more about the program; under 30 characters"
}`;
}

/** The whole reply of a streamed chat turn: the platform sends JSON frames, a blank line apart. */
export function readReply(stream: string): string {
  let reply = "";
  for (const frame of stream.split("\n\n")) {
    if (!frame.trim()) continue;
    let part: { data?: unknown; error?: unknown; eos?: unknown };
    try {
      part = JSON.parse(frame);
    } catch {
      continue;
    }
    if (part.error)
      throw new Error(typeof part.error === "string" ? part.error : "The chat failed.");
    // Frames with no text carry sources and status.
    if (typeof part.data === "string") reply += part.data;
    if (part.eos === true) break;
  }
  return reply;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const instant = (v: unknown) => {
  const at = typeof v === "string" ? Date.parse(v) : Number.NaN;
  return Number.isNaN(at) ? undefined : new Date(at).toISOString();
};

/** The JSON object in a reply, around any prose or code fence. */
function readObject(reply: string, what: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {}
  throw new Error(`Its answer was not ${what}.`);
}

/** The course in Recruit's reply, cut to the limits; throws when there is too little to save. */
export function parseCourse(reply: string, program: string): LandingPage {
  const draft = readObject(reply, "a course");
  const max = COURSE_LIMITS;
  const lessons: Lesson[] = (Array.isArray(draft.lessons) ? draft.lessons : [])
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      title: text(l.title, max.title),
      body: (Array.isArray(l.body) ? l.body : [l.body])
        .map((p) => text(p, max.paragraph))
        .filter(Boolean)
        .slice(0, max.paragraphs),
      ...(text(l.question, max.question) && { question: text(l.question, max.question) }),
    }))
    .filter((l) => l.title && l.body.length)
    .slice(0, max.lessons[1]);
  if (lessons.length < max.lessons[0])
    throw new Error(
      `Its answer had too few lessons: the documents may say too little about ${program}.`,
    );
  const title = text(draft.title, 120) || text(draft.headline, 120) || program;
  const page = newLandingPage({
    title,
    // The address names the program, whatever the model called the page.
    slug: slugify(`${program} taster course`),
    headline: text(draft.headline, 120) || title,
    subheadline: text(draft.subheadline, 400),
    highlights: Array.isArray(draft.highlights)
      ? draft.highlights
          .map((h) => text(h, 160))
          .filter(Boolean)
          .slice(0, 6)
      : [],
    program,
    ctaLabel: text(draft.cta_label, 40) || "Ask about this program",
    published: false,
    course: { lessons },
  });
  const problems = validateLandingPage(page);
  if (problems.length) throw new Error(problems[0].message);
  return page;
}

/** The page in Recruit's reply; throws with what is wrong when there is none to save. */
export function parseDraft(reply: string, timeZone: string): LandingPage {
  const draft = readObject(reply, "a page");
  const title = text(draft.title, 120) || text(draft.headline, 120);
  if (!title) throw new Error("Its answer had no title.");
  const event =
    draft.event && typeof draft.event === "object"
      ? (draft.event as Record<string, unknown>)
      : null;
  const startsAt = instant(event?.starts_at);
  const page = newLandingPage({
    title,
    headline: text(draft.headline, 120) || title,
    subheadline: text(draft.subheadline, 400),
    ...(Array.isArray(draft.highlights) && {
      highlights: draft.highlights
        .map((h) => text(h, 160))
        .filter(Boolean)
        .slice(0, 6),
    }),
    program: text(draft.program, 120),
    term: text(draft.term, 60),
    ...(text(draft.cta_label, 40) && { ctaLabel: text(draft.cta_label, 40) }),
    published: false,
    ...(event &&
      startsAt && {
        event: {
          startsAt,
          timeZone,
          ...(instant(event.ends_at) && { endsAt: instant(event.ends_at) }),
          ...(text(event.place, 200) && { place: text(event.place, 200) }),
          ...(instant(event.sign_up_by) && { signUpBy: instant(event.sign_up_by) }),
        },
      }),
  });
  const problems = validateLandingPage(page);
  if (problems.length) throw new Error(problems[0].message);
  return page;
}

/** The platform refused before the agent ran: nothing it could have done happened. */
export class NotStarted extends PlatformError {}

/** One turn with an agent and its whole reply, acting as the signed-in person: a new conversation each time. */
export async function askAgent(input: {
  org: string;
  username: string;
  /** The caller's session token. */
  token: string;
  agentId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { org, agentId, token } = input;
  const enc = encodeURIComponent;
  const session = await platformFetch<{ session_id?: string }>(
    `/dm/api/ai-mentor/orgs/${enc(org)}/users/${enc(input.username)}/sessions/`,
    `Token ${token}`,
    { method: "POST", body: { mentor: agentId } },
  ).catch((e: unknown) => {
    throw e instanceof PlatformError ? new NotStarted(e.status, e.body, e.message) : e;
  });
  if (!session?.session_id)
    throw new NotStarted(502, null, "The platform did not start a conversation.");
  // The chat endpoint reads its credential from the body, not from a header.
  // `mentor`, not `agent`: the gateway in front of this host answers its own 403 for the newer spelling.
  const res = await fetch(
    `${config.baseWsUrl().replace(/^ws/, "http")}/api/mentor/chat/?platform_key=${enc(org)}&session_id=${enc(session.session_id)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      cache: "no-store",
      // Under the routes' 60 seconds, so a slow turn is an error they can record.
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        session_id: session.session_id,
        prompt: input.prompt,
        flow: { name: agentId, tenant: org },
        token,
        token_type: "dm_token",
        ...(input.metadata && { metadata: input.metadata }),
      }),
    },
  );
  const stream = await res.text();
  // The status is the first frame's: a 4xx means the turn was refused before it began.
  if (!res.ok)
    throw new (res.status < 500 ? NotStarted : PlatformError)(res.status, stream.slice(0, 600));
  return readReply(stream);
}

/** Ask Recruit for the draft, acting as the staff member who wrote the brief. */
export async function draftPage(input: {
  org: string;
  username: string;
  /** The caller's session token. */
  token: string;
  agentId: string;
  brief: string;
  timeZone: string;
  now?: Date;
  /** A taster course about `program`, or (absent) a page from the brief. */
  kind?: "page" | "course";
  program?: string;
}): Promise<LandingPage> {
  const course = input.kind === "course";
  const program = input.program?.trim() ?? "";
  // The brief's own day: en-CA writes a date as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input.now ?? new Date());
  const reply = await askAgent({
    org: input.org,
    username: input.username,
    token: input.token,
    agentId: input.agentId,
    prompt: course
      ? coursePrompt(program, input.brief)
      : draftPrompt(input.brief, today, input.timeZone),
    metadata: { purpose: "draft" },
  });
  return course ? parseCourse(reply, program) : parseDraft(reply, input.timeZone);
}
