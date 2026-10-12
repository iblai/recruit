import { describe, expect, it } from "vitest";
import {
  institutionBranding,
  mergeRecruitSettings,
  readRecruitSettings,
} from "../lib/recruit/org-settings";
import {
  applicationTitle,
  coerceMeta,
  entryTerms,
  graduationYears,
  metaLabel,
  PROSPECT_FIELDS,
  withMeta,
} from "../lib/recruit/fields";

describe("org settings namespace", () => {
  it("reads and merges apps.recruit without touching other keys", () => {
    const metadata = {
      help_center_url: "https://h",
      apps: { other: { x: 1 }, recruit: { agentId: "a" } },
    };
    expect(readRecruitSettings(metadata)).toEqual({ agentId: "a" });
    const merged = mergeRecruitSettings(metadata, { mcpServerId: 9 }, []);
    expect(merged.help_center_url).toBe("https://h");
    expect((merged.apps as Record<string, unknown>).other).toEqual({ x: 1 });
    expect((merged.apps as Record<string, unknown>).recruit).toEqual({
      agentId: "a",
      mcpServerId: 9,
    });
    expect(readRecruitSettings(mergeRecruitSettings(merged, {}, ["agentId"]))).toEqual({
      mcpServerId: 9,
    });
    expect(readRecruitSettings(null)).toEqual({});
  });

  it("derives branding with fallbacks", () => {
    expect(
      institutionBranding({ platform_name: "Northfield", logo: "https://l" }, "nf"),
    ).toMatchObject({ name: "Northfield", logoUrl: "https://l", accentColor: "#0058cc" });
    expect(
      institutionBranding(
        {
          apps: {
            recruit: { institutionName: "NU", accentColor: "#AbCdEf", contactEmail: "a@b.edu" },
          },
        },
        "nf",
      ),
    ).toMatchObject({ name: "NU", accentColor: "#AbCdEf", contactEmail: "a@b.edu" });
    expect(
      institutionBranding({ apps: { recruit: { accentColor: "red" } } }, "nf").accentColor,
    ).toBe("#0058cc");
    expect(institutionBranding({}, "nf").name).toBe("nf");
  });
});

describe("recruitment fields", () => {
  const grad = PROSPECT_FIELDS.find((f) => f.key === "graduation_year")!;
  const sms = PROSPECT_FIELDS.find((f) => f.key === "sms_consent")!;
  const gpa = PROSPECT_FIELDS.find((f) => f.key === "gpa")!;

  it("coerces by type and clears on empty", () => {
    expect(coerceMeta(gpa, "3.7")).toBe(3.7);
    expect(coerceMeta(gpa, "x")).toBeUndefined();
    expect(coerceMeta(sms, "true")).toBe(true);
    expect(coerceMeta(sms, "false")).toBe(false);
    expect(coerceMeta(grad, " 2027 ")).toBe("2027");
    expect(coerceMeta(grad, "")).toBeUndefined();
  });

  it("merges into metadata and labels values", () => {
    const m1 = withMeta({ other: 1 }, grad, "2027");
    expect(m1).toEqual({ other: 1, graduation_year: "2027" });
    expect(withMeta(m1, grad, "")).toEqual({ other: 1 });
    expect(metaLabel(sms, { sms_consent: true })).toBe("Yes");
    expect(metaLabel(grad, { graduation_year: "2027" })).toBe("2027");
    expect(
      metaLabel(
        PROSPECT_FIELDS.find((f) => f.key === "residency")!,
        { residency: "in_state" },
      ),
    ).toBe("In-state");
  });

  it("offers graduation years and entry terms", () => {
    expect(graduationYears(2026, 3).map((y) => y.value)).toEqual(["2026", "2027", "2028"]);
    const terms = entryTerms(new Date("2026-10-12")).map((t) => t.value);
    expect(terms[0]).toBe("Fall 2026");
    expect(terms[1]).toBe("Spring 2027");
    expect(terms).toHaveLength(8);
    expect(applicationTitle("Ada Lovelace", "B.S. CS", "Fall 2027")).toBe(
      "Ada Lovelace — B.S. CS · Fall 2027",
    );
    expect(applicationTitle("Ada Lovelace")).toBe("Ada Lovelace — Application");
  });
});
