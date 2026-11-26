/**
 * Follow-ups: messages the agents write for a prospect and a person sends.
 * Each is a CRM activity that is not done, marked `metadata.follow_up`; a
 * handoff is one marked `metadata.handoff`. Nothing here sends anything.
 */
import type { Activity, Person } from "../crm/types";
import { CHANNELS, foundOf } from "./found";
import { eventWhen, type PageEvent } from "./landing-pages";

/** `dm`: a message on the channel a student was found on, sent by hand from the university's account. */
export type Channel = "email" | "text" | "dm";

export interface FollowUp {
  channel: Channel;
  /** confirmation, reminder, nudge or reply. */
  kind: string;
  /** Who wrote it: an agent's name. */
  by?: string;
  /** The event page it is about, so a sign-up gets one of each kind. */
  event?: string;
  /** The step of the stage's cadence it answers (`lib/recruit/outreach.ts`). */
  step?: string;
  /** A person decided not to send it: it is done, and nobody was written to. */
  discarded?: boolean;
}

export interface Handoff {
  reason?: string;
  /** The chat session the student was in. */
  conversation?: string;
}

/** Why this person may not be written to on `channel`; "" when they may. */
export function contactRefusal(
  person: Pick<Person, "primary_email" | "contact_numbers" | "metadata">,
  channel: Channel,
): string {
  const said = person.metadata ?? {};
  if (said.opted_out === true) return "They asked not to be contacted.";
  // Their one message is sent where they were found, by hand: never to an address they published.
  if (channel !== "dm" && foundOf(person)?.platform)
    return "They were found on a social channel: they are written to there, by hand.";
  if (channel === "email") return person.primary_email ? "" : "There is no email address on file.";
  if (channel === "dm") {
    const found = foundOf(person);
    if (found?.platform && !CHANNELS[found.platform].dm)
      return `${CHANNELS[found.platform].label} has no direct messages: they hear from the university only if they sign up.`;
    return found?.profile_url ? "" : "There is no profile on file.";
  }
  if (!person.contact_numbers?.length) return "There is no phone number on file.";
  return said.sms_consent === true || said.sms_consent === "true"
    ? ""
    : "They did not ask for texts.";
}

const record = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

export function followUpOf(activity: Pick<Activity, "metadata">): FollowUp | null {
  const f = record(activity.metadata?.follow_up);
  if (!f) return null;
  return {
    channel: f.channel === "text" || f.channel === "dm" ? f.channel : "email",
    kind: typeof f.kind === "string" ? f.kind : "reply",
    ...(typeof f.by === "string" && { by: f.by }),
    ...(typeof f.event === "string" && { event: f.event }),
    ...(typeof f.step === "string" && { step: f.step }),
    ...(!!f.discarded && { discarded: true }),
  };
}

export function handoffOf(activity: Pick<Activity, "metadata">): Handoff | null {
  const h = record(activity.metadata?.handoff);
  if (!h) return null;
  return {
    ...(typeof h.reason === "string" && { reason: h.reason }),
    ...(typeof h.conversation === "string" && h.conversation && { conversation: h.conversation }),
  };
}

/** The event page a chat booking was for. */
export function bookedEvent(activity: Pick<Activity, "metadata">): string {
  const event = record(activity.metadata?.booking)?.event;
  return typeof event === "string" ? event : "";
}

/**
 * A confirmation or a reminder for someone signed up to an event, for a person
 * to read, change and send.
 */
// ponytail: English only; the visitor's language once a sign-up records it.
export function eventMessage(
  kind: "confirmation" | "reminder",
  person: Pick<Person, "name">,
  page: { title: string; event: PageEvent },
): { subject: string; body: string } {
  const first = person.name?.trim().split(/\s+/)[0] || "there";
  const details = [eventWhen(page.event), page.event.place].filter(Boolean).join("\n");
  return kind === "reminder"
    ? {
        subject: `Reminder: ${page.title}`,
        body: `Hi ${first},\n\nA reminder about ${page.title}.\n\n${details}\n\nWe look forward to seeing you.`,
      }
    : {
        subject: `Confirmation: ${page.title}`,
        body: `Hi ${first},\n\nYou are signed up for ${page.title}.\n\n${details}\n\nIf your plans change, reply to this message.`,
      };
}

/** The line at the foot of every message to someone the university found. */
export function foundLine(institution: string, source: string, mailingAddress?: string): string {
  const address = mailingAddress?.trim() ? ` ${mailingAddress.trim()}.` : "";
  return `This message is from ${institution}. We found your address through ${sourceName(source)}. If you would rather not hear from us, reply to say so and we will not write to you again.${address}`;
}

/** Where an address was found, with any link in it named by its host: an agent wrote it, so it is never a link. */
function sourceName(source: string): string {
  return source.replace(/(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, (link) => {
    try {
      return new URL(/^www\./i.test(link) ? `https://${link}` : link).hostname;
    } catch {
      return "";
    }
  });
}

/** `body` with `line` at its foot exactly once. */
export function withLine(body: string, line: string): string {
  const rest = body.split(line).join("").trimEnd();
  return `${rest}\n\n${line}`;
}

/** The `mailto:` or `sms:` link a person sends an approved message from. */
export function sendLink(
  channel: Exclude<Channel, "dm">,
  to: string,
  subject: string,
  body: string,
): string {
  const q = encodeURIComponent;
  // The `@` stays literal: not every mail app decodes it in the address.
  return channel === "email"
    ? `mailto:${q(to).replace(/%40/g, "@")}?subject=${q(subject)}&body=${q(body)}`
    : `sms:${q(to)}?&body=${q(body)}`;
}
