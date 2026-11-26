import { describe, expect, it } from "vitest";
import { RECRUIT_TOOLS, type ToolContext } from "../lib/mcp/tools";
import {
  contactRefusal,
  eventMessage,
  followUpOf,
  foundLine,
  handoffOf,
  sendLink,
  withLine,
} from "../lib/recruit/follow-ups";
import { newLandingPage, toWebForm } from "../lib/recruit/landing-pages";
import { sampleResponse } from "../lib/recruit/sample/respond";

describe("contactRefusal", () => {
  const person = { primary_email: "a@b.edu", contact_numbers: ["+15550100"], metadata: {} };

  it("lets a person be emailed, and texted only when they asked for texts", () => {
    expect(contactRefusal(person, "email")).toBe("");
    expect(contactRefusal(person, "text")).toBe("They did not ask for texts.");
    expect(contactRefusal({ ...person, metadata: { sms_consent: true } }, "text")).toBe("");
    // A form checkbox arrives as a string on some platforms.
    expect(contactRefusal({ ...person, metadata: { sms_consent: "true" } }, "text")).toBe("");
  });

  it("refuses everything once they asked not to be contacted", () => {
    const stopped = { ...person, metadata: { opted_out: true, sms_consent: true } };
    expect(contactRefusal(stopped, "email")).toBe("They asked not to be contacted.");
    expect(contactRefusal(stopped, "text")).toBe("They asked not to be contacted.");
  });

  it("allows a dm only to someone found on a social channel who has not opted out", () => {
    const found = { platform: "reddit", handle: "maya_p", source: "r/nursing", basis: "x", at: "" };
    expect(contactRefusal({ metadata: { found } }, "dm")).toBe("");
    expect(contactRefusal({ metadata: { found, opted_out: true } }, "dm")).toBe(
      "They asked not to be contacted.",
    );
    expect(contactRefusal(person, "dm")).toBe("There is no profile on file.");
  });

  it("refuses a channel with no address", () => {
    expect(contactRefusal({ metadata: {} }, "email")).toBe("There is no email address on file.");
    expect(
      contactRefusal({ primary_email: "a@b.edu", metadata: { sms_consent: true } }, "text"),
    ).toBe("There is no phone number on file.");
  });
});

describe("what an activity is", () => {
  it("reads a follow-up and a handoff from the metadata an agent left", () => {
    expect(
      followUpOf({ metadata: { follow_up: { channel: "text", kind: "reminder", by: "X" } } }),
    ).toEqual({ channel: "text", kind: "reminder", by: "X" });
    expect(
      followUpOf({
        metadata: { follow_up: { channel: "dm", step: "inquiry:course:2", discarded: true } },
      }),
    ).toEqual({ channel: "dm", kind: "reply", step: "inquiry:course:2", discarded: true });
    expect(followUpOf({ metadata: { follow_up: {} } })).toEqual({
      channel: "email",
      kind: "reply",
    });
    expect(handoffOf({ metadata: { handoff: { reason: "Aid", conversation: "abc" } } })).toEqual({
      reason: "Aid",
      conversation: "abc",
    });
    expect(handoffOf({ metadata: { handoff: { conversation: "" } } })).toEqual({});
  });

  it("is neither for an ordinary activity", () => {
    for (const metadata of [undefined, {}, { follow_up: "yes" }, { handoff: 1 }]) {
      expect(followUpOf({ metadata })).toBeNull();
      expect(handoffOf({ metadata })).toBeNull();
    }
  });
});

describe("sendLink", () => {
  it("opens the person's own mail or messages with the text filled in", () => {
    expect(sendLink("email", "a+b@x.edu", "Your visit", "See you & yours\nSaturday")).toBe(
      "mailto:a%2Bb@x.edu?subject=Your%20visit&body=See%20you%20%26%20yours%0ASaturday",
    );
    expect(sendLink("text", "+1 555 0100", "", "Hi")).toBe("sms:%2B1%20555%200100?&body=Hi");
  });
});

