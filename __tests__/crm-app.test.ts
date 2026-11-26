import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "../lib/crm/types";
import { syncCrmCopy } from "../lib/recruit/crm-app";

type Row = Record<string, unknown>;

/** The CRM app's records behind a stubbed fetch, as the platform answers with no `app`. */
function crmApp({ people = [] as Row[], tags = [] as Row[], notes = [] as Row[], app = "" } = {}) {
  const calls: { method: string; url: string; body?: Row }[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let nextTag = 100;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as Row) : undefined;
    calls.push({ method, url, ...(body && { body }) });
    const [where, query = ""] = url.split("?");
    const path = where.replace(/^.*\/dm\/api\/crm/, "");
    const q = new URLSearchParams(query);
    if (method === "GET" && path === "/persons/") {
      // A substring match, as the platform's `search` is, a hundred to a page.
      const hits = people.filter((p) => String(p.unique_id).includes(q.get("search") ?? ""));
      const page = Number(q.get("page") ?? 1);
      return json(200, {
        results: hits.slice((page - 1) * 100, page * 100),
        next_page: hits.length > page * 100 ? page + 1 : null,
      });
    }
    if (method === "POST" && path === "/persons/") {
      const p = { id: "c1", app, tags: [], ...body };
      people.push(p);
      return json(201, p);
    }
    if (method === "GET" && path === "/tags/")
      return json(200, {
        results: tags.filter(
          (t) => String(t.name).toLowerCase() === (q.get("name__iexact") ?? "").toLowerCase(),
        ),
      });
    if (method === "POST" && path === "/tags/") {
      const t = { id: nextTag++, app, ...body };
      tags.push(t);
      return json(201, t);
    }
    if (method === "POST" && /^\/persons\/[^/]+\/tags\/$/.test(path)) return json(201, {});
    if (method === "GET" && path === "/activities/")
      return json(200, { results: notes.filter((n) => n.person === q.get("person")) });
    if (method === "POST" && path === "/activities/") return json(201, { id: 9, ...body });
    throw new Error(`unexpected ${method} ${url}`);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const FOUND = {
  platform: "reddit",
  handle: "maya_p",
  said: "Starting my nursing prerequisites this fall.",
  source: "r/nursing",
  basis: "b",
  at: "2027-03-01T00:00:00Z",
};
const kept = (metadata: Row = {}, extra: Row = {}) =>
  ({
    id: "r1",
    name: "Maya Park",
    unique_id: "reddit:maya_p",
    job_title: "Nursing",
    active: true,
    tags: [],
    metadata: { found: FOUND, ...metadata },
    ...extra,
  }) as unknown as Person;
const writes = <T extends { method: string }>(calls: T[]) =>
  calls.filter((c) => c.method !== "GET");
const where = (c: { url: string }) => c.url.replace(/^.*\/dm\/api\/crm/, "");
const NOTE = {
  type: "note",
  title: "Found on Reddit",
  comment:
    "Found on Reddit by Recruit: “Starting my nursing prerequisites this fall.”\nhttps://www.reddit.com/user/maya_p/",
  is_done: true,
  metadata: { recruit_found: true },
};

describe("syncCrmCopy", () => {
  it("files a kept student in the CRM app's records, tagged with the channel and a note, naming no app", async () => {
    const calls = crmApp();
    expect(await syncCrmCopy("Token t", kept(), true)).toEqual({ copy: "added", stopped: false });
    expect(calls.every((c) => !/[?&]app=/.test(c.url))).toBe(true);
    expect(writes(calls).map((c) => [c.method, where(c), c.body])).toEqual([
      [
        "POST",
        "/persons/",
        {
          name: "Maya Park",
          unique_id: "reddit:maya_p",
          job_title: "Nursing",
          lifecycle_stage: "lead",
          metadata: { found: FOUND },
        },
      ],
      ["POST", "/tags/", { name: "Found on Reddit", color: "#6b7280" }],
      ["POST", "/persons/c1/tags/", { tag_id: 100 }],
      ["POST", "/activities/", { ...NOTE, person: "c1" }],
    ]);
  });

  it("finds the copy by the handle, not by the record's editable id, and a pick finishes a half-made one", async () => {
    const calls = crmApp({
      people: [
        { id: "c9", app: "", unique_id: "reddit:maya_pa", tags: [] },
        { id: "c2", app: "", unique_id: "reddit:maya_p", tags: [] },
      ],
      tags: [{ id: 7, app: "", name: "Found on Reddit" }],
    });
    // A counselor typed an SIS id into "External id".
    const edited = kept({}, { unique_id: "SIS-1234" });
    expect(await syncCrmCopy("Token t", edited, true)).toEqual({ copy: "on_file", stopped: false });
    expect(writes(calls).map((c) => [where(c), c.body])).toEqual([
      ["/persons/c2/tags/", { tag_id: 7 }],
      ["/activities/", { ...NOTE, person: "c2" }],
    ]);
    // The note is there now: another pick attaches the tag again (a 409 is fine), and no second note.
    const again = crmApp({
      people: [{ id: "c2", app: "", unique_id: "reddit:maya_p", tags: [] }],
      tags: [{ id: 7, app: "", name: "Found on Reddit" }],
      notes: [{ person: "c2" }],
    });
    await syncCrmCopy("Token t", kept(), true);
    expect(writes(again).map(where)).toEqual(["/persons/c2/tags/"]);
  });

  it("walks the pages of substring hits to find the copy", async () => {
    const decoys = Array.from({ length: 120 }, (_, i) => ({
      id: `d${i}`,
      app: "",
      unique_id: `reddit:maya_p${i}`,
      tags: [],
    }));
    const calls = crmApp({
      people: [...decoys, { id: "c2", app: "", unique_id: "reddit:maya_p", tags: [] }],
    });
    expect(await syncCrmCopy("Token t", kept({ opted_out: true }))).toEqual({
      copy: "on_file",
      stopped: true,
    });
    expect(writes(calls).map(where)).toEqual(["/tags/", "/persons/c2/tags/"]);
  });

  it("marks the copy Do not contact once they said stop, and never takes the mark off", async () => {
    const copy = { id: "c2", app: "", unique_id: "reddit:maya_p", tags: [] as Row[] };
    const stop = crmApp({ people: [copy] });
    expect(await syncCrmCopy("Token t", kept({ opted_out: true }))).toEqual({
      copy: "on_file",
      stopped: true,
    });
    expect(writes(stop).map((c) => [where(c), c.body])).toEqual([
      ["/tags/", { name: "Do not contact", color: "#6b7280" }],
      ["/persons/c2/tags/", { tag_id: 100 }],
    ]);
    // Marked there, by Recruit or by the CRM app's own staff: Recruit leaves it, and says so.
    const tag = { id: 100, app: "", name: "Do not contact" };
    const after = crmApp({ people: [{ ...copy, tags: [tag] }], tags: [tag] });
    expect(await syncCrmCopy("Token t", kept())).toEqual({ copy: "on_file", stopped: true });
    expect(writes(after)).toEqual([]);
  });

  it("makes no copy outside a pick, nor for someone who asked not to be contacted, and skips anyone not found on a channel", async () => {
    const calls = crmApp();
    expect(await syncCrmCopy("Token t", kept())).toEqual({ copy: "none", stopped: false });
    expect(await syncCrmCopy("Token t", kept({ opted_out: true }), true)).toEqual({
      copy: "none",
      stopped: true,
    });
    const listed = { ...kept(), metadata: { found: { source: "a list", basis: "b", at: "t" } } };
    expect(await syncCrmCopy("Token t", listed as Person, true)).toEqual({
      copy: "none",
      stopped: false,
    });
    expect(writes(calls)).toEqual([]);
  });

  it("refuses to write where the platform does not keep the CRM app's records apart", async () => {
    const calls = crmApp({ people: [{ id: "x", app: "recruit", unique_id: "reddit:maya_p" }] });
    await expect(syncCrmCopy("Token t", kept(), true)).rejects.toMatchObject({ status: 503 });
    expect(writes(calls)).toEqual([]);
    const older = crmApp({ app: "recruit" });
    await expect(syncCrmCopy("Token t", kept(), true)).rejects.toMatchObject({ status: 503 });
    // The one write before the platform showed itself: nothing is tagged or noted after it.
    expect(writes(older).map((c) => c.method)).toEqual(["POST"]);
  });
});
