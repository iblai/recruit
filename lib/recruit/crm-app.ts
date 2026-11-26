/**
 * The CRM app's own records: the platform's CRM asked with no `app`, which is
 * what crm.iblai.me shows. Recruit writes one thing there, a copy of each
 * student a person kept from a social channel (with its channel tag, a note,
 * and Do not contact), and reads there only to find that copy.
 *
 * Server-only; relative imports on purpose (vitest resolves no `@/` alias).
 */
import { PlatformError, platformFetch, type PlatformInit } from "../iblai/platform";
import type { Activity, Paginated, Person, Tag } from "../crm/types";
import { CHANNELS, DO_NOT_CONTACT_TAG, channelTag, foundOf, uniqueIdOf, type Found } from "./found";

/** What became of the CRM app's copy; `stopped` when it is marked Do not contact. */
export interface CrmCopy {
  copy: "added" | "on_file" | "none";
  stopped: boolean;
}

const NOT_APART =
  "This platform’s CRM doesn’t keep apps’ records apart, so recruit won’t write to the CRM app.";

type Call = <T>(path: string, init?: PlatformInit) => Promise<T>;

// The CRM app's records carry a blank `app`: anything else is another app's, or a platform without scopes.
const crmApps = (row: unknown) => (row as { app?: unknown } | null)?.app === "";
const own = <T>(row: T): T => {
  if (!crmApps(row)) throw new PlatformError(503, { detail: NOT_APART });
  return row;
};

/**
 * Bring the CRM app's copy of a student found on a social channel in line with
 * Recruit's record. When a person has just `kept` them, the copy is made if
 * missing and given its channel tag and note. A Do not contact goes one way:
 * Recruit adds the mark there and never removes it.
 */
export async function syncCrmCopy(
  authorization: string,
  person: Person,
  kept = false,
): Promise<CrmCopy> {
  const found = foundOf(person);
  const optedOut = person.metadata?.opted_out === true;
  if (!found?.platform || !found.handle) return { copy: "none", stopped: false };
  const call: Call = (path, init) => platformFetch(`/dm/api/crm${path}`, authorization, init);
  // From the checked handle: the record's own `unique_id` is a field staff can edit.
  const uid = uniqueIdOf(found.platform, found.handle);
  let copy = await copyOf(call, uid);
  const outcome: CrmCopy["copy"] = copy ? "on_file" : "added";
  if (!copy) {
    // Made only at a pick, and never for someone who asked not to be contacted.
    if (!kept || optedOut) return { copy: "none", stopped: optedOut };
    copy = own(
      await call<Person>("/persons/", {
        method: "POST",
        body: {
          name: person.name,
          unique_id: uid,
          ...(person.job_title && { job_title: person.job_title }),
          lifecycle_stage: "lead",
          metadata: { found: person.metadata?.found },
        },
      }),
    );
  }
  if (kept) {
    // On every pick, so a retry after a half-made copy finishes it.
    await attach(call, copy.id, await tagNamed(call, channelTag(found.platform)));
    await noteOnce(call, copy.id, found);
  }
  const marked = copy.tags?.some((t) => t.name === DO_NOT_CONTACT_TAG) ?? false;
  if (optedOut && !marked) await attach(call, copy.id, await tagNamed(call, DO_NOT_CONTACT_TAG));
  return { copy: outcome, stopped: optedOut || marked };
}

/** The copy by its exact id: `search` is a substring match, so its pages are walked. */
// ponytail: ten pages of substring hits; a `unique_id` filter when the platform gains one.
async function copyOf(call: Call, uid: string): Promise<Person | undefined> {
  for (let page = 1; page <= 10; page++) {
    const data = await call<Paginated<Person>>(
      `/persons/?search=${encodeURIComponent(uid)}&page_size=100&page=${page}`,
    );
    const hit = data.results.map(own).find((p) => p.unique_id === uid);
    if (hit || !data.next_page) return hit;
  }
  return undefined;
}

/** The note that tells the CRM app's users where the student came from, made once. */
async function noteOnce(call: Call, person: string, found: Found) {
  const { results } = await call<Paginated<Activity>>(
    `/activities/?person=${person}&metadata__has_key=recruit_found&page_size=1`,
  );
  if (results.length) return;
  const label = CHANNELS[found.platform!].label;
  await call("/activities/", {
    method: "POST",
    body: {
      type: "note",
      title: `Found on ${label}`,
      comment: `Found on ${label} by Recruit${found.said ? `: “${found.said}”` : ""}\n${found.profile_url}`,
      person,
      is_done: true,
      metadata: { recruit_found: true },
    },
  });
}

/** The CRM app's tag by name, made when missing. */
async function tagNamed(call: Call, name: string): Promise<Tag> {
  const { results } = await call<Paginated<Tag>>(
    `/tags/?name__iexact=${encodeURIComponent(name)}&page_size=5`,
  );
  const hit = results.find((t) => crmApps(t) && t.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  return own(await call<Tag>("/tags/", { method: "POST", body: { name, color: "#6b7280" } }));
}

/** Attach a tag; one already there (409) is success. */
async function attach(call: Call, person: string, tag: Tag) {
  try {
    await call(`/persons/${person}/tags/`, { method: "POST", body: { tag_id: tag.id } });
  } catch (e) {
    if (!(e instanceof PlatformError && e.status === 409)) throw e;
  }
}
