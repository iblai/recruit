import { describe, expect, it } from "vitest";
import {
  defaultFields,
  landingPageUrl,
  newLandingPage,
  pickUtm,
  planSubmission,
  slugify,
  validateLandingPage,
  validateSubmission,
} from "../lib/recruit/landing-pages";

describe("newLandingPage", () => {
  it("derives a slug and the standard inquiry form", () => {
    const page = newLandingPage({ title: "Fall 2027 Nursing Open House!" });
    expect(page.slug).toBe("fall-2027-nursing-open-house");
    expect(page.fields.map((f) => f.mapTo)).toContain("email");
    expect(page.published).toBe(false);
    expect(page.sourceCode).toBe("landing-fall-2027-nursing-open-house");
    expect(validateLandingPage(page)).toEqual([]);
  });

  it("slugify strips accents and punctuation", () => {
    expect(slugify("Café & Résumé — Night")).toBe("cafe-resume-night");
    expect(slugify("  --weird--  ")).toBe("weird");
  });
});

describe("validateLandingPage", () => {
  it("requires an email mapping and a name mapping", () => {
    const page = newLandingPage({
      title: "Bad",
      fields: [{ key: "q", label: "Question", type: "text", mapTo: "none" }],
    });
    const issues = validateLandingPage(page).map((i) => i.message);
    expect(issues.some((m) => /Email/.test(m))).toBe(true);
    expect(issues.some((m) => /Name/.test(m))).toBe(true);
  });

  it("rejects duplicate keys, bad slugs and empty selects", () => {
    const page = newLandingPage({ title: "x", slug: "Bad Slug" });
    page.fields.push({ key: "email", label: "Dup", type: "select", options: [] });
    const issues = validateLandingPage(page)
      .map((i) => i.message)
      .join(" | ");
    expect(issues).toMatch(/lowercase/);
    expect(issues).toMatch(/used twice/);
    expect(issues).toMatch(/needs options/);
  });
});

describe("validateSubmission", () => {
  const page = newLandingPage({ title: "Request information" });
  it("flags missing required fields and bad emails", () => {
    const issues = validateSubmission(page, { first_name: "", email: "nope" });
    expect(issues.find((i) => i.key === "first_name")?.message).toMatch(/required/);
    expect(issues.find((i) => i.key === "last_name")).toBeTruthy();
    expect(issues.find((i) => i.key === "email")?.message).toMatch(/valid email/);
  });
  it("accepts a complete answer set and enforces select options", () => {
    const ok = validateSubmission(page, {
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.edu",
    });
    expect(ok).toEqual([]);
    const bad = validateSubmission(page, {
      first_name: "A",
      last_name: "B",
      email: "a@b.co",
      graduation_year: "1999",
    });
    expect(bad.find((i) => i.key === "graduation_year")).toBeTruthy();
  });
});

describe("planSubmission", () => {
  const page = newLandingPage({
    title: "Request information",
    program: "",
    term: "Fall 2027",
    tags: ["Web inquiry"],
  });
  const answers = {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ADA@Example.edu",
    phone: "+1 512 555 0100",
    school: "Lincoln High School",
    graduation_year: defaultFields().find((f) => f.key === "graduation_year")!.options![1],
    program: "B.S. Computer Science",
    message: "Do you offer merit scholarships?",
    sms_consent: true,
  };

  it("maps answers onto the prospect, the school and the application", () => {
    const plan = planSubmission(page, answers, {
      utm: { utm_source: "qr" },
      pageUrl: "https://x/p/o/s",
    });
    expect(plan.person.name).toBe("Ada Lovelace");
    expect(plan.person.primary_email).toBe("ada@example.edu");
    expect(plan.person.contact_numbers).toEqual(["+1 512 555 0100"]);
    expect(plan.person.job_title).toBe("B.S. Computer Science");
    expect(plan.person.lifecycle_stage).toBe("lead");
    expect(plan.person.metadata.sms_consent).toBe(true);
    expect(plan.person.metadata.entry_term).toBe("Fall 2027");
    expect(plan.person.metadata.utm).toEqual({ utm_source: "qr" });
    expect(plan.person.metadata.source_landing_page).toBe(page.slug);
    expect(plan.schoolName).toBe("Lincoln High School");
    expect(plan.application?.title).toBe("Ada Lovelace — B.S. Computer Science · Fall 2027");
    expect(plan.application?.description).toBe("Do you offer merit scholarships?");
    expect(plan.application?.pipelineCode).toBe("default");
    expect(plan.application?.metadata).toMatchObject({
      program: "B.S. Computer Science",
      term: "Fall 2027",
    });
    expect(plan.note.comment).toContain("Email: ADA@Example.edu");
    expect(plan.note.comment).toContain("Page: https://x/p/o/s");
    expect(plan.tags).toEqual(["Web inquiry"]);
  });

  it("falls back to the email as the name and skips the application when disabled", () => {
    const noApp = { ...page, createApplication: false };
    const plan = planSubmission(noApp, { email: "solo@example.edu" });
    expect(plan.person.name).toBe("solo@example.edu");
    expect(plan.application).toBeUndefined();
  });

  it("keeps unmapped answers in metadata under their own key", () => {
    const custom = newLandingPage({
      title: "Custom",
      fields: [
        { key: "name", label: "Name", type: "text", mapTo: "name", required: true },
        { key: "email", label: "Email", type: "email", mapTo: "email", required: true },
        {
          key: "t_shirt",
          label: "T-shirt size",
          type: "select",
          options: ["S", "M", "L"],
          mapTo: "none",
        },
      ],
    });
    const plan = planSubmission(custom, { name: "A B", email: "a@b.co", t_shirt: "M" });
    expect(plan.person.metadata.t_shirt).toBe("M");
  });
});

describe("helpers", () => {
  it("builds public urls and keeps only utm_* params", () => {
    expect(landingPageUrl("https://recruit.example.edu/", "north field", "open-house")).toBe(
      "https://recruit.example.edu/p/north%20field/open-house",
    );
    expect(
      pickUtm(new URLSearchParams("utm_source=qr&utm_medium=print&token=secret&UTM_CAMPAIGN=fair")),
    ).toEqual({
      utm_source: "qr",
      utm_medium: "print",
      utm_campaign: "fair",
    });
  });
});
