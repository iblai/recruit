/** The rules behind a person's review: what a shortlist keeps, and which drafts a batch sends. Pure. */
import type { Activity, Person } from "../../../lib/crm/types";
import { foundOf, type Shortlist } from "../../../lib/recruit/found";
import { followUpOf, foundLine, withLine } from "../../../lib/recruit/follow-ups";

/**
 * A shortlist's metadata once reviewed: the request and the counts, nobody's
 * details. `passed` holds the handles (`platform:handle`) of those a person
 * passed over, so new shortlists leave them out for `PASSED_DAYS`.
 */
export function closedShortlist(
  list: Shortlist,
  kept: number,
  by: string,
  now = new Date(),
  passed: string[] = [],
) {
  const { criteria, source, basis, at, proposed } = list;
  return {
    shortlist: {
      criteria,
      source,
      basis,
      at,
      proposed,
      people: [],
      kept,
      reviewed: { at: now.toISOString(), by },
    },
    ...(passed.length && { passed }),
  };
}

/** The platform's 400 for a second person with the same `unique_id`. */
export function uniqueIdTaken(err: unknown): boolean {
  const e = err as { status?: unknown; data?: { unique_id?: unknown } } | null;
  return e?.status === 400 && Array.isArray(e.data?.unique_id);
}

export type LeftOut = "notEmail" | "noAddress" | "optedOut" | "approved";
export interface Outgoing {
  id: number;
  name: string;
  to: string;
  subject: string;
  body: string;
}

/** Which email drafts a batch sends, exactly as the single dialog would, and why the rest stay. */
export function batchPlan(
  drafts: { activity: Activity; person: Person }[],
  institution: string,
  mailingAddress?: string,
) {
  const go: Outgoing[] = [];
  const left: { id: number; name: string; reason: LeftOut }[] = [];
  for (const { activity, person } of drafts) {
    const name = person.name;
    const fu = activity.metadata?.follow_up as { approved?: unknown } | undefined;
    const reason: LeftOut | null =
      followUpOf(activity)?.channel !== "email"
        ? "notEmail"
        : fu?.approved
          ? "approved"
          : person.metadata?.opted_out === true
            ? "optedOut"
            : !person.primary_email
              ? "noAddress"
              : null;
    if (reason) {
      left.push({ id: activity.id, name, reason });
      continue;
    }
    const found = foundOf(person);
    const body = activity.comment ?? "";
    go.push({
      id: activity.id,
      name,
      to: person.primary_email ?? "",
      subject: activity.title,
      body: found ? withLine(body, foundLine(institution, found.source, mailingAddress)) : body,
    });
  }
  return { go, left };
}

export type Outcome = { id: number; name: string; sent: boolean | null; detail: string };

/** Sent, not sent (with why), and not known. */
export function tally(outcomes: Outcome[]) {
  return {
    sent: outcomes.filter((o) => o.sent === true).length,
    failed: outcomes.filter((o) => o.sent === false),
    unknown: outcomes.filter((o) => o.sent === null).length,
  };
}
