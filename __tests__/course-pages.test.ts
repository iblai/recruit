import { describe, expect, it } from "vitest";
import type { PublicWebForm, WebForm } from "../lib/crm/types";
import {
  courseProblems,
  fromPublicWebForm,
  fromWebForm,
  newLandingPage,
  toWebForm,
  validateLandingPage,
  type PageCourse,
} from "../lib/recruit/landing-pages";

const course: PageCourse = {
  lessons: [
    {
      title: "What a nurse does in a day",
      body: ["A shift starts with a handover.", "Then rounds."],
      question: "Which part of the day would you look forward to?",
    },
    { title: "How the program is built", body: ["Two years of science, two of clinical work."] },
  ],
};

describe("a taster course on a landing page", () => {
  const page = newLandingPage({ title: "A taste of Nursing", program: "Nursing", course });

  it("is kept in the web form's metadata and read back, for staff and for visitors", () => {
    const form = toWebForm(page);
    expect(form.metadata?.course).toEqual(course);
    // An application opened from the page says which course it came from.
    expect(form.routing?.deal_metadata).toEqual({
      program: "Nursing",
      course: "a-taste-of-nursing",
    });
    const saved = { id: 1, platform: 1, created_at: "", updated_at: "", ...form } as WebForm;
    expect(fromWebForm(saved).course).toEqual(course);
    const served = { app: "recruit", ...form } as unknown as PublicWebForm;
    expect(fromPublicWebForm(served).course).toEqual(course);
  });

  it("is not there for a page without lessons, or with lessons that are not lessons", () => {
    expect(toWebForm(newLandingPage({ title: "Request information" })).metadata).not.toHaveProperty(
      "course",
    );
    const broken = {
      ...toWebForm(page),
      metadata: { course: { lessons: [null, "x", { title: " " }, { body: ["no title"] }] } },
    } as unknown as PublicWebForm;
    expect(fromPublicWebForm(broken).course).toBeUndefined();
  });

  it("drops what a stored lesson should not carry", () => {
    const odd = {
      ...toWebForm(page),
      metadata: { course: { lessons: [{ title: "One", body: ["a", 3, null], html: "<b>x</b>" }] } },
    } as unknown as PublicWebForm;
    expect(fromPublicWebForm(odd).course).toEqual({ lessons: [{ title: "One", body: ["a"] }] });
  });
});

describe("courseProblems", () => {
  it("passes a short course, and is part of what blocks a save", () => {
    expect(courseProblems(course)).toEqual([]);
    expect(validateLandingPage(newLandingPage({ title: "T", course }))).toEqual([]);
    const one = { lessons: [course.lessons[0]] };
    expect(validateLandingPage(newLandingPage({ title: "T", course: one }))).toEqual([
      { field: "course", message: "A course has 2 to 6 lessons." },
    ]);
  });

  it("names the lesson that is wrong", () => {
    const problems = courseProblems({
      lessons: [
        { title: "", body: ["x"] },
        { title: "Empty", body: [" "] },
        { title: "Long", body: ["x".repeat(601)], question: "q".repeat(201) },
        { title: "Many", body: ["a", "b", "c", "d", "e"] },
      ],
    });
    expect(problems).toEqual([
      "Lesson 1 needs a title.",
      '"Empty" needs some text.',
      'Keep each paragraph of "Long" under 600 characters.',
      'Keep the question of "Long" under 200 characters.',
      'Keep "Many" to 4 paragraphs.',
    ]);
  });
});
