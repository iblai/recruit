import { describe, expect, it } from "vitest";
import type { Activity, Person } from "../lib/crm/types";
import {
  batchPlan,
  closedShortlist,
  tally,
  uniqueIdTaken,
} from "../components/recruit/needs-you/review";

const draft = (id: number, follow_up: Record<string, unknown>) =>
  ({
    id,
    title: `Subject ${id}`,
    comment: "Hello",
    metadata: { follow_up },
  }) as unknown as Activity;
const person = (over: Partial<Person> = {}) =>
  ({ name: "Ana", primary_email: "ana@example.edu", metadata: {}, ...over }) as Person;

describe("closedShortlist", () => {
  it("keeps the request and counts and nobody's details", () => {
    const list = {
      criteria: "nursing",
      source: "Instagram",
      basis: "public posts",
      at: "2026-11-01",
      proposed: 2,
      people: [{ name: "X" } as never],
    };
    const m = closedShortlist(list, 1, "rei", new Date("2026-11-26T00:00:00Z"));
    expect(m.shortlist.people).toEqual([]);
    expect(m.shortlist).toMatchObject({ kept: 1, proposed: 2, criteria: "nursing" });
    expect(m.shortlist.reviewed).toEqual({ at: "2026-11-26T00:00:00.000Z", by: "rei" });
    expect(JSON.stringify(m)).not.toContain('"X"');
    expect(m).not.toHaveProperty("passed");
  });

  it("keeps the handles of those passed over, and nothing else about them", () => {
    const list = {
      criteria: "nursing",
      source: "Instagram",
      basis: "public posts",
      at: "2026-11-01",
      proposed: 2,
      people: [{ name: "X", said: "hi" } as never],
    };
    const m = closedShortlist(list, 0, "rei", new Date(), ["instagram:x.k"]);
    expect(m.passed).toEqual(["instagram:x.k"]);
    expect(JSON.stringify(m)).not.toMatch(/"X"|"hi"/);
  });
});

describe("batchPlan", () => {
  it("sends only waiting email drafts to someone who may be written to", () => {
    const { go, left } = batchPlan(
      [
        { activity: draft(1, { channel: "email" }), person: person() },
        { activity: draft(2, { channel: "dm" }), person: person() },
        { activity: draft(3, { channel: "email" }), person: person({ primary_email: "" }) },
        {
          activity: draft(4, { channel: "email" }),
          person: person({ metadata: { opted_out: true } }),
        },
        { activity: draft(5, { channel: "email", approved: { at: "x" } }), person: person() },
      ],
      "State U",
    );
    expect(go).toEqual([
      { id: 1, name: "Ana", to: "ana@example.edu", subject: "Subject 1", body: "Hello" },
    ]);
    expect(left.map((l) => l.reason)).toEqual(["notEmail", "noAddress", "optedOut", "approved"]);
  });

  it("adds the found line for someone found", () => {
    const { go } = batchPlan(
      [
        {
          activity: draft(1, { channel: "email" }),
          person: person({ metadata: { found: { source: "a fair list", basis: "b", at: "c" } } }),
        },
      ],
      "State U",
    );
    expect(go[0].body).toMatch(/^Hello\n\nThis message is from State U\. .*a fair list/);
  });
});

describe("tally", () => {
  it("counts sent, not sent and not known", () => {
    const t = tally([
      { id: 1, name: "a", sent: true, detail: "" },
      { id: 2, name: "b", sent: false, detail: "refused" },
      { id: 3, name: "c", sent: null, detail: "" },
    ]);
    expect(t.sent).toBe(1);
    expect(t.failed.map((f) => f.detail)).toEqual(["refused"]);
    expect(t.unknown).toBe(1);
  });
});

describe("uniqueIdTaken", () => {
  it("reads the platform's 400 on unique_id only", () => {
    expect(uniqueIdTaken({ status: 400, data: { unique_id: ["exists"] } })).toBe(true);
    expect(uniqueIdTaken({ status: 400, data: { name: ["bad"] } })).toBe(false);
    expect(uniqueIdTaken({ status: 500 })).toBe(false);
  });
});
