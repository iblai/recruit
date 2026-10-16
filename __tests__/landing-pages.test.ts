import { describe, expect, it } from "vitest";
import type { PublicWebForm, WebForm, WebFormInput } from "../lib/crm/types";
import {
  fieldKey,
  fieldTargets,
  fromPublicWebForm,
  fromWebForm,
  landingPageUrl,
  newLandingPage,
  pickUtm,
  slugify,
  submissionOutcome,
  toWebForm,
  validateLandingPage,
  type FieldMapping,
  type FormField,
  type LandingPage,
} from "../lib/recruit/landing-pages";

/** What the platform stores and serves back for a saved page. */
function saved(input: WebFormInput): WebForm {
  return {
    id: 1,
    platform: 1,
    created_at: "2026-10-16T10:00:00Z",
    updated_at: "2026-10-16T11:00:00Z",
    ...(input as Required<WebFormInput>),
  };
}

const MAPPINGS: FieldMapping[] = [
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "school",
  "program",
  "term",
  "message",
  "graduation_year",
  "entry_type",
  "residency",
  "city",
  "state",
  "country",
  "parent_name",
  "parent_email",
  "sms_consent",
];

describe("newLandingPage", () => {
  it("derives a slug and the standard inquiry form", () => {
    const page = newLandingPage({ title: "Fall 2027 Nursing Open House!" });
    expect(page.slug).toBe("fall-2027-nursing-open-house");
    expect(page.fields.map((f) => f.mapTo)).toContain("email");
    expect(page.published).toBe(false);
    expect(page.pipelineCode).toBe("");
    expect(page.sourceCode).toBe("landing-fall-2027-nursing-open-house");
    expect(validateLandingPage(page, { publish: true })).toEqual([]);
  });

  it("keeps the source code within the platform's 64 characters", () => {
    const page = newLandingPage({ title: "x", slug: "a".repeat(60) });
    expect(page.sourceCode).toHaveLength(64);
    expect(validateLandingPage(page)).toEqual([]);
  });

  it("slugify strips accents and punctuation", () => {
    expect(slugify("Café & Résumé — Night")).toBe("cafe-resume-night");
    expect(slugify("  --weird--  ")).toBe("weird");
  });
});

describe("toWebForm / fromWebForm", () => {
  it("round-trips every mapping, the copy and the routing", () => {
    const fields: FormField[] = MAPPINGS.map((mapTo) => ({
      key: mapTo,
      label: mapTo,
      type: mapTo === "email" || mapTo === "parent_email" ? "email" : "text",
      mapTo,
    }));
    fields.push({ key: "how_heard", label: "How did you hear?", type: "text", mapTo: "none" });
    const page = newLandingPage({
      title: "Open House",
      headline: "Come see us",
      body: ["One", "Two"],
      program: "Nursing",
      term: "Fall 2027",
      tags: ["Web inquiry"],
      ownerId: 5,
      pipelineCode: "admissions",
      stageCode: "inquiry",
      fields,
    });
    const back = fromWebForm(saved(toWebForm(page)));
    expect(back.fields.map((f) => f.mapTo)).toEqual([...MAPPINGS, "none"]);
    expect(back).toMatchObject({
      slug: "open-house",
      title: "Open House",
      headline: "Come see us",
      body: ["One", "Two"],
      program: "Nursing",
      term: "Fall 2027",
      tags: ["Web inquiry"],
      ownerId: 5,
      pipelineCode: "admissions",
      stageCode: "inquiry",
      createApplication: true,
      published: false,
      updatedAt: "2026-10-16T11:00:00Z",
    });
  });

  it("writes each answer where the old submission handler did", () => {
    const targets = (mapTo: FieldMapping, key: string = mapTo) =>
      fieldTargets({ key, label: key, type: "text", mapTo });
    expect(targets("email")).toEqual(["person.primary_email"]);
    expect(targets("school")).toEqual(["organization.name"]);
    expect(targets("program")).toEqual(["person.job_title", "deal.metadata.program"]);
    expect(targets("term")).toEqual(["person.metadata.entry_term", "deal.metadata.term"]);
    expect(targets("message")).toEqual(["deal.description"]);
    expect(targets("none", "how_heard")).toEqual(["person.metadata.how_heard"]);
  });

  it("titles applications from what the page knows", () => {
    const title = (input: Partial<LandingPage>) =>
      toWebForm(newLandingPage({ title: "x", ...input })).routing?.deal_title;
    const plain: FormField[] = [
      { key: "name", label: "Name", type: "text", mapTo: "name" },
      { key: "email", label: "Email", type: "email", mapTo: "email" },
    ];
    expect(title({})).toBe("{name} — {program} · {term}");
    expect(title({ fields: plain })).toBe("{name} — Application");
    expect(title({ fields: plain, term: "Fall 2027" })).toBe("{name} — {term}");
    const form = toWebForm(newLandingPage({ title: "x", fields: plain, program: "Nursing" }));
    expect(form.routing?.deal_metadata).toEqual({ program: "Nursing" });
  });

  it("sends options only for dropdowns", () => {
    const page = newLandingPage({
      title: "x",
      fields: [{ key: "q", label: "Q", type: "text", options: ["left over"], mapTo: "none" }],
    });
    expect(toWebForm(page).fields?.[0].options).toEqual([]);
  });

  it("reads a public form: copy and questions, no mappings", () => {
    const form: PublicWebForm = {
      slug: "open-house",
      name: "Open House",
      metadata: { headline: "Come see us", highlights: ["A", 3], ctaLabel: "Count me in" },
      fields: [
        {
          key: "email",
          label: "Email",
          type: "email",
          required: true,
          placeholder: "",
          help: "",
          options: [],
        },
      ],
      success_title: "Thanks",
      success_message: "See you soon",
    };
    expect(fromPublicWebForm(form)).toMatchObject({
      title: "Open House",
      headline: "Come see us",
      highlights: ["A"],
      ctaLabel: "Count me in",
      successTitle: "Thanks",
      published: true,
      fields: [{ key: "email", type: "email", required: true }],
    });
    expect(fromPublicWebForm(form).fields[0].mapTo).toBeUndefined();
  });
});

