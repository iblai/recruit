import { describe, expect, it } from "vitest";
import type { Activity, CrmOverviewStage, Person } from "../lib/crm/types";
import {
  chatter,
  lastDays,
  lostFrom,
  medianSeconds,
  outsideOfficeHours,
  reached,
  STAGE_CHANGED,
  windows,
} from "../lib/recruit/scoreboard";

const stage = (code: string, sort_order: number, count: number, extra = {}): CrmOverviewStage =>
  ({
    stage: { id: sort_order, code, name: code, sort_order, ...extra },
    count,
  }) as CrmOverviewStage;

// Out of order on purpose: the platform's order is not promised.
const funnel = [
  stage("deposited", 5, 2),
  stage("inquiry", 1, 40),
  stage("applied", 3, 9),
  stage("withdrawn", 7, 3, { is_lost: true }),
  stage("engaged", 2, 5),
  stage("admitted", 4, 4),
  stage("enrolled", 6, 1, { is_won: true }),
];

const move = (comment: string, title = STAGE_CHANGED) => ({ title, comment });
// Stage names are the codes here; the notes name stages, not codes.
const notes = [
  move("inquiry → applied"), // reaches applied
  move("engaged → admitted"), // skips past applied
  move("applied → admitted"), // already past applied
  move("admitted → deposited"), // a deposit
  move("inquiry → enrolled"), // past both
  move("applied → withdrawn"), // withdrawn before a deposit
  move("deposited → withdrawn"), // melt
  move("enrolled → withdrawn"), // melt
  move("inquiry → applied", "Call"), // not the platform's note
  move("inquiry → Somewhere"), // a name the funnel lacks
];

describe("reached", () => {
  it("counts noted moves into a stage or past it, never into withdrawn", () => {
    expect(reached(notes, funnel, "applied")).toBe(3);
    expect(reached(notes, funnel, "deposited")).toBe(2);
  });

  it("is not a zero when the funnel has no such stage", () => {
    expect(reached(notes, funnel, "aid")).toBeNull();
    expect(reached(notes, [], "applied")).toBeNull();
  });
});

describe("lostFrom", () => {
  it("counts withdrawals after a deposit only", () => {
    expect(lostFrom(notes, funnel, "deposited")).toBe(2);
    expect(lostFrom([], funnel, "deposited")).toBe(0);
    expect(lostFrom(notes, [], "deposited")).toBeNull();
  });
});

describe("windows", () => {
  it("is the last 30 days and the same days a year earlier", () => {
    expect(windows(new Date(2027, 2, 15, 12))).toEqual([
      { start_date: "2027-02-14", end_date: "2027-03-15" },
      { start_date: "2026-02-14", end_date: "2026-03-15" },
    ]);
  });
});

describe("outsideOfficeHours", () => {
  // Built from local parts, so the test reads the same in any time zone.
  const at = (day: number, hour: number) => new Date(2027, 1, day, hour, 30).toISOString();

  it("counts evenings, early mornings and weekends", () => {
    expect(
      outsideOfficeHours([
        at(1, 10), // Monday 10:30
        at(1, 16), // Monday 16:30
        at(1, 17), // Monday 17:30
        at(2, 8), // Tuesday 08:30
        at(6, 11), // Saturday
        at(7, 23), // Sunday
        "not a date",
      ]),
    ).toBe(4);
    expect(outsideOfficeHours([])).toBe(0);
  });
});

describe("medianSeconds", () => {
  it("turns the platform's milliseconds into seconds, to a tenth", () => {
    expect(medianSeconds([{ p50_latency: 2340 }])).toBe(2.3);
    expect(medianSeconds([{ p50_latency: 950 }])).toBe(1);
  });

  it("is nothing when the platform sent nothing", () => {
    for (const rows of [undefined, [], [{}], [{ p50_latency: null }], [{ p50_latency: "fast" }]])
      expect(medianSeconds(rows)).toBeNull();
  });
});

describe("lastDays", () => {
  it("is the last n days up to today, both ends whole days", () => {
    expect(lastDays(new Date(2027, 2, 10, 15), 90)).toEqual({
      start_date: "2026-12-11",
      end_date: "2027-03-10",
    });
  });
});

describe("chatter", () => {
  const person = (platform: string, handle: string) =>
    ({
      metadata: { found: { platform, handle, source: "s", basis: "b", at: "t" } },
    }) as unknown as Person;
  const candidate = (platform: string, handle: string) => ({
    name: "N",
    platform,
    handle,
    said: "s",
    why: "w",
  });
  const list = (
    source: string,
    extra: Record<string, unknown>,
    is_done: boolean,
    top: Record<string, unknown> = {},
  ) =>
    ({
      is_done,
      metadata: {
        shortlist: { criteria: "c", source, basis: "b", at: "t", people: [], ...extra },
        ...top,
      },
    }) as unknown as Activity;

  it("counts, per channel, the people kept, passed over and still waiting", () => {
    const shortlists = [
      // Reviewed: two kept (they are people now), one passed over.
      list("r/StudentNurse", { proposed: 3, kept: 2 }, true, { passed: ["reddit:ola_k"] }),
      // Waiting for a person: their channels are still on the list.
      list(
        "#futurenurse",
        { proposed: 2, people: [candidate("instagram", "maya.p"), candidate("x", "jo_rn")] },
        false,
      ),
      // Nobody reviewed it in 14 days: its people are gone, so it counts under places only.
      list("r/StudentNurse", { proposed: 4, expired: true }, true),
    ];
    const kept = [
      person("reddit", "sam_p"),
      person("reddit", "lee_q"),
      { metadata: {} } as unknown as Person,
    ];
    const { channels, places } = chatter(shortlists, kept);
    expect(channels).toEqual([
      { platform: "instagram", label: "Instagram", proposed: 1, kept: 0 },
      { platform: "reddit", label: "Reddit", proposed: 3, kept: 2 },
      { platform: "x", label: "X", proposed: 1, kept: 0 },
      { platform: "youtube", label: "YouTube", proposed: 0, kept: 0 },
    ]);
    // Places group by what the agent wrote, whatever its case.
    expect(places).toEqual([
      { label: "r/StudentNurse", proposed: 7, kept: 2 },
      { label: "#futurenurse", proposed: 2, kept: 0 },
    ]);
  });

  it("lists the eight places that gave the most, and none for an empty window", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      list(`r/place${i}`, { proposed: i + 1, kept: 0 }, true),
    );
    expect(chatter(many, []).places.map((p) => p.label)).toEqual([
      "r/place9",
      "r/place8",
      "r/place7",
      "r/place6",
      "r/place5",
      "r/place4",
      "r/place3",
      "r/place2",
    ]);
    expect(chatter([], [])).toEqual({
      channels: [
        { platform: "instagram", label: "Instagram", proposed: 0, kept: 0 },
        { platform: "reddit", label: "Reddit", proposed: 0, kept: 0 },
        { platform: "x", label: "X", proposed: 0, kept: 0 },
        { platform: "youtube", label: "YouTube", proposed: 0, kept: 0 },
      ],
      places: [],
    });
  });
});
