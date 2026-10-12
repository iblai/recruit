import { describe, expect, it } from "vitest";
import { newLandingPage, planSubmission } from "../lib/recruit/landing-pages";
import { applySubmission } from "../lib/recruit/submission";

/** A tiny in-memory CRM that records what the submission does to it. */
function fakeCrm(existing?: {
  id: string;
  primary_email: string;
  metadata?: Record<string, unknown>;
}) {
  const log: string[] = [];
  let ids = 100;
  const crm = {
    log,
    findPersonByEmail: async (email: string) =>
      existing && existing.primary_email === email ? existing : undefined,
    createPerson: async (body: Record<string, unknown>) => {
      log.push(`createPerson:${body.name}:${body.organization ?? "-"}`);
      return { id: "p-new", ...body };
    },
    updatePerson: async (id: string, body: Record<string, unknown>) => {
      log.push(`updatePerson:${id}:${Object.keys(body).sort().join(",")}`);
      return { id, ...body };
    },
    findOrCreateOrganization: async (name: string) => {
      log.push(`school:${name}`);
      return { id: "school-1", name };
    },
    resolvePipeline: async (code?: string) => ({
      id: 1,
      code: code ?? "default",
      name: "Admissions",
      stages: [
        { id: 10, code: "inquiry", name: "Inquiry", sort_order: 0 },
        { id: 11, code: "applied", name: "Applied", sort_order: 1 },
        { id: 12, code: "enrolled", name: "Enrolled", sort_order: 2, is_won: true },
      ],
    }),
    findOrCreateLeadSource: async (code: string) => {
      log.push(`source:${code}`);
      return { id: 5, code, name: code };
    },
    createDeal: async (body: Record<string, unknown>) => {
      log.push(`createDeal:${body.stage}:${body.source}:${body.person}`);
      return { id: ++ids, ...body };
    },
    createActivity: async (body: Record<string, unknown>) => {
      log.push(`note:${body.person}:${body.deal ?? "-"}`);
      return { id: ++ids, ...body };
    },
    findOrCreateTag: async (name: string) => ({ id: name.length, name }),
    attachTag: async (host: string, id: string | number, tagId: number) => {
      log.push(`tag:${host}:${id}:${tagId}`);
    },
  };
  return crm;
}

const page = newLandingPage({
  title: "Request information",
  tags: ["Web inquiry"],
  stageCode: "applied",
  pipelineCode: "admissions",
});
const answers = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.edu",
  school: "Lincoln High School",
};

describe("applySubmission", () => {
  it("creates school, prospect, tags, application in the configured stage, and a note", async () => {
    const crm = fakeCrm();
    const out = await applySubmission(crm as never, page, planSubmission(page, answers));
    expect(out).toMatchObject({ personId: "p-new", personCreated: true, schoolId: "school-1" });
    expect(out.applicationId).toBeGreaterThan(100);
    expect(crm.log).toEqual([
      "school:Lincoln High School",
      "createPerson:Ada Lovelace:school-1",
      "tag:persons:p-new:11",
      "source:landing-request-information",
      "createDeal:11:5:p-new",
      `tag:deals:${out.applicationId}:11`,
      `note:p-new:${out.applicationId}`,
    ]);
  });

  it("reuses an existing prospect by email instead of duplicating", async () => {
    const crm = fakeCrm({ id: "p-old", primary_email: "ada@example.edu", metadata: { gpa: 3.9 } });
    const out = await applySubmission(crm as never, page, planSubmission(page, answers));
    expect(out.personCreated).toBe(false);
    expect(out.personId).toBe("p-old");
    expect(crm.log[1]).toMatch(/^updatePerson:p-old:/);
    expect(crm.log.some((l) => l.startsWith("createPerson"))).toBe(false);
  });

  it("skips the application when the page says prospect-only", async () => {
    const crm = fakeCrm();
    const noApp = { ...page, createApplication: false };
    const out = await applySubmission(crm as never, noApp, planSubmission(noApp, answers));
    expect(out.applicationId).toBeUndefined();
    expect(crm.log.some((l) => l.startsWith("createDeal"))).toBe(false);
    expect(crm.log.at(-1)).toBe("note:p-new:-");
  });
});
