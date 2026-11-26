import { describe, expect, it } from "vitest";
import type { PublicWebForm, WebForm, WebFormInput } from "../lib/crm/types";
import { RECRUIT_TOOLS, type ToolContext } from "../lib/mcp/tools";
import { demoOpenHouse } from "../lib/recruit/demo-data";
import {
  eventIsOpen,
  eventProblems,
  eventWhen,
  fromLocalInput,
  fromPublicWebForm,
  fromWebForm,
  newLandingPage,
  toLocalInput,
  toWebForm,
  validateLandingPage,
} from "../lib/recruit/landing-pages";

const event = {
  startsAt: "2027-03-13T15:00:00Z",
  endsAt: "2027-03-13T18:00:00Z",
  timeZone: "America/New_York",
  place: "Simulation lab",
  signUpBy: "2027-03-09T23:00:00Z",
};
const saved = (input: WebFormInput) =>
  ({ id: 1, platform: 1, created_at: "", updated_at: "", ...input }) as WebForm;

describe("an event page", () => {
  const page = newLandingPage({ title: "Nursing open house", program: "Nursing", event });

  it("keeps its event through a save, and marks its applications", () => {
    const form = toWebForm(page);
    expect(form.routing?.deal_metadata).toEqual({
      program: "Nursing",
      event: "nursing-open-house",
    });
    expect(fromWebForm(saved(form)).event).toEqual(event);
    // A visitor's copy carries the event too.
    const visitor = { app: "recruit", ...form } as unknown as PublicWebForm;
    expect(fromPublicWebForm(visitor).event).toEqual(event);
  });

  it("leaves a page without an event exactly as it was, and drops an event it cannot read", () => {
    const plain = toWebForm(newLandingPage({ title: "Request information" }));
    expect(plain.routing?.deal_metadata).toEqual({});
    expect(plain.metadata).not.toHaveProperty("event");
    expect(fromWebForm(saved(plain)).event).toBeUndefined();
    for (const broken of [
      { startsAt: "soon", timeZone: "UTC" },
      { ...event, timeZone: "Mars/Olympus" },
      "x",
    ])
      expect(
        fromWebForm(saved({ ...plain, metadata: { ...plain.metadata, event: broken } })).event,
      ).toBeUndefined();
  });

  it("says what is wrong with the dates", () => {
    expect(eventProblems(event)).toEqual([]);
    expect(eventProblems({ ...event, endsAt: "2027-03-13T14:00:00Z" })).toEqual([
      "The event ends after it starts.",
    ]);
    expect(eventProblems({ ...event, signUpBy: "2027-03-14T00:00:00Z" })).toEqual([
      "Sign-ups close before the event starts.",
    ]);
    expect(eventProblems({ startsAt: "", timeZone: "Nowhere" })).toEqual([
      "Give the event a date and time.",
      "The event needs a time zone.",
    ]);
    const issues = validateLandingPage({ ...page, event: { ...event, endsAt: event.startsAt } });
    expect(issues).toEqual([{ field: "event", message: "The event ends after it starts." }]);
  });

  it("takes sign-ups until the sign-up-by time, else until it starts", () => {
    expect(eventIsOpen(event, new Date("2027-03-09T22:59:00Z"))).toBe(true);
    expect(eventIsOpen(event, new Date("2027-03-09T23:00:00Z"))).toBe(false);
    const open = { ...event, signUpBy: undefined };
    expect(eventIsOpen(open, new Date("2027-03-13T14:59:00Z"))).toBe(true);
    expect(eventIsOpen(open, new Date("2027-03-13T15:00:00Z"))).toBe(false);
  });

  it("prints the date in the event's own time zone, whoever is looking", () => {
    expect(eventWhen(event)).toBe("Saturday, March 13 · 10:00 AM – 1:00 PM");
    expect(eventWhen({ ...event, endsAt: undefined })).toBe("Saturday, March 13 · 10:00 AM");
    expect(eventWhen({ ...event, timeZone: "Asia/Tokyo", endsAt: undefined })).toBe(
      "Sunday, March 14 · 12:00 AM",
    );
    expect(eventWhen(event, "es")).toMatch(/^sábado, 13 de marzo · /);
  });

  it("says nothing while a draft's date is unfinished, instead of failing", () => {
    expect(eventWhen({ ...event, startsAt: "" })).toBe("");
    expect(eventWhen({ ...event, timeZone: "Nowhere/At_All" })).toBe("");
    // An end before the start is a problem the editor names; the line leaves it out.
    expect(eventWhen({ ...event, endsAt: "2027-03-13T14:00:00Z" })).toBe(
      "Saturday, March 13 · 10:00 AM",
    );
  });
});

