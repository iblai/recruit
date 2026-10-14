import { describe, expect, it } from "vitest";
import { McpServer, bearerToken, textResult, tokensEqual, validateArgs } from "../lib/mcp/protocol";
import { RECRUIT_TOOLS, createRecruitServer, type ToolContext } from "../lib/mcp/tools";

type Ctx = { calls: string[] };

function server() {
  const s = new McpServer<Ctx>({ name: "t", version: "1.0.0" });
  s.tool({
    name: "echo",
    description: "Echo back",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, n: { type: "integer" } },
      required: ["text"],
    },
    handler: async (args, ctx) => {
      ctx.calls.push(String(args.text));
      return { echoed: args.text };
    },
  });
  s.tool({
    name: "boom",
    description: "Throws",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      throw new Error("kaboom");
    },
  });
  return s;
}

const post = (body: unknown, token = "secret-token-1234") =>
  new Request("http://localhost/api/mcp/org", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
const auth = (req: Request) => tokensEqual(bearerToken(req), "secret-token-1234");

describe("McpServer over Streamable HTTP", () => {
  it("initializes with a negotiated protocol version", async () => {
    const res = await server().handleHttp(
      post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      }),
      { calls: [] },
      auth,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { protocolVersion: string; capabilities: unknown; serverInfo: { name: string } };
    };
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo.name).toBe("t");
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("lists tools and calls one", async () => {
    const s = server();
    const ctx = { calls: [] as string[] };
    const list = (await (
      await s.handleHttp(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }), ctx, auth)
    ).json()) as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual(["echo", "boom"]);
    const call = (await (
      await s.handleHttp(
        post({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "echo", arguments: { text: "hi" } },
        }),
        ctx,
        auth,
      )
    ).json()) as {
      result: { content: { text: string }[]; structuredContent: unknown; isError?: boolean };
    };
    expect(call.result.isError).toBeUndefined();
    expect(JSON.parse(call.result.content[0].text)).toEqual({ echoed: "hi" });
    expect(call.result.structuredContent).toEqual({ echoed: "hi" });
    expect(ctx.calls).toEqual(["hi"]);
  });

  it("returns tool errors as isError results, not JSON-RPC errors", async () => {
    const s = server();
    const bad = (await (
      await s.handleHttp(
        post({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "echo", arguments: { n: "x" } },
        }),
        { calls: [] },
        auth,
      )
    ).json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/"text" is required|"n" must be/);
    const thrown = (await (
      await s.handleHttp(
        post({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "boom", arguments: {} },
        }),
        { calls: [] },
        auth,
      )
    ).json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(thrown.result.isError).toBe(true);
    expect(thrown.result.content[0].text).toBe("kaboom");
  });

  it("answers unknown methods, notifications, batches and bad JSON", async () => {
    const s = server();
    const unknown = (await (
      await s.handleHttp(post({ jsonrpc: "2.0", id: 6, method: "nope" }), { calls: [] }, auth)
    ).json()) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
    const notif = await s.handleHttp(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
      { calls: [] },
      auth,
    );
    expect(notif.status).toBe(202);
    const batch = (await (
      await s.handleHttp(
        post([
          { jsonrpc: "2.0", id: 7, method: "ping" },
          { jsonrpc: "2.0", method: "notifications/x" },
        ]),
        { calls: [] },
        auth,
      )
    ).json()) as unknown[];
    expect(batch).toHaveLength(1);
    const garbage = new Request("http://localhost/x", {
      method: "POST",
      headers: { authorization: "Bearer secret-token-1234" },
      body: "{",
    });
    expect((await s.handleHttp(garbage, { calls: [] }, auth)).status).toBe(400);
  });

  it("refuses without the bearer secret and declines GET", async () => {
    const s = server();
    expect(
      (
        await s.handleHttp(
          post({ jsonrpc: "2.0", id: 1, method: "ping" }, "wrong"),
          { calls: [] },
          auth,
        )
      ).status,
    ).toBe(401);
    expect(
      (await s.handleHttp(new Request("http://localhost/x"), { calls: [] }, auth)).status,
    ).toBe(405);
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("", "")).toBe(false);
  });
});

describe("validateArgs", () => {
  const schema = {
    type: "object",
    properties: { a: { type: "string", enum: ["x", "y"] }, b: { type: ["integer", "null"] } },
    required: ["a"],
  };
  it("checks required, types, enums and unions", () => {
    expect(validateArgs(schema, {})).toMatch(/"a" is required/);
    expect(validateArgs(schema, { a: "z" })).toMatch(/one of x, y/);
    expect(validateArgs(schema, { a: "x", b: 1.5 })).toMatch(/"b" must be/);
    expect(validateArgs(schema, { a: "x", b: null })).toBeNull();
    expect(validateArgs(schema, { a: "x", b: 2 })).toBeNull();
    expect(validateArgs(schema, [])).toMatch(/object/);
  });
  it("wraps plain values into text results", () => {
    expect(textResult("hi").content[0].text).toBe("hi");
    expect(textResult({ a: 1 }).structuredContent).toEqual({ a: 1 });
  });
});