describe("queue_message", () => {
  const queue = RECRUIT_TOOLS.find((t) => t.name === "queue_message")!;

  it("queues for a person, and refuses without consent", async () => {
    const made: Record<string, unknown>[] = [];
    const people: Record<string, object> = {
      ok: { id: "ok", primary_email: "a@b.edu", owner: 4, metadata: {} },
      stopped: { id: "stopped", primary_email: "a@b.edu", metadata: { opted_out: true } },
      "no-texts": { id: "no-texts", contact_numbers: ["+15550100"], metadata: {} },
    };
    const crm = {
      getPerson: async (id: string) => people[id],
      allActivities: async () => [],
      allDeals: async () => [],
      createActivity: async (body: Record<string, unknown>) => {
        made.push(body);
        return { id: 9, ...body };
      },
    };
    const ctx = { org: "northfield", crm, appUrl: "" } as unknown as ToolContext;
    const call = (args: object) =>
      queue.handler({ channel: "email", body: "See you Saturday.", ...args }, ctx);
    const refusal = async (args: object) =>
      ((await call(args)) as { content: { text: string }[] }).content[0].text;

    expect(
      await call({ prospect_id: "ok", subject: "Your visit", kind: "reminder" }),
    ).toMatchObject({ queued: true });
    expect(made).toEqual([
      {
        type: "email",
        title: "Your visit",
        comment: "See you Saturday.",
        person: "ok",
        deal: null,
        owner: 4,
        is_done: false,
        metadata: { follow_up: { channel: "email", kind: "reminder", by: "Chief of Staff (AI)" } },
      },
    ]);
    expect(await refusal({ prospect_id: "stopped" })).toMatch(/asked not to be contacted/);
    expect(await refusal({ prospect_id: "no-texts" })).toMatch(/no email address/);
    expect(await refusal({ prospect_id: "no-texts", channel: "text" })).toMatch(
      /did not ask for texts/,
    );
    expect(made).toHaveLength(1);
  });
});

describe("the sample workspace", () => {
  const env = { now: new Date("2026-10-15T12:00:00Z"), visitor: { id: 42, username: "jane" } };
  const open = (params: Record<string, unknown>) =>
    sampleResponse("GET", "/activities/", { is_done: false, ...params }, env) as { count: number };

  it("has open activities, and none of them waits under Needs you", () => {
    expect(open({}).count).toBeGreaterThan(0);
    expect(open({ metadata__has_key: "handoff" }).count).toBe(0);
    expect(open({ metadata__has_key: "follow_up" }).count).toBe(0);
  });
});

