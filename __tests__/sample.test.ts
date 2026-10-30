import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMISSIONS_STAGES } from "../lib/recruit/admissions";
import { DEMO_PROSPECTS, demoLandingPage, lifecycleFor } from "../lib/recruit/demo-data";
import { buildSample, sampleMembers } from "../lib/recruit/sample/data";
import { sampleSession, sampleVisitor } from "../lib/recruit/sample/mode";
import { NOT_FOUND, sampleOf, sampleResponse } from "../lib/recruit/sample/respond";

const now = new Date("2026-10-15T12:00:00Z");
const visitor = { id: 42, username: "jane", name: "Jane Doe" };
const env = { now, visitor };
type Page = {
  count: number;
  next_page: number | null;
  previous_page: number | null;
  results: Record<string, unknown>[];
};
const get = (url: string, params?: Record<string, unknown>) =>
  sampleResponse("GET", url, params, env);
const page = (url: string, params?: Record<string, unknown>) => get(url, params) as Page;
const s = sampleOf(now, visitor);

describe("the demo workspace", () => {
  it("maps each admissions stage to the CRM lifecycle the seed writes", () => {
    expect(
      ["inquiry", "engaged", "applied", "admitted", "deposited", "enrolled", "withdrawn"].map(
        lifecycleFor,
      ),
    ).toEqual([
      "lead",
      "qualified",
      "opportunity",
      "opportunity",
      "opportunity",
      "customer",
      "churned",
    ]);
    expect(demoLandingPage("Spring 2028")).toMatchObject({
      slug: "request-information",
      term: "Spring 2028",
      published: true,
    });
  });
});

describe("recruit's sample", () => {
  it("is deterministic for a day and a visitor, and every record is recruit's", () => {
    expect(JSON.stringify(buildSample(now, visitor))).toBe(
      JSON.stringify(buildSample(now, visitor)),
    );
    expect(sampleOf(now, visitor)).toBe(s);
    expect(sampleMembers({ id: 7, username: "x" })[0]).toMatchObject({ id: 7, name: "x" });
    const records = [
      ...s.prospects,
      ...s.schools,
      ...s.applications,
      ...s.activities,
      ...s.tags,
      ...s.sources,
      ...s.forms,
      s.pipeline,
    ];
    expect(records.every((r) => r.app === "recruit")).toBe(true);
  });

  it("is the seed's workspace: one application per prospect, a stage each, enrolled won and withdrawn lost", () => {
    expect(s.prospects).toHaveLength(DEMO_PROSPECTS.length);
    expect(s.applications).toHaveLength(DEMO_PROSPECTS.length);
    expect(s.pipeline.stages.map((st) => st.code)).toEqual(ADMISSIONS_STAGES.map((st) => st.code));
    expect(s.applications.find((d) => d.person_name === "Noah Williams")).toMatchObject({
      status: "won",
    });
    expect(s.applications.find((d) => d.person_name === "Jamal Robinson")).toMatchObject({
      status: "lost",
      lost_reason: "Chose another institution",
    });
    expect(
      s.applications.filter((d) => d.status === "open").every((d) => d.closed_at === null),
    ).toBe(true);
    expect(s.activities.filter((a) => !a.is_done)).toHaveLength(6);
    expect(s.submissions.length).toBeGreaterThan(0);
    expect(s.prospects.some((p) => p.owner === 42)).toBe(true);
  });
});