describe("recruitment tools", () => {
  it("every tool has a unique name, a description, an object schema and only known required keys", () => {
    const names = new Set<string>();
    for (const t of RECRUIT_TOOLS) {
      expect(names.has(t.name)).toBe(false);
      names.add(t.name);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe("object");
      const props = Object.keys((t.inputSchema.properties as Record<string, unknown>) ?? {});
      for (const r of (t.inputSchema.required as string[] | undefined) ?? [])
        expect(props).toContain(r);
    }
    expect(names.size).toBeGreaterThanOrEqual(20);
    expect(
      createRecruitServer()
        .listTools()
        .map((t) => t.name),
    ).toEqual([...names]);
  });

  it("daily_brief computes due / overdue / stale / deadlines from the CRM", async () => {
    const now = new Date("2026-10-12T15:00:00Z");
    const day = 86_400_000;
    const crm = {
      listPipelines: async () => [
        {
          id: 1,
          name: "Admissions",
          code: "admissions",
          is_default: true,
          rotten_days: 14,
          stages: [
            { id: 10, code: "inquiry", name: "Inquiry", sort_order: 0 },
            { id: 11, code: "applied", name: "Applied", sort_order: 1 },
            { id: 12, code: "enrolled", name: "Enrolled", sort_order: 2, is_won: true },
          ],
        },
      ],
      allDeals: async () => [
        {
          id: 1,
          title: "A",
          status: "open",
          stage: 10,
          pipeline: 1,
          person: "p1",
          updated_at: new Date(now.getTime() - 20 * day).toISOString(),
          expected_close_date: "2026-10-20",
          tags: [],
        },
        {
          id: 2,
          title: "B",
          status: "open",
          stage: 11,
          pipeline: 1,
          person: "p2",
          updated_at: now.toISOString(),
          expected_close_date: "2026-12-01",
          tags: [],
        },
      ],
      allActivities: async () => [
        {
          id: 1,
          type: "task",
          title: "Overdue",
          schedule_from: new Date(now.getTime() - 2 * day).toISOString(),
          is_done: false,
        },
        {
          id: 2,
          type: "call",
          title: "Today",
          schedule_from: new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            10,
          ).toISOString(),
          is_done: false,
        },
        { id: 3, type: "note", title: "Unscheduled", schedule_from: null, is_done: false },
      ],
      listPersons: async () => ({
        count: 3,
        next_page: null,
        previous_page: null,
        results: [
          {
            id: "p1",
            name: "Ada",
            created_at: new Date(now.getTime() - day).toISOString(),
            tags: [],
          },
          {
            id: "p2",
            name: "Bob",
            created_at: new Date(now.getTime() - 30 * day).toISOString(),
            tags: [],
          },
        ],
      }),
    };
    const ctx = {
      org: "o",
      crm,
      appUrl: "https://x",
      readSettings: async () => ({}),
      writeSettings: async () => {},
      now: () => now,
    } as unknown as ToolContext;
    const out = (await RECRUIT_TOOLS.find((t) => t.name === "daily_brief")!.handler(
      {},
      ctx,
    )) as Record<string, unknown>;
    expect(out.open_applications).toBe(2);
    expect(out.new_inquiries_7d).toBe(1);
    expect((out.due_today as unknown[]).length).toBe(1);
    expect((out.overdue as unknown[]).length).toBe(1);
    expect((out.stale_applications as { id: number }[]).map((d) => d.id)).toEqual([1]);
    expect((out.deadlines_next_14_days as { id: number }[]).map((d) => d.id)).toEqual([1]);
    expect(
      (out.funnels as { stages: { count: number }[] }[])[0].stages.map((s) => s.count),
    ).toEqual([1, 1]);
  });

  it("create_landing_page drafts a page into the org settings", async () => {
    let written: Record<string, unknown> | null = null;
    const ctx = {
      org: "northfield",
      crm: {},
      appUrl: "https://recruit.example.edu",
      readSettings: async () => ({ landingPages: [] }),
      writeSettings: async (patch: Record<string, unknown>) => {
        written = patch;
      },
    } as unknown as ToolContext;
    const out = (await RECRUIT_TOOLS.find((t) => t.name === "create_landing_page")!.handler(
      { title: "Fall Open House", term: "Fall 2027" },
      ctx,
    )) as { url: string; published: boolean };
    expect(out.url).toBe("https://recruit.example.edu/p/northfield/fall-open-house");
    expect(out.published).toBe(false);
    expect((written!.landingPages as unknown[]).length).toBe(1);
    const dupe = await RECRUIT_TOOLS.find((t) => t.name === "create_landing_page")!.handler(
      { title: "Fall Open House" },
      { ...ctx, readSettings: async () => written! } as ToolContext,
    );
    expect((dupe as { isError: boolean }).isError).toBe(true);
  });
});
