import { describe, expect, it } from "vitest";
import type { Activity, Person } from "../lib/crm/types";
import { RECRUIT_TOOLS, type ToolContext } from "../lib/mcp/tools";
import { SHORTLIST_HOLDER } from "../lib/recruit/found";

const NOW = new Date("2027-03-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const tool = RECRUIT_TOOLS.find((t) => t.name === "shortlist_found_students")!;
const text = (r: unknown) => (r as { content?: { text: string }[] }).content?.[0].text ?? "";

const maya = {
  name: "Maya Park",
  platform: "reddit",
  handle: "u/Maya_P",
  said: "Starting my nursing prerequisites this fall.",
  why: "Plans to study nursing in Ohio.",
};
const list = (people: object[], at = ago(1), extra: object = {}) =>
  ({
    id: Math.floor(Math.random() * 1e6),
    created_at: at,
    is_done: false,
    metadata: {
      other: 1,
      shortlist: {
        criteria: "Nursing students in Ohio",
        source: "r/nursing",
        basis: "b",
        at,
        people,
        ...extra,
      },
    },
  }) as unknown as Activity;

function platform({
  open = [] as Activity[],
  recent = [] as Activity[],
  onFile = [] as Partial<Person>[],
  basis = "They posted in public that they want to study nursing with us.",
} = {}) {
  const made: Record<string, unknown>[] = [];
  const patched: [number, Record<string, unknown>][] = [];
  const searched: string[] = [];
  // One store, as the platform keeps it: what the tool writes is what it reads next.
  const store = [...open, ...recent];
  const crm = {
    allActivities: async (q: {
      is_done?: boolean;
      start_date?: string;
      end_date?: string;
      metadata__has_key?: string;
    }) => {
      // As the platform: a date window takes both ends, or it answers 400; each end is a whole day.
      if (!q.start_date !== !q.end_date)
        throw new Error("400: start_date and end_date are required");
      const from = q.start_date ? Date.parse(q.start_date) : -Infinity;
      const to = q.end_date ? Date.parse(q.end_date) + DAY : Infinity;
      return store.filter(
        (a) =>
          (q.is_done === undefined || a.is_done === q.is_done) &&
          (!q.metadata__has_key || q.metadata__has_key in (a.metadata ?? {})) &&
          Date.parse(a.created_at) >= from &&
          Date.parse(a.created_at) < to,
      );
    },
    updateActivity: async (id: number, body: Record<string, unknown>) => {
      patched.push([id, body]);
      Object.assign(store.find((a) => a.id === id) ?? {}, body);
    },
    listPersons: async (q: { search: string }) => {
      searched.push(q.search);
      // A substring match: the tool keeps only an exact one.
      return { results: onFile.filter((p) => p.unique_id?.includes(q.search)) };
    },
    findOrCreateOrganization: async (name: string) => ({ id: `org-${name}` }),
    createActivity: async (body: Record<string, unknown>) => made.push(body),
  };
  const ctx = {
    org: "northfield",
    crm,
    appUrl: "",
    now: () => NOW,
    settings: { foundBasis: basis },
  } as unknown as ToolContext;
  const call = (args: object = {}) =>
    tool.handler(
      { criteria: "Nursing students in Ohio", source: "r/nursing", people: [maya], ...args },
      ctx,
    ) as Promise<Record<string, unknown>>;
  return { call, made, patched, searched };
}

describe("shortlist_found_students", () => {
  it("saves one task on the holder record with the people, and returns counts only", async () => {
    const { call, made } = platform();
    const out = await call();
    expect(out).toEqual({
      shortlisted: 1,
      already_on_file: 0,
      listed_twice: 0,
      already_waiting: 0,
      passed_over_recently: 0,
      refused: {},
      waits_for: "a person, under Needs you",
    });
    expect(made).toEqual([
      {
        type: "task",
        title: "Students found: Nursing students in Ohio",
        comment: "1 found on r/nursing, for a person to pick who is kept.",
        organization: `org-${SHORTLIST_HOLDER}`,
        is_done: false,
        metadata: {
          shortlist: {
            criteria: "Nursing students in Ohio",
            source: "r/nursing",
            basis: "They posted in public that they want to study nursing with us.",
            at: NOW.toISOString(),
            proposed: 1,
            people: [
              {
                name: "Maya Park",
                platform: "reddit",
                handle: "maya_p",
                said: maya.said,
                why: maya.why,
              },
            ],
          },
        },
      },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/maya/i);
  });

  it("saves nothing until an admin wrote why the university may contact people it finds", async () => {
    const { call, made } = platform({ basis: "short" });
    expect(text(await call())).toMatch(/Settings → Connectors/);
    expect(made).toEqual([]);
  });

  it("refuses bad criteria, source and list sizes", async () => {
    const { call, made } = platform();
    expect(text(await call({ criteria: "nurses" }))).toMatch(/10 to 300/);
    expect(text(await call({ source: "r" }))).toMatch(/3 to 200/);
    expect(text(await call({ people: [] }))).toMatch(/1 to 50/);
    expect(text(await call({ people: Array(51).fill(maya) }))).toMatch(/1 to 50/);
    expect(made).toEqual([]);
  });

  it("refuses each bad candidate by its sentence, skips repeats and anyone already waiting, and ignores a claimed record", async () => {
    const waiting = list([{ ...maya, handle: "ola_k", name: "Ola" }]);
    const { call, made } = platform({ open: [waiting] });
    const out = await call({
      people: [
        { ...maya, on_file: "someone-else", email: "m@x.edu", profile_url: "https://evil" },
        { ...maya, handle: "MAYA_P" },
        { ...maya, handle: "ola_k" },
        { ...maya, platform: "tiktok" },
        { ...maya, said: "" },
      ],
    });
    expect(out).toMatchObject({
      shortlisted: 1,
      listed_twice: 1,
      already_waiting: 1,
      refused: {
        "The channel is one of: instagram, reddit, x, youtube.": 1,
        '"said" is missing.': 1,
      },
    });
    const kept = (made[0].metadata as { shortlist: { people: object[] } }).shortlist.people;
    expect(kept).toEqual([expect.not.objectContaining({ on_file: expect.anything() })]);
    expect(JSON.stringify(kept)).not.toMatch(/evil|m@x\.edu/);
  });

  it("marks someone already on file by the exact handle, and keeps them in the list", async () => {
    const { call, made, searched } = platform({
      onFile: [
        { id: "p2", unique_id: "reddit:maya_pa" },
        { id: "p1", unique_id: "reddit:maya_p" },
      ],
    });
    expect(await call()).toMatchObject({ shortlisted: 1, already_on_file: 1 });
    expect(searched).toEqual(["reddit:maya_p"]);
    const people = (made[0].metadata as { shortlist: { people: object[] } }).shortlist.people;
    expect(people).toEqual([expect.objectContaining({ on_file: "p1" })]);
  });

  it("empties and closes a shortlist nobody reviewed in 14 days, then counts what is left open", async () => {
    const old = list([maya], ago(15), { proposed: 1 });
    const fresh = Array.from({ length: 4 }, () => list([]));
    const { call, patched, made } = platform({ open: [old, ...fresh] });
    expect(await call()).toMatchObject({ shortlisted: 1 });
    expect(patched).toEqual([
      [
        old.id,
        {
          is_done: true,
          metadata: {
            other: 1,
            shortlist: {
              criteria: "Nursing students in Ohio",
              source: "r/nursing",
              basis: "b",
              at: old.created_at,
              proposed: 1,
              people: [],
              expired: true,
            },
          },
        },
      ],
    ]);
    expect(made).toHaveLength(1);
    // Five waiting: nothing more until a person reviews one.
    const full = platform({ open: Array.from({ length: 5 }, () => list([])) });
    expect(text(await full.call())).toMatch(/5 shortlists are waiting/);
    expect(full.made).toEqual([]);
  });

  it("empties one closed by hand with people still in it, and does so even with finding off", async () => {
    const ticked = { ...list([maya], ago(20)), is_done: true } as Activity;
    const reviewed = { ...list([], ago(30)), is_done: true } as Activity;
    const off = platform({ recent: [ticked, reviewed], basis: "" });
    expect(text(await off.call())).toMatch(/Settings → Connectors/);
    expect(
      off.patched.map(([id, body]) => [id, (body.metadata as Activity["metadata"])?.shortlist]),
    ).toEqual([[ticked.id, expect.objectContaining({ people: [], expired: true })]]);
  });

  it("stops at 200 proposed a day, counting shortlists already reviewed", async () => {
    const recent = [
      { ...list([], ago(0.5), { proposed: 150 }), is_done: true },
      list([], ago(0.2), { proposed: 49 }),
      // Before the last 24 hours: not counted.
      list([], ago(1.5), { proposed: 100 }),
    ];
    const { call, made } = platform({ recent });
    const out = await call({ people: [maya, { ...maya, handle: "ola_k" }] });
    expect(out).toMatchObject({
      shortlisted: 1,
      refused: { "The platform's limit of 200 students found a day is reached.": 1 },
    });
    const none = platform({ recent: [list([], ago(0.5), { proposed: 200 })] });
    expect(text(await none.call())).toMatch(/Nothing saved: nobody could be kept/);
    expect(none.made).toEqual([]);
    expect(made).toHaveLength(1);
  });
});

describe("shortlist_found_students on X and YouTube", () => {
  it("takes each by the channel's own handle, and keeps a YouTube comment's link", async () => {
    const { call, made } = platform();
    const out = await call({
      people: [
        { ...maya, platform: "x", handle: "@Maya_P" },
        {
          ...maya,
          platform: "youtube",
          handle: "@maya.p",
          post_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgxKREWq&si=track",
        },
        // A hyphen is no part of a handle on X.
        { ...maya, platform: "x", handle: "maya-p" },
      ],
    });
    expect(out).toMatchObject({
      shortlisted: 2,
      refused: { "The handle is not a handle on X.": 1 },
    });
    const people = (made[0].metadata as { shortlist: { people: object[] } }).shortlist.people;
    expect(people).toEqual([
      expect.objectContaining({ platform: "x", handle: "maya_p" }),
      expect.objectContaining({
        platform: "youtube",
        handle: "maya.p",
        post_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgxKREWq",
      }),
    ]);
  });
});

describe("people a person passed over", () => {
  const passedOn = (days: number, passed: string[]) => {
    const a = list([], ago(days));
    return { ...a, is_done: true, metadata: { ...a.metadata, passed } } as Activity;
  };

  it("are left out of new shortlists for 90 days, by their handle alone", async () => {
    const { call, made } = platform({ recent: [passedOn(10, ["reddit:maya_p"])] });
    const out = await call({ people: [maya, { ...maya, handle: "ola_k", name: "Ola" }] });
    expect(out).toMatchObject({ shortlisted: 1, passed_over_recently: 1 });
    const people = (made[0].metadata as { shortlist: { people: { handle: string }[] } }).shortlist
      .people;
    expect(people.map((p) => p.handle)).toEqual(["ola_k"]);
  });

  it("are forgotten after 90 days: the handles go and they may be proposed again", async () => {
    const old = passedOn(91, ["reddit:maya_p"]);
    const { call, patched } = platform({ recent: [old] });
    expect(await call()).toMatchObject({ shortlisted: 1, passed_over_recently: 0 });
    expect(patched).toEqual([[old.id, { metadata: { other: 1, shortlist: expect.any(Object) } }]]);
  });
});

describe("enrich_found_prospect", () => {
  const enrich = RECRUIT_TOOLS.find((t) => t.name === "enrich_found_prospect")!;
  const FOUND = {
    platform: "reddit",
    handle: "maya_p",
    said: "Starting my nursing prerequisites this fall.",
    source: "r/nursing",
    basis: "b",
    at: ago(3),
  };
  const student = (extra: Partial<Person> = {}) =>
    ({
      id: "p1",
      name: "Maya Park",
      active: true,
      job_title: "",
      owner: 7,
      metadata: { city: "Columbus", found: FOUND },
      ...extra,
    }) as unknown as Person;

  function setup(person: Person, basis = "They posted in public that they want to study nursing.") {
    const patches: object[] = [];
    const updates: object[] = [];
    const notes: Record<string, unknown>[] = [];
    const crm = {
      getPerson: async () => person,
      patchMetadata: async (_kind: string, _id: string, patch: object) => void patches.push(patch),
      updatePerson: async (_id: string, body: object) => void updates.push(body),
      createActivity: async (body: Record<string, unknown>) => void notes.push(body),
    };
    const ctx = {
      org: "northfield",
      crm,
      appUrl: "",
      now: () => NOW,
      settings: { foundBasis: basis },
    } as unknown as ToolContext;
    const call = (args: object) =>
      enrich.handler({ prospect_id: "p1", ...args }, ctx) as Promise<Record<string, unknown>>;
    return { call, patches, updates, notes };
  }

  it("saves what the profile shows over an earlier read, and fills only the empty fields", async () => {
    const { call, patches, updates, notes } = setup(student());
    const out = await call({
      bio: "Pre-nursing, class of 2027",
      city: "Dayton",
      state: "OH",
      program: "Nursing",
      website: "https://linktr.ee/maya?utm_source=ig",
      interests: ["anatomy"],
      posts: [
        {
          said: "Got into A&P!",
          post_url: "https://www.reddit.com/r/nursing/comments/abc/x/?share_id=1",
        },
      ],
    });
    expect(out).toEqual({
      enriched: true,
      added: ["bio", "city", "state", "program", "website", "interests", "posts"],
      filled_where_empty: ["state", "program"],
    });
    expect(patches).toEqual([
      {
        found: {
          profile: {
            bio: "Pre-nursing, class of 2027",
            website: "https://linktr.ee/maya",
            city: "Dayton",
            state: "OH",
            // What this read did not find is cleared, not left from an older one.
            school: null,
            program: "Nursing",
            graduation_year: null,
            interests: ["anatomy"],
            posts: [
              {
                said: "Got into A&P!",
                post_url: "https://www.reddit.com/r/nursing/comments/abc/x/",
              },
            ],
            at: NOW.toISOString(),
          },
        },
        state: "OH",
      },
    ]);
    expect(updates).toEqual([{ job_title: "Nursing" }]);
    expect(notes).toEqual([
      expect.objectContaining({
        type: "note",
        title: "Read their public Reddit profile",
        person: "p1",
        owner: 7,
        is_done: true,
      }),
    ]);
  });

  it("saves nothing for anyone whose profile may not be read", async () => {
    const cases: [Person, string, RegExp][] = [
      [student(), "", /Settings → Connectors/],
      [student({ active: false }), "basis written down", /retired by a merge/],
      [
        student({ metadata: { found: { source: "a list", basis: "b", at: ago(1) } } }),
        "basis written down",
        /only from that channel/,
      ],
      [
        student({ metadata: { opted_out: true, found: FOUND } }),
        "basis written down",
        /nothing more is gathered/,
      ],
    ];
    for (const [person, basis, why] of cases) {
      const { call, patches, notes } = setup(person, basis);
      expect(text(await call({ bio: "x" }))).toMatch(why);
      expect([...patches, ...notes]).toEqual([]);
    }
  });

  it("refuses a link that is not theirs to give, and a read with nothing in it", async () => {
    const { call, patches } = setup(student());
    expect(text(await call({ website: "http://linktr.ee/maya" }))).toMatch(/not an https link/);
    expect(
      text(await call({ posts: [{ said: "hi", post_url: "https://evil.example/r/nursing" }] })),
    ).toMatch(/not an https link on Reddit/);
    expect(text(await call({}))).toMatch(/Nothing was read/);
    expect(patches).toEqual([]);
  });
});