describe("queue_event_messages", () => {
  const queueAll = RECRUIT_TOOLS.find((t) => t.name === "queue_event_messages")!;
  const event = { startsAt: "2027-03-13T15:00:00Z", timeZone: "America/New_York", place: "Lab" };
  const openHouse = toWebForm(newLandingPage({ title: "Nursing open house", ownerId: 31, event }));
  const plain = toWebForm(newLandingPage({ title: "Request information" }));

  const NOW = new Date("2027-03-01T12:00:00Z");

  /** A fake CRM: two form sign-ups, one chat booking, whatever was queued before, and `today`'s other drafts. */
  function platform(
    written: Record<string, unknown>[] = [],
    today: Record<string, unknown>[] = [],
    settings: object = {},
  ) {
    const made: Record<string, unknown>[] = [];
    const people: Record<string, object> = {
      maya: { id: "maya", name: "Maya Park", primary_email: "maya@x.edu", owner: 8 },
      leo: {
        id: "leo",
        name: "Leo Ortiz",
        primary_email: "leo@x.edu",
        metadata: { opted_out: true },
      },
      ana: { id: "ana", name: "", primary_email: "" },
      kim: { id: "kim", name: "Kim", primary_email: "kim@x.edu" },
    };
    const marked: Record<string, Record<string, unknown>[]> = {
      booking: [
        { person: "kim", metadata: { booking: { event: "nursing-open-house" } } },
        { person: "zed", metadata: { booking: { event: "another-event" } } },
      ],
      follow_up: written,
    };
    const crm = {
      listWebForms: async () => [openHouse, plain],
      allWebFormSubmissions: async () => [
        { person: "maya" },
        { person: "maya" },
        { person: "leo" },
        { person: "ana" },
        { person: null },
      ],
      // With a date window: the day's agent-written drafts, newest first.
      allActivities: async (q: {
        metadata__has_key: string;
        start_date?: string;
        end_date?: string;
      }) => {
        // As the platform: a date window takes both ends, or it answers 400.
        if (!q.start_date !== !q.end_date)
          throw new Error("400: start_date and end_date are required");
        return q.start_date
          ? [...made.map((m) => ({ ...m, created_at: NOW.toISOString() })), ...today]
          : [...marked[q.metadata__has_key], ...(q.metadata__has_key === "follow_up" ? made : [])];
      },
      getPerson: async (id: string) => people[id],
      createActivity: async (body: Record<string, unknown>) => made.push(body),
    };
    const ctx = {
      org: "northfield",
      crm,
      appUrl: "",
      now: () => NOW,
      settings,
    } as unknown as ToolContext;
    const run = (kind: string, slug = "nursing-open-house") =>
      queueAll.handler({ event: slug, kind }, ctx) as Promise<Record<string, unknown>>;
    return { made, run };
  }

  it("drafts one for each sign-up, by form or by chat, and counts whom it may not write to", async () => {
    const { made, run } = platform();
    expect(await run("confirmation")).toMatchObject({
      queued: 2,
      already_had_one: 0,
      skipped: {
        "They asked not to be contacted.": 1,
        "There is no email address on file.": 1,
      },
    });
    expect(made).toEqual([
      {
        type: "email",
        title: "Confirmation: Nursing open house",
        comment:
          "Hi Maya,\n\nYou are signed up for Nursing open house.\n\nSaturday, March 13 · 10:00 AM\nLab\n\nIf your plans change, reply to this message.",
        person: "maya",
        owner: 8,
        is_done: false,
        metadata: {
          follow_up: {
            channel: "email",
            kind: "confirmation",
            by: "Chief of Staff (AI)",
            event: "nursing-open-house",
          },
        },
      },
      expect.objectContaining({ person: "kim", owner: 31 }),
    ]);
  });

  it("queues nothing twice, and a reminder is its own kind", async () => {
    const { made, run } = platform([
      // What `book_visit` left for Kim in chat.
      {
        person: "kim",
        metadata: {
          follow_up: { channel: "email", kind: "confirmation", event: "nursing-open-house" },
        },
      },
    ]);
    expect(await run("confirmation")).toMatchObject({ queued: 1, already_had_one: 1 });
    expect(await run("confirmation")).toMatchObject({ queued: 0, already_had_one: 2 });
    expect(await run("reminder")).toMatchObject({ queued: 2, already_had_one: 0 });
    expect(made.map((m) => [m.person, m.title])).toEqual([
      ["maya", "Confirmation: Nursing open house"],
      ["maya", "Reminder: Nursing open house"],
      ["kim", "Reminder: Nursing open house"],
    ]);
  });

  it("stops at the day's allowance of agent-written drafts, shared with queue_message", async () => {
    const earlier = Array.from({ length: 49 }, () => ({
      created_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
      metadata: { follow_up: { channel: "email", kind: "nudge", by: "Chief of Staff (AI)" } },
    }));
    const { made, run } = platform([], earlier);
    // Four signed up and one draft is left today: the other three are not looked at.
    expect(await run("confirmation")).toMatchObject({ queued: 1, left_for_another_call: 3 });
    expect(await run("confirmation")).toMatchObject({ queued: 0, left_for_another_call: 3 });
    expect(made).toHaveLength(1);
    // The platform's own allowance from Settings, here 10 with 9 written.
    const own = platform([], earlier.slice(0, 9), { dailyDrafts: 10 });
    expect(await own.run("confirmation")).toMatchObject({ queued: 1, left_for_another_call: 3 });
    expect(own.made).toHaveLength(1);
  });

  it("refuses a page that is not an event", async () => {
    const { made, run } = platform();
    for (const slug of ["request-information", "no-such-page"]) {
      const out = (await run("reminder", slug)) as { content?: { text: string }[] };
      expect(out.content?.[0].text).toMatch(/is not an event page/);
    }
    expect(made).toEqual([]);
  });
});

describe("eventMessage", () => {
  it("greets someone with no name, and leaves out a place the event has none of", () => {
    const page = {
      title: "Visit day",
      event: { startsAt: "2027-03-13T15:00:00Z", timeZone: "America/New_York" },
    };
    expect(eventMessage("reminder", { name: " " }, page).body).toBe(
      "Hi there,\n\nA reminder about Visit day.\n\nSaturday, March 13 · 10:00 AM\n\nWe look forward to seeing you.",
    );
  });
});

describe("foundLine", () => {
  it("says who writes, where the address came from, how to stop, and the postal address", () => {
    expect(foundLine("Northfield University", "the state counselors' list", " 1 Main St ")).toBe(
      "This message is from Northfield University. We found your address through the state counselors' list. If you would rather not hear from us, reply to say so and we will not write to you again. 1 Main St.",
    );
    expect(foundLine("Northfield", "a fair list")).not.toMatch(/undefined|\.\.$/);
  });

  it("names a link in the source by its host, so an agent's link never reaches a message", () => {
    const line = foundLine(
      "Northfield",
      "https://evil.example/verify-your-account and www.lists.org/a",
    );
    expect(line).toContain("through evil.example and www.lists.org.");
    expect(line).not.toMatch(/https?:|verify|\/a/);
  });

  it("sits at the foot exactly once, however often it is added", () => {
    const line = foundLine("Northfield", "a fair list");
    const once = withLine("Hi Ada,\n\nCome visit.", line);
    expect(once).toBe(`Hi Ada,\n\nCome visit.\n\n${line}`);
    expect(withLine(once, line)).toBe(once);
    expect(withLine(`${line}\n\nHi Ada,`, line).split(line)).toHaveLength(2);
  });
});