describe("sampleResponse", () => {
  it("pages, orders, searches and filters prospects", () => {
    expect(page("/persons/", { page_size: 5 })).toMatchObject({
      count: 12,
      next_page: 2,
      previous_page: null,
    });
    expect(page("/persons/", { page: 3, page_size: 5 })).toMatchObject({
      next_page: null,
      previous_page: 2,
    });
    const names = page("/persons/", { ordering: "name", page_size: 50 }).results.map((r) =>
      String(r.name),
    );
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(page("/persons/", { search: "ada lovelace" }).count).toBe(1);
    expect(
      page("/persons/", { lifecycle_stage: "opportunity", page_size: 50 }).results.every(
        (r) => r.lifecycle_stage === "opportunity",
      ),
    ).toBe(true);
    expect(page("/persons/", { tags: "1", page_size: 50 }).count).toBe(
      page("/persons/", { tags: "honors", page_size: 50 }).count,
    );
    expect(
      page("/persons/", { owner: 42, page_size: 50 }).results.every((r) => r.owner === 42),
    ).toBe(true);
    expect(
      page("/persons/", { created_at__gte: "2026-10-01", page_size: 50 }).results.every(
        (r) => String(r.created_at) >= "2026-10-01",
      ),
    ).toBe(true);
    expect(
      page("/persons/", { created_at__lte: "2026-09-10", page_size: 50 }).count,
    ).toBeGreaterThan(0);
    expect(
      page("/persons/", { organization: s.schools[1].id, page_size: 50 }).results.every(
        (r) => r.organization === s.schools[1].id,
      ),
    ).toBe(true);
  });

  it("lists schools, applications, activities, tags, the funnel, its stages and sources", () => {
    expect(page("/organizations/", { name: "lincoln" }).count).toBe(1);
    expect(page("/organizations/", { search: "chicago" }).count).toBe(1);
    expect(
      page("/deals/", { status: "open", pipeline: 2, page_size: 100 }).results.every(
        (r) => r.status === "open",
      ),
    ).toBe(true);
    expect(page("/deals/", { search: "nursing" }).count).toBe(1);
    expect(
      page("/deals/", { expected_close_date__lte: "2026-11-15", page_size: 100 }).count,
    ).toBeGreaterThan(0);
    const mine = page("/activities/", { owner: 42, is_done: false, page_size: 100 });
    expect(mine.results.every((r) => r.owner === 42 && r.is_done === false)).toBe(true);
    expect(page("/activities/", { type: "lunch" }).results.every((r) => r.type === "lunch")).toBe(
      true,
    );
    expect(page("/activities/", { search: "campus" }).count).toBeGreaterThan(0);
    expect(
      page("/activities/", {
        schedule_from__gte: "2026-10-15",
        schedule_from__lte: "2026-10-15T23:59:59Z",
      }).count,
    ).toBeGreaterThan(0);
    expect(page("/tags/", { page_size: 100 }).count).toBe(5);
    expect(page("/tags/", { name: "first" }).count).toBe(1);
    expect(page("/tags/", { search: "legacy" }).count).toBe(1);
    expect(page("/pipelines/", { page_size: 100 }).results[0]).toMatchObject({
      code: "admissions",
      is_default: true,
    });
    expect(page("/pipelines/", { code: "sales" }).count).toBe(0);
    expect(page("/pipelines/", { search: "admissions" }).count).toBe(1);
    expect(page("/pipelines/2/stages/", { page_size: 100 }).count).toBe(7);
    expect(page("/lead-sources/", { page_size: 100 }).count).toBe(6);
    expect(page("/lead-sources/", { search: "fair" }).count).toBe(1);
    expect(page("/members/", { page: 1, page_size: 100 })).toMatchObject({
      count: 4,
      next_page: null,
    });
  });

  it("answers a record by id and says not found for any other", () => {
    expect(get(`/persons/${s.prospects[0].id}/`)).toBe(s.prospects[0]);
    expect(get(`/organizations/${s.schools[0].id}/`)).toBe(s.schools[0]);
    expect(get("/deals/301/")).toMatchObject({ id: 301 });
    expect(get("/activities/401/")).toMatchObject({ id: 401 });
    expect(get("/pipelines/2/")).toBe(s.pipeline);
    for (const url of [
      "/persons/nope/",
      "/organizations/nope/",
      "/deals/1/",
      "/activities/1/",
      "/pipelines/1/",
      "/pipelines/1/stages/",
      "/web-forms/nope/",
      "/web-forms/nope/submissions/",
      "/favorites/",
    ]) {
      expect(get(url)).toBe(NOT_FOUND);
    }
  });

  it("serves the landing page and its submissions", () => {
    expect(page("/web-forms/", { page_size: 100 }).results[0]).toMatchObject({
      slug: "request-information",
      is_published: true,
      app: "recruit",
    });
    expect(get("/web-forms/request-information/")).toMatchObject({ name: "Request information" });
    expect(page("/web-forms/request-information/submissions/", { page_size: 1 }).count).toBe(
      s.submissions.length,
    );
  });

  it("derives the overview, scoped to recruit, and finds records by search", () => {
    const o = get("/overview/") as Record<string, any>;
    expect(o.app).toBe("recruit");
    expect(o.persons.count).toBe(12);
    expect(o.deals.open_count).toBe(10);
    expect(o.deals.by_stage).toHaveLength(7);
    expect(o.deals.won_this_month_count + o.deals.lost_this_month_count).toBe(2);
    expect(o.deals.won_lost_by_month.at(-1).month).toBe("2026-10");
    expect(o.activities.overdue).toBe(2);
    expect(o.activities.due_today).toBe(1);
    expect((get("/overview/", { pipeline: 9 }) as Record<string, any>).deals.open_count).toBe(0);
    const hits = get("/search/", { q: "lincoln", limit: 3 }) as Record<string, { app: string }[]>;
    expect(hits.organizations).toHaveLength(1);
    expect(hits.persons).toEqual([]);
    expect((get("/search/", { q: "ada" }) as Record<string, unknown[]>).persons).toHaveLength(1);
    expect((get("/search/", { q: "nursing" }) as Record<string, unknown[]>).deals).toHaveLength(1);
    expect(
      [...hits.persons, ...hits.organizations, ...hits.deals].every((r) => r.app === "recruit"),
    ).toBe(true);
  });

  it("is no answer for anything but a read, which the seam turns into the upgrade dialog", () => {
    for (const method of ["POST", "PATCH", "DELETE"])
      expect(sampleResponse(method, "/persons/", undefined, env)).toBeUndefined();
  });
});

describe("sampleSession and sampleVisitor", () => {
  const store = (entries: Record<string, string>) => {
    const ls = {
      getItem: (k: string) => entries[k] ?? null,
      setItem: () => {},
      removeItem: () => {},
    };
    vi.stubGlobal("window", { localStorage: ls });
    vi.stubGlobal("localStorage", ls);
  };
  afterEach(() => vi.unstubAllGlobals());

  it("browses the sample on the community organization, for everyone", () => {
    store({
      tenants: JSON.stringify([{ key: "main", is_admin: false }]),
      current_tenant: JSON.stringify({ key: "main" }),
    });
    expect(sampleSession("/platform/main/prospects")).toBe(true);
    expect(sampleSession("/platform/acme/prospects")).toBe(false);
    expect(sampleSession("/")).toBe(true);
    store({ tenants: JSON.stringify([{ key: "main", is_admin: true }]) });
    expect(sampleSession("/platform/main")).toBe(true);
  });

  it("names the visitor from the session, with stand-ins when it says nothing", () => {
    store({
      userData: JSON.stringify({ user_id: 5, user_nicename: "sam", user_fullname: "Sam Lee" }),
    });
    expect(sampleVisitor()).toEqual({ id: 5, username: "sam", name: "Sam Lee" });
    store({});
    expect(sampleVisitor()).toMatchObject({ id: 9101, username: "you" });
  });
});
