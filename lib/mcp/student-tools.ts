/**
 * Recruit's public tools: what the agent may do for a visitor who is not
 * signed in. The visitor drives the model, so the boundary is here and not in
 * the prompt:
 *  - no tool returns a person's data;
 *  - an existing person's fields are never changed from chat, a note is added;
 *  - arguments carry length and format limits (`validateArgs`);
 *  - writes are capped, and a repeat returns what the first one did;
 *  - `conversation` is a label on the record, never a way to read anything.
 */
import type { Person } from "../crm/types";
import type { CrmServer } from "../recruit/crm-server";
import { applicationTitle } from "../recruit/fields";
import { eventMessage } from "../recruit/follow-ups";
import { foundOf } from "../recruit/found";
import { eventIsOpen, eventWhen, fromWebForm, type LandingPage } from "../recruit/landing-pages";
import { counselorFor, type RecruitSettings } from "../recruit/org-settings";
import { McpServer, errorResult, type JsonSchema, type ToolDefinition } from "./protocol";

export interface StudentToolContext {
  org: string;
  crm: CrmServer;
  settings: RecruitSettings;
  now?: () => Date;
}

const AI = "Recruit (AI)";
const FAILED =
  "That did not go through. Tell the person plainly that it was not saved, and offer a counselor.";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nowOf = (ctx: StudentToolContext) => ctx.now?.() ?? new Date();

// No markup, address or link: a name ends up in a greeting a person may send.
const NAME: JsonSchema = { type: "string", maxLength: 80, pattern: "^[^<>@/:]{1,80}$" };
const EMAIL: JsonSchema = {
  type: "string",
  maxLength: 254,
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
};
const PHONE: JsonSchema = { type: "string", maxLength: 32, pattern: "^[0-9+() .-]{7,32}$" };
const CONVERSATION: JsonSchema = {
  type: "string",
  maxLength: 64,
  pattern: "^[A-Za-z0-9-]{8,64}$",
  description: "The `conversation` value from the context metadata, exactly as given.",
};

// ponytail: counted per server instance; a shared store when the app runs on several.
const WINDOW_MS = 60_000;
const MAX_WRITES = 30;
const writes = new Map<string, number[]>();

/** At most `MAX_WRITES` public writes a minute per platform. */
function underCap(org: string, now: number): boolean {
  const recent = (writes.get(org) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_WRITES) return false;
  writes.set(org, [...recent, now]);
  return true;
}

/** Tests only. */
export function forgetWrites() {
  writes.clear();
}

/** A write tool: capped, and a platform failure never reaches the visitor's model. */
function write(
  handler: ToolDefinition<StudentToolContext>["handler"],
): ToolDefinition<StudentToolContext>["handler"] {
  return async (args, ctx) => {
    if (!underCap(ctx.org, nowOf(ctx).getTime()))
      return errorResult("Recruit is busy right now. Ask the person to try again in a minute.");
    try {
      return await handler(args, ctx);
    } catch (e) {
      // The status only: the body can carry what the visitor typed.
      console.error("Recruit public tool failed:", e instanceof Error ? e.message : "unknown");
      return errorResult(FAILED);
    }
  };
}

type Contact = {
  first: string;
  last: string;
  email: string;
  phone: string;
  textOk: boolean;
  program: string;
  owner: number | null;
};

const contactOf = (args: Record<string, unknown>, owner: number | null = null): Contact => ({
  first: str(args.first_name),
  last: str(args.last_name),
  email: str(args.email).toLowerCase(),
  phone: str(args.phone),
  textOk: args.text_ok === true,
  program: str(args.program),
  owner,
});

/**
 * The person with this email, or a new one. Someone already on file keeps
 * every field: anyone can type an email, so chat only adds to their record.
 */
async function findOrCreatePerson(
  ctx: StudentToolContext,
  who: Contact,
  conversation: string,
): Promise<{ person: Person; isNew: boolean }> {
  const existing = await ctx.crm.findPersonByEmail(who.email);
  if (existing) {
    await linkConversation(ctx, existing, conversation);
    return { person: existing, isNew: false };
  }
  const person = await ctx.crm.createPerson({
    name: [who.first, who.last].filter(Boolean).join(" ") || who.email,
    primary_email: who.email,
    contact_numbers: who.phone ? [who.phone] : undefined,
    job_title: who.program || undefined,
    lifecycle_stage: "lead",
    owner: who.owner,
    metadata: {
      source: "recruit-chat",
      ...(who.phone && { sms_consent: who.textOk }),
      ...(conversation && { conversations: [conversation] }),
    },
  });
  return { person, isNew: true };
}

async function linkConversation(ctx: StudentToolContext, person: Person, conversation: string) {
  if (!conversation) return;
  const old = Array.isArray(person.metadata?.conversations)
    ? (person.metadata.conversations as unknown[]).filter((c) => typeof c === "string")
    : [];
  if (old.includes(conversation)) return;
  await ctx.crm.patchMetadata("persons", person.id, {
    conversations: [...old, conversation].slice(-20),
  });
}

