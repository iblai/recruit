import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmServer } from "../lib/recruit/crm-server";
import { toAuthorization } from "../scripts/_env";

type Call = { method: string; path: string; auth: string; body: unknown };

/** A fake platform: `answer(path)` returns the list rows for a GET. */
function fakePlatform(answer: (path: string) => unknown[] = () => []) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const { pathname, search } = new URL(url);
    const path = decodeURIComponent((pathname + search).replace(/\+/g, " "));
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const auth = (init.headers as Record<string, string>).Authorization;
    calls.push({ method, path, auth, body });
    const rows = method === "GET" ? answer(path) : [];
    const data =
      method === "GET"
        ? { count: rows.length, next_page: null, previous_page: null, results: rows }
        : { id: "new", ...(body as object) };
    return new Response(JSON.stringify(data), { status: method === "POST" ? 201 : 200 });
  });
  return calls;
}

const crm = () => new CrmServer("northfield", "Api-Token k");

afterEach(() => vi.unstubAllGlobals());

describe("CrmServer lookups", () => {
  it("finds a person by exact email, and never trusts an ignored filter", async () => {
    const calls = fakePlatform((path) =>
      path.includes("primary_email=ada@example.edu")
        ? [{ id: "p1", primary_email: "Ada@Example.edu" }]
        : [{ id: "p9", primary_email: "someone@else.edu" }],
    );
    expect((await crm().findPersonByEmail(" ADA@example.edu "))?.id).toBe("p1");
    expect(calls[0].path).toBe("/dm/api/crm/persons/?primary_email=ada@example.edu&page_size=5");
    // A platform without the filter returns its first rows instead.
    expect(await crm().findPersonByEmail("bob@example.edu")).toBeUndefined();
  });

  it("finds schools and tags by exact name before creating one", async () => {
    const calls = fakePlatform((path) =>
      path.includes("name__iexact=Lincoln High") ? [{ id: "o1", name: "lincoln high" }] : [],
    );
    expect((await crm().findOrCreateOrganization("Lincoln High")).id).toBe("o1");
    await crm().findOrCreateTag(" Honors ");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /dm/api/crm/organizations/?name__iexact=Lincoln High&page_size=5",
      "GET /dm/api/crm/tags/?name__iexact=Honors&page_size=5",
      "POST /dm/api/crm/tags/",
    ]);
    expect(calls[2].body).toEqual({ name: "Honors", color: "#0058cc" });
  });

  it("resolves a funnel by code, then the default", async () => {
    const calls = fakePlatform((path) =>
      path.includes("is_default=true") ? [{ id: 2, code: "default", is_default: true }] : [],
    );
    expect((await crm().resolvePipeline("gone"))?.id).toBe(2);
    expect(calls.map((c) => c.path)).toEqual([
      "/dm/api/crm/pipelines/?code=gone&page_size=5",
      "/dm/api/crm/pipelines/?is_default=true&page_size=5",
    ]);
  });

  it("merges metadata, lists members and counts submissions on the CRM", async () => {
    const calls = fakePlatform(() => [{ id: 3, username: "kim" }]);
    await crm().patchMetadata("deals", 7, { term: null });
    await crm().listMembers("kim");
    await crm().countWebFormSubmissions("open-house");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PATCH /dm/api/crm/deals/7/metadata/",
      "GET /dm/api/crm/members/?query=kim&page=1&page_size=100",
      "GET /dm/api/crm/web-forms/open-house/submissions/?page_size=1",
    ]);
    expect(calls[0].body).toEqual({ term: null });
    expect(calls.every((c) => c.auth === "Api-Token k")).toBe(true);
  });
});

describe("the CLI credential", () => {
  it("takes a Platform API key or a session token, nothing else", () => {
    expect(toAuthorization(" abc123 ")).toBe("Api-Token abc123");
    expect(toAuthorization("Token  abc123")).toBe("Token abc123");
    expect(toAuthorization("Api-Token abc123")).toBe("Api-Token abc123");
    expect(toAuthorization("")).toBe("");
    expect(toAuthorization("two words")).toBe("");
  });
});