describe("validateLandingPage", () => {
  it("requires an email mapping and a name mapping to publish", () => {
    const page = newLandingPage({
      title: "Bad",
      fields: [{ key: "q", label: "Question", type: "text", mapTo: "none" }],
    });
    expect(validateLandingPage(page)).toEqual([]);
    const issues = validateLandingPage(page, { publish: true }).map((i) => i.message);
    expect(issues.some((m) => /Email/.test(m))).toBe(true);
    expect(issues.some((m) => /Name/.test(m))).toBe(true);
  });

  it("refuses what the platform would refuse", () => {
    const page = newLandingPage({ title: "x", slug: "Bad Slug", tags: ["Fall", "fall"] });
    page.fields.push(
      { key: "email", label: "Dup", type: "select", options: [] },
      { key: "2nd", label: "Second", type: "text" },
      { key: "entry_term", label: "Start", type: "text", mapTo: "none" },
      { key: "work_email", label: "Work email", type: "text", mapTo: "parent_email" },
      { key: "visits", label: "Visits", type: "number", mapTo: "school" },
    );
    const issues = validateLandingPage(page)
      .map((i) => i.message)
      .join(" | ");
    expect(issues).toMatch(/lowercase letters/);
    expect(issues).toMatch(/used twice/);
    expect(issues).toMatch(/between 1 and 100 options/);
    expect(issues).toMatch(/"Second" needs a key/);
    // `term` already writes person.metadata.entry_term.
    expect(issues).toMatch(/"When would you like to start\?" and "Start" save to the same place/);
    expect(issues).toMatch(/"Visits" must be a text, email, phone, dropdown or paragraph question/);
    expect(issues).toMatch(/Each tag can be listed once/);
  });

  it("puts Email only on an email question", () => {
    const page = newLandingPage({
      title: "x",
      fields: [{ key: "email", label: "Email", type: "text", mapTo: "email" }],
    });
    expect(validateLandingPage(page)[0].message).toMatch(/must be an Email question/);
  });
});

describe("helpers", () => {
  it("builds public urls", () => {
    expect(landingPageUrl("https://recruit.example.edu/", "north field", "open-house")).toBe(
      "https://recruit.example.edu/p/north%20field/open-house",
    );
  });

  it("keys questions the way the platform requires", () => {
    expect(fieldKey("2027 Grad year?")).toBe("grad_year");
    expect(fieldKey("¿Qué?")).toBe("que");
    expect(fieldKey("123")).toBe("question");
    expect(fieldKey("x".repeat(80))).toHaveLength(64);
  });

  it("keeps only utm_* params, at most 8", () => {
    const params = new URLSearchParams(
      "utm_source=ig&utm_campaign=fall_2027&utm_term2=x&ref=evil&UTM_Medium=social",
    );
    expect(pickUtm(params)).toEqual({
      utm_source: "ig",
      utm_campaign: "fall_2027",
      utm_term2: "x",
      utm_medium: "social",
    });
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`utm_k${i}`, "v"]));
    expect(Object.keys(pickUtm(many))).toHaveLength(8);
  });

  it("turns the platform's answer into what a visitor sees", () => {
    expect(submissionOutcome(201, { created: true })).toEqual({ ok: true });
    expect(
      submissionOutcome(400, {
        issues: { email: ["Enter a valid email address."], non_field_errors: ["Name or email."] },
      }),
    ).toEqual({
      ok: false,
      issues: [{ key: "email", message: "Enter a valid email address." }],
      message: "Name or email.",
    });
    expect(submissionOutcome(400, null)).toMatchObject({ message: /highlighted fields/ });
    expect(submissionOutcome(404, null)).toMatchObject({ message: /no longer accepting/ });
    expect(submissionOutcome(429, null)).toMatchObject({ message: /in a minute/ });
    expect(submissionOutcome(500, "boom")).toMatchObject({ ok: false, issues: [] });
  });
});