/** Published event pages people can still sign up for, soonest first. */
async function openEvents(ctx: StudentToolContext): Promise<LandingPage[]> {
  const now = nowOf(ctx);
  return (await ctx.crm.listWebForms())
    .map(fromWebForm)
    .filter((p) => p.published && p.event && eventIsOpen(p.event, now))
    .sort((a, b) => Date.parse(a.event!.startsAt) - Date.parse(b.event!.startsAt));
}

const T = <A extends ToolDefinition<StudentToolContext>>(t: A) => t;

export const STUDENT_TOOLS: ToolDefinition<StudentToolContext>[] = [
  T({
    name: "list_events",
    description:
      "The visit days and events people can sign up for now, soonest first, with the date, time, place and sign-up deadline. Call it before offering or booking one; never invent an event or a date.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List events", readOnlyHint: true },
    handler: async (_args, ctx) => {
      try {
        const events = await openEvents(ctx);
        return {
          events: events.slice(0, 20).map((p) => ({
            event: p.slug,
            title: p.title,
            when: eventWhen(p.event!),
            time_zone: p.event!.timeZone,
            place: p.event!.place ?? null,
            sign_up_by: p.event!.signUpBy ?? null,
            program: p.program || null,
          })),
        };
      } catch {
        return errorResult("The events could not be read. Offer a counselor instead.");
      }
    },
  }),
  T({
    name: "book_visit",
    description:
      "Sign the person up for an event from list_events. Needs their first name, last name and email; pass a phone number only if they offered one, with text_ok true only if they asked for texts. A confirmation is drafted for staff to review and send: nothing is emailed automatically, so never say an email is on its way.",
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", maxLength: 64, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
        first_name: NAME,
        last_name: NAME,
        email: EMAIL,
        phone: PHONE,
        text_ok: { type: "boolean" },
        conversation: CONVERSATION,
      },
      required: ["event", "first_name", "last_name", "email"],
      additionalProperties: false,
    },
    annotations: { title: "Book a visit" },
    handler: write(async (args, ctx) => {
      const page = (await openEvents(ctx)).find((p) => p.slug === str(args.event));
      if (!page?.event)
        return errorResult(
          "That event is not open for sign-up. Call list_events for the current ones.",
        );
      const conversation = str(args.conversation);
      const owner = counselorFor(ctx.settings, page.program, page.ownerId);
      const who = { ...contactOf(args, owner), program: page.program ?? "" };
      const { person } = await findOrCreatePerson(ctx, who, conversation);
      const booked = { booked: true, event: page.title, when: eventWhen(page.event) };

      const mine = await ctx.crm.listActivities({
        person: person.id,
        metadata__has_key: "booking",
        page_size: 50,
      });
      const same = (a: { metadata?: Record<string, unknown> }) =>
        (a.metadata?.booking as { event?: string } | undefined)?.event === page.slug;
      // The same answer either way: whether this email was already signed up is not the visitor's to learn.
      if (mine.results.some(same)) return booked;

      let dealId: number | null = null;
      if (page.createApplication) {
        const pipeline = await ctx.crm.resolvePipeline(page.pipelineCode || undefined);
        const stages = [...(pipeline?.stages ?? [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        const stage =
          stages.find((s) => s.code === page.stageCode) ??
          stages.find((s) => !s.is_won && !s.is_lost);
        if (pipeline && stage) {
          // The platform made the page's Source when the page was saved.
          const source = page.sourceCode
            ? (await ctx.crm.listLeadSources()).find((s) => s.code === page.sourceCode)
            : undefined;
          const deal = await ctx.crm.createDeal({
            title: applicationTitle(person.name, page.program, page.term),
            person: person.id,
            pipeline: pipeline.id,
            stage: stage.id,
            source: source?.id ?? null,
            owner,
            metadata: {
              event: page.slug,
              ...(page.program && { program: page.program }),
              ...(page.term && { term: page.term }),
            },
          });
          dealId = deal.id;
        }
      }
      await ctx.crm.createActivity({
        type: "lunch",
        title: page.title,
        location: page.event.place ?? "",
        schedule_from: page.event.startsAt,
        schedule_to: page.event.endsAt ?? null,
        comment: `Signed up in chat with ${AI}.`,
        person: person.id,
        deal: dealId,
        owner,
        metadata: { booking: { event: page.slug, conversation } },
      });
      for (const name of page.tags ?? []) {
        const tag = await ctx.crm.findOrCreateTag(name);
        await ctx.crm.attachTag("persons", person.id, tag.id);
      }
      // Written here, not by the model: a visitor steers the model, and this draft can be sent.
      const confirmation = eventMessage("confirmation", person, {
        title: page.title,
        event: page.event,
      });
      await ctx.crm.createActivity({
        type: "email",
        title: confirmation.subject,
        comment: confirmation.body,
        person: person.id,
        deal: dealId,
        owner,
        is_done: false,
        metadata: {
          follow_up: { channel: "email", kind: "confirmation", by: AI, event: page.slug },
        },
      });
      return booked;
    }),
  }),
  T({
    name: "save_inquiry",
    description:
      "Record that the person wants to hear back, with what they asked. Needs their email; set email_ok false when they ask not to be contacted again, which is honored at once. Pass text_ok true only if they asked for texts.",
    inputSchema: {
      type: "object",
      properties: {
        first_name: NAME,
        last_name: NAME,
        email: EMAIL,
        phone: PHONE,
        program: { type: "string", maxLength: 120 },
        summary: {
          type: "string",
          maxLength: 1000,
          description: "What they asked and what you answered, in two or three sentences.",
        },
        email_ok: { type: "boolean" },
        text_ok: { type: "boolean" },
        conversation: CONVERSATION,
      },
      required: ["email", "summary"],
      additionalProperties: false,
    },
    annotations: { title: "Save an inquiry" },
    handler: write(async (args, ctx) => {
      const conversation = str(args.conversation);
      const who = contactOf(args, counselorFor(ctx.settings, str(args.program)));
      const { person } = await findOrCreatePerson(ctx, who, conversation);
      // The one change chat makes to someone on file: less contact, never more.
      const optOut = args.email_ok === false;
      if (optOut) {
        await ctx.crm.patchMetadata("persons", person.id, {
          opted_out: true,
          sms_consent: false,
          opted_out_at: nowOf(ctx).toISOString(),
        });
        // A student found on a social channel stops in the CRM app too; a failure is the staff's to see, never the visitor's.
        if (foundOf(person)?.platform)
          await ctx.crm
            .syncCrmCopy({ ...person, metadata: { ...person.metadata, opted_out: true } })
            .catch(() =>
              ctx.crm.createActivity({
                type: "note",
                title: "Not marked in the CRM app",
                comment:
                  "They asked not to be contacted, and Recruit could not mark their copy in the CRM app. Tag it Do not contact there by hand.",
                person: person.id,
                owner: person.owner ?? who.owner,
                is_done: true,
              }),
            );
      }
      await ctx.crm.createActivity({
        type: "note",
        title: optOut ? "Asked not to be contacted" : "Inquiry in chat",
        comment: `${str(args.summary)}\n\nSaid in chat with ${AI}.`,
        person: person.id,
        owner: person.owner ?? who.owner,
        is_done: true,
        metadata: { inquiry: { conversation } },
      });
      return { saved: true, ...(optOut && { contact_stopped: true }) };
    }),
  }),
  T({
    name: "request_counselor",
    description:
      "Hand the conversation to a person: when they ask for one, when the question is about their own application, admission or aid decision, a complaint or a safety concern, or when the documents do not answer. Needs an email so the counselor can reply; the counselor sees your summary and the whole conversation. Promise no response time.",
    inputSchema: {
      type: "object",
      properties: {
        first_name: NAME,
        last_name: NAME,
        email: EMAIL,
        phone: PHONE,
        program: { type: "string", maxLength: 120 },
        reason: { type: "string", maxLength: 200 },
        summary: {
          type: "string",
          maxLength: 1500,
          description: "The conversation so far for the counselor, in two or three sentences.",
        },
        conversation: CONVERSATION,
      },
      required: ["email", "reason", "summary"],
      additionalProperties: false,
    },
    annotations: { title: "Ask for a counselor" },
    handler: write(async (args, ctx) => {
      const conversation = str(args.conversation);
      const who = contactOf(args, counselorFor(ctx.settings, str(args.program)));
      const { person } = await findOrCreatePerson(ctx, who, conversation);
      const open = await ctx.crm.listActivities({
        person: person.id,
        is_done: false,
        metadata__has_key: "handoff",
        page_size: 5,
      });
      if (open.results.length) return { handed_off: true };
      await ctx.crm.createActivity({
        type: "task",
        title: `Talk to ${person.name}`,
        comment: `${str(args.reason)}\n\n${str(args.summary)}\n\nHanded over by ${AI}.`,
        schedule_from: nowOf(ctx).toISOString(),
        person: person.id,
        owner: counselorFor(ctx.settings, str(args.program), person.owner),
        is_done: false,
        metadata: { handoff: { reason: str(args.reason), conversation } },
      });
      return { handed_off: true };
    }),
  }),
];

export const STUDENT_MCP_INFO = {
  name: "iblai-recruit-public",
  title: "ibl.ai/recruit public tools",
  version: "0.1.0",
  instructions:
    "What Recruit may do for a visitor: list events, sign them up, record an inquiry, hand over to a counselor. Nothing here reads a person's record.",
};

/** The MCP server with Recruit's public tools registered. */
export function createStudentServer(): McpServer<StudentToolContext> {
  const server = new McpServer<StudentToolContext>(STUDENT_MCP_INFO);
  for (const t of STUDENT_TOOLS) server.tool(t);
  return server;
}