describe("the editor's date fields", () => {
  it("keep a year while it is typed digit by digit, and an empty field empty", () => {
    for (const typed of [
      "0002-12-12T10:00",
      "0020-12-12T10:00",
      "0202-12-12T10:00",
      "2026-12-12T10:00",
    ])
      expect(toLocalInput(fromLocalInput(typed))).toBe(typed);
    expect(fromLocalInput("")).toBeUndefined();
    for (const nothing of [undefined, "", "not a date"]) expect(toLocalInput(nothing)).toBe("");
  });
});

describe("the demo open house", () => {
  it("is on a Saturday that has not happened, in the university's own time", () => {
    // Winter and summer time, and a day that is itself a Saturday.
    for (const today of ["2026-11-26T12:00:00Z", "2027-03-01T12:00:00Z", "2027-03-13T23:00:00Z"]) {
      const now = new Date(today);
      const page = newLandingPage(demoOpenHouse("Fall 2027", now));
      const open = page.event!;
      const local = (iso: string, options: Intl.DateTimeFormatOptions) =>
        new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", ...options });

      expect(local(open.startsAt, { weekday: "long", hour: "numeric" })).toBe("Saturday 10 AM");
      expect(local(open.signUpBy!, { weekday: "long", hour: "numeric", minute: "2-digit" })).toBe(
        "Tuesday 11:59 PM",
      );
      expect(Date.parse(open.startsAt) - now.getTime()).toBeGreaterThanOrEqual(13 * 86_400_000);
      expect(Date.parse(open.startsAt) - now.getTime()).toBeLessThan(21 * 86_400_000);
      expect(validateLandingPage(page, { publish: true })).toEqual([]);
      expect(eventIsOpen(open, now)).toBe(true);
    }
  });
});

describe("create_landing_page with an event", () => {
  const create = RECRUIT_TOOLS.find((t) => t.name === "create_landing_page")!;
  const args = {
    title: "Nursing open house",
    event_starts_at: "2027-03-13T10:00:00-05:00",
    event_ends_at: "2027-03-13T13:00:00-05:00",
    event_place: "Simulation lab",
    sign_up_by: "2027-03-09T18:00:00-05:00",
    time_zone: "America/New_York",
  };
  const platform = () => {
    const forms: WebFormInput[] = [];
    const crm = {
      listLeadSources: async () => [],
      listWebForms: async () => forms,
      createWebForm: async (body: WebFormInput) => forms.push(body),
    };
    const ctx = { org: "northfield", crm, appUrl: "https://a.example" } as unknown as ToolContext;
    return { forms, ctx };
  };

  it("keeps the event with the draft, and never publishes: a person does", async () => {
    const { forms, ctx } = platform();
    const draft = (await create.handler(args, ctx)) as { published: boolean; url: string };
    expect(draft).toMatchObject({
      published: false,
      url: "https://a.example/p/northfield/nursing-open-house",
    });
    expect(forms[0]).toMatchObject({
      is_published: false,
      routing: { deal_metadata: { event: "nursing-open-house" } },
      metadata: {
        event: {
          startsAt: args.event_starts_at,
          timeZone: "America/New_York",
          place: "Simulation lab",
        },
      },
    });
    // Asked to publish, it still leaves a draft.
    await create.handler({ ...args, title: "Spring open house", publish: true }, ctx);
    expect(forms[1].is_published).toBe(false);
  });

  it("refuses dates that cannot be", async () => {
    const { forms, ctx } = platform();
    const late = await create.handler({ ...args, sign_up_by: "2027-03-14T00:00:00-05:00" }, ctx);
    expect((late as { content: { text: string }[] }).content[0].text).toMatch(
      /Sign-ups close before the event starts/,
    );
    expect(forms).toEqual([]);
  });
});
