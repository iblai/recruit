import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coursePrompt,
  draftPage,
  draftPrompt,
  parseCourse,
  parseDraft,
  readReply,
} from "../lib/recruit/draft-page";

const frames = (...parts: object[]) => parts.map((p) => JSON.stringify(p)).join("\n\n") + "\n\n";
const draft = {
  title: "Nursing open house",
  headline: "See where you will learn to be a nurse.",
  subheadline: "Tour the simulation lab and meet faculty.",
  highlights: ["Tour the simulation lab", "Meet nursing faculty and students", 7, ""],
  program: "Nursing",
  term: "Fall 2027",
  cta_label: "Save my seat",
  event: {
    starts_at: "2027-03-13T10:00:00-05:00",
    ends_at: "2027-03-13T13:00:00-05:00",
    place: "Simulation lab",
    sign_up_by: "2027-03-09T23:59:00-05:00",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("readReply", () => {
  it("joins the text of a streamed turn and stops at its end", () => {
    const stream = frames(
      { detail: "Connected" },
      { data: '{"title":', eos: false, session_id: "s" },
      { type: "vector_results", documents: [] },
      { data: ' "x"}', eos: false },
      { data: "", eos: true },
      { data: "after the end" },
    );
    expect(readReply(stream)).toBe('{"title": "x"}');
    expect(readReply("")).toBe("");
  });

  it("raises the platform's refusal instead of reading it as a page", () => {
    expect(() => readReply(frames({ error: "Session not found" }))).toThrow("Session not found");
  });
});

describe("parseDraft", () => {
  it("makes an unpublished event page from the answer, around any prose", () => {
    const page = parseDraft(
      `Here it is:\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``,
      "America/New_York",
    );
    expect(page).toMatchObject({
      slug: "nursing-open-house",
      headline: "See where you will learn to be a nurse.",
      highlights: ["Tour the simulation lab", "Meet nursing faculty and students"],
      program: "Nursing",
      ctaLabel: "Save my seat",
      published: false,
      event: {
        startsAt: "2027-03-13T15:00:00.000Z",
        endsAt: "2027-03-13T18:00:00.000Z",
        timeZone: "America/New_York",
        place: "Simulation lab",
        signUpBy: "2027-03-10T04:59:00.000Z",
      },
    });
  });

  it("is a plain page when there is no event, or none it can date", () => {
    expect(parseDraft(JSON.stringify({ ...draft, event: null }), "UTC").event).toBeUndefined();
    const undated = { ...draft, event: { starts_at: "next Saturday" } };
    expect(parseDraft(JSON.stringify(undated), "UTC").event).toBeUndefined();
  });

  it("says what is wrong rather than saving a default page", () => {
    expect(() => parseDraft("I could not find that in the catalog.", "UTC")).toThrow(
      "Its answer was not a page.",
    );
    expect(() => parseDraft("{}", "UTC")).toThrow("Its answer had no title.");
    const backwards = { ...draft, event: { ...draft.event, ends_at: "2027-03-13T09:00:00-05:00" } };
    expect(() => parseDraft(JSON.stringify(backwards), "UTC")).toThrow(
      "The event ends after it starts.",
    );
  });
});

describe("draftPage", () => {
  it("starts a conversation as the caller and sends the token in the body", async () => {
    const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] =
      [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string),
      });
      return url.includes("/sessions/")
        ? new Response(JSON.stringify({ session_id: "s-1" }))
        : new Response(
            frames({ data: JSON.stringify(draft), eos: false }, { data: "", eos: true }),
          );
    });
    const page = await draftPage({
      org: "northfield",
      username: "ada",
      token: "session-token",
      agentId: "agent-1",
      brief: "Open house for admitted nursing students.",
      timeZone: "America/New_York",
      now: new Date("2027-02-01T12:00:00Z"),
    });

    expect(page.title).toBe("Nursing open house");
    expect(calls[0]).toMatchObject({
      url: "https://api.iblai.app/dm/api/ai-mentor/orgs/northfield/users/ada/sessions/",
      headers: { Authorization: "Token session-token" },
      body: { mentor: "agent-1" },
    });
    expect(calls[1].url).toBe(
      "https://asgi.data.iblai.app/api/mentor/chat/?platform_key=northfield&session_id=s-1",
    );
    expect(calls[1].headers).not.toHaveProperty("Authorization");
    expect(calls[1].body).toMatchObject({
      session_id: "s-1",
      flow: { name: "agent-1", tenant: "northfield" },
      token: "session-token",
      token_type: "dm_token",
      metadata: { purpose: "draft" },
    });
    expect(calls[1].body.prompt).toBe(
      draftPrompt("Open house for admitted nursing students.", "2027-02-01", "America/New_York"),
    );
  });
});

const lesson = (n: number) => ({
  title: `Lesson ${n}`,
  body: [`What the catalog says, part ${n}.`],
  question: "Which of these would you choose?",
});
const course = {
  title: "Nursing taster",
  headline: "A first look at nursing here.",
  subheadline: "Three short lessons from our catalog.",
  lessons: [lesson(1), lesson(2), lesson(3)],
  cta_label: "Ask a counselor",
};

describe("coursePrompt", () => {
  it("names the program, the brief and the limits", () => {
    const prompt = coursePrompt("B.S. Nursing", "The simulation lab.");
    expect(prompt).toContain('"B.S. Nursing"');
    expect(prompt).toContain("The simulation lab.");
    expect(prompt).toContain("3 to 5 lessons");
    expect(prompt).toContain("under 600 characters");
    expect(prompt).toContain("under 200 characters");
    // What Recruit does in chat, naming its source, has no place in text a visitor reads.
    expect(prompt).toContain("name no source or document");
    expect(coursePrompt("B.S. Nursing", "")).not.toContain('"""');
  });
});

describe("parseCourse", () => {
  it("makes an unpublished course page, around prose or a code fence", () => {
    for (const reply of [
      JSON.stringify(course),
      `Here it is:\n\`\`\`json\n${JSON.stringify(course)}\n\`\`\``,
    ]) {
      const page = parseCourse(reply, "B.S. Nursing");
      expect(page).toMatchObject({
        title: "Nursing taster",
        // Its address names the program, whatever the model called the page.
        slug: "b-s-nursing-taster-course",
        program: "B.S. Nursing",
        ctaLabel: "Ask a counselor",
        highlights: [],
        published: false,
        course: { lessons: [lesson(1), lesson(2), lesson(3)] },
      });
      expect(page.fields.length).toBeGreaterThan(0);
    }
  });

  it("cuts what is too long rather than refusing it", () => {
    const long = {
      ...course,
      cta_label: "",
      lessons: Array.from({ length: 8 }, (_, i) => ({
        title: "t".repeat(300),
        body: ["p".repeat(900), "a", "b", "c", "d", 7],
        question: i ? "q".repeat(300) : "",
      })),
    };
    const page = parseCourse(JSON.stringify(long), "Nursing");
    const lessons = page.course!.lessons;
    expect(lessons).toHaveLength(6);
    expect(lessons[0].title).toHaveLength(120);
    expect(lessons[0].body).toHaveLength(4);
    expect(lessons[0].body[0]).toHaveLength(600);
    expect(lessons[0].question).toBeUndefined();
    expect(lessons[1].question).toHaveLength(200);
    expect(page.ctaLabel).toBe("Ask about this program");
  });

  it("says what is wrong rather than saving a default course", () => {
    expect(() =>
      parseCourse(JSON.stringify({ ...course, lessons: [lesson(1)] }), "Nursing"),
    ).toThrow("Its answer had too few lessons: the documents may say too little about Nursing.");
    const untitled = { ...course, lessons: [lesson(1), { body: ["x"] }] };
    expect(() => parseCourse(JSON.stringify(untitled), "Nursing")).toThrow("too few lessons");
    expect(() => parseCourse("The catalog says nothing about that.", "Nursing")).toThrow(
      "Its answer was not a course.",
    );
  });
});

describe("draftPage for a course", () => {
  it("asks with the course prompt and the draft purpose", async () => {
    let chat: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.includes("/sessions/")) return new Response(JSON.stringify({ session_id: "s-1" }));
      chat = JSON.parse(init.body as string);
      return new Response(frames({ data: JSON.stringify(course) }, { data: "", eos: true }));
    });
    const page = await draftPage({
      org: "northfield",
      username: "ada",
      token: "session-token",
      agentId: "agent-1",
      brief: "",
      kind: "course",
      program: "B.S. Nursing",
      timeZone: "UTC",
    });
    expect(page.course?.lessons).toHaveLength(3);
    expect(chat).toMatchObject({
      prompt: coursePrompt("B.S. Nursing", ""),
      metadata: { purpose: "draft" },
    });
  });
});
