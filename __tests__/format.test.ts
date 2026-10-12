import { addDays, format as formatDate } from "date-fns";
import { describe, expect, it } from "vitest";

import {
  avatarColor,
  contrastText,
  dealValue,
  formatCompactCurrency,
  formatCurrency,
  initials,
  pluralize,
  scheduleLabel,
  sortStages,
  tagStyle,
  truncate,
  weightedValue,
} from "../lib/crm/format";

/** Noon today / tomorrow, so the assertions never straddle midnight. */
function atNoon(offsetDays = 0) {
  const d = addDays(new Date(), offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

describe("formatCurrency", () => {
  it("drops the cents on whole amounts", () => {
    expect(formatCurrency("1500.00")).toBe("$1,500");
    expect(formatCurrency(1500)).toBe("$1,500");
  });

  it("keeps two decimals when the amount has cents", () => {
    expect(formatCurrency("1500.50")).toBe("$1,500.50");
    expect(formatCurrency(0.5)).toBe("$0.50");
  });

  it("honors the currency code", () => {
    expect(formatCurrency("1234.56", "EUR")).toBe("€1,234.56");
  });

  it("falls back to USD for an empty currency", () => {
    expect(formatCurrency(10, "")).toBe("$10");
  });

  it("returns an em dash for values that are not numbers", () => {
    expect(formatCurrency("not-a-number")).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("treats null and undefined as zero", () => {
    expect(formatCurrency(null)).toBe("$0");
    expect(formatCurrency(undefined)).toBe("$0");
  });

  it("degrades gracefully for an invalid currency code", () => {
    expect(formatCurrency(12, "NOT_A_CODE")).toBe("NOT_A_CODE 12.00");
  });
});

describe("formatCompactCurrency", () => {
  it("compacts large amounts", () => {
    expect(formatCompactCurrency(1_500_000)).toBe("$1.5M");
    expect(formatCompactCurrency(12_000)).toBe("$12K");
  });

  it("leaves small amounts readable", () => {
    expect(formatCompactCurrency(950)).toBe("$950");
  });

  it("degrades gracefully for an invalid currency code", () => {
    expect(formatCompactCurrency(1200, "NOT_A_CODE")).toBe("NOT_A_CODE 1200");
  });
});

describe("scheduleLabel", () => {
  it("has a muted 'Unscheduled' label with no date", () => {
    expect(scheduleLabel(undefined)).toEqual({ label: "Unscheduled", tone: "muted" });
    expect(scheduleLabel(null)).toEqual({ label: "Unscheduled", tone: "muted" });
    expect(scheduleLabel("")).toEqual({ label: "Unscheduled", tone: "muted" });
  });

  it("marks today with the brand tone", () => {
    const { label, tone } = scheduleLabel(atNoon(0));
    expect(tone).toBe("today");
    expect(label.startsWith("Today · ")).toBe(true);
  });

  it("marks tomorrow as soon", () => {
    const { label, tone } = scheduleLabel(atNoon(1));
    expect(tone).toBe("soon");
    expect(label.startsWith("Tomorrow · ")).toBe(true);
  });

  it("marks a past, open item as overdue", () => {
    const { label, tone } = scheduleLabel("2020-01-02T12:00:00.000Z");
    expect(tone).toBe("overdue");
    expect(label.startsWith("Overdue · ")).toBe(true);
  });

  it("does not call a done item overdue", () => {
    const { label, tone } = scheduleLabel("2020-01-02T12:00:00.000Z", true);
    expect(tone).toBe("muted");
    expect(label).toContain("2020");
  });

  it("shows a plain date for a future item", () => {
    const future = atNoon(30);
    expect(scheduleLabel(future)).toEqual({
      label: formatDate(new Date(future), "MMM d, yyyy"),
      tone: "muted",
    });
  });
});

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  Ada   Byron   King  ")).toBe("AK");
  });

  it("uses the first two letters of a single name", () => {
    expect(initials("Ada")).toBe("AD");
    expect(initials("x")).toBe("X");
  });

  it("falls back to a question mark", () => {
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("avatarColor", () => {
  it("is stable for the same seed", () => {
    expect(avatarColor("acme-inc")).toBe(avatarColor("acme-inc"));
    expect(avatarColor(42)).toBe(avatarColor(42));
  });

  it("always returns a palette hex", () => {
    const seeds: Array<string | number | null | undefined> = [
      "a",
      "bb",
      "ccc",
      1,
      2,
      3,
      null,
      undefined,
    ];
    for (const seed of seeds) {
      expect(avatarColor(seed)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("spreads different seeds across the palette", () => {
    const seen = new Set(
      ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"].map((s) =>
        avatarColor(s),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("contrastText", () => {
  it("picks dark text on light backgrounds", () => {
    expect(contrastText("#ffffff")).toBe("#111827");
    expect(contrastText("#ffff00")).toBe("#111827");
  });

  it("picks white text on dark backgrounds", () => {
    expect(contrastText("#0058cc")).toBe("#ffffff");
    expect(contrastText("#000000")).toBe("#ffffff");
  });

  it("accepts uppercase hex", () => {
    expect(contrastText("#0058CC")).toBe("#ffffff");
  });

  it("falls back to dark text for anything that is not a 6-digit hex", () => {
    expect(contrastText(undefined)).toBe("#111827");
    expect(contrastText("")).toBe("#111827");
    expect(contrastText("#fff")).toBe("#111827");
    expect(contrastText("rebeccapurple")).toBe("#111827");
  });
});

describe("tagStyle", () => {
  it("tints the background and keeps the color", () => {
    expect(tagStyle({ color: "#0058cc" })).toEqual({
      backgroundColor: "#0058cc1f",
      color: "#0058cc",
      borderColor: "#0058cc55",
    });
  });

  it("falls back to grey for a bad hex", () => {
    expect(tagStyle({ color: "blue" })).toEqual({
      backgroundColor: "#8888881f",
      color: "#888888",
      borderColor: "#88888855",
    });
    expect(tagStyle({ color: "" }).color).toBe("#888888");
    expect(tagStyle({ color: "#12345" }).color).toBe("#888888");
  });
});

describe("dealValue / weightedValue", () => {
  it("parses the decimal string", () => {
    expect(dealValue({ lead_value: "1500.50" })).toBe(1500.5);
  });

  it("treats a missing or unparseable value as zero", () => {
    expect(dealValue({})).toBe(0);
    expect(dealValue({ lead_value: undefined })).toBe(0);
    expect(dealValue({ lead_value: "abc" })).toBe(0);
  });

  it("weights by the stage probability", () => {
    expect(weightedValue({ lead_value: "1000" }, { probability: 40 })).toBe(400);
    expect(weightedValue({ lead_value: "1000" }, { probability: 100 })).toBe(1000);
  });

  it("weights to zero without a stage or probability", () => {
    expect(weightedValue({ lead_value: "1000" })).toBe(0);
    expect(weightedValue({ lead_value: "1000" }, {})).toBe(0);
  });
});

describe("sortStages", () => {
  it("orders by sort_order then id", () => {
    const stages = [
      { id: 3, sort_order: 2 },
      { id: 1, sort_order: 0 },
      { id: 2, sort_order: 2 },
    ];
    expect(sortStages(stages).map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("treats a missing sort_order as 0", () => {
    const stages = [{ id: 9, sort_order: 1 }, { id: 4 }];
    expect(sortStages(stages).map((s) => s.id)).toEqual([4, 9]);
  });

  it("does not mutate the input", () => {
    const stages = [
      { id: 2, sort_order: 1 },
      { id: 1, sort_order: 0 },
    ];
    const sorted = sortStages(stages);
    expect(stages.map((s) => s.id)).toEqual([2, 1]);
    expect(sorted).not.toBe(stages);
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => {
    expect(truncate("short")).toBe("short");
    expect(truncate("exactly-ten", 11)).toBe("exactly-ten");
  });

  it("ellipsizes longer strings to the max length", () => {
    const long = "a".repeat(70);
    const out = truncate(long);
    expect(out).toHaveLength(60);
    expect(out.endsWith("…")).toBe(true);
  });

  it("respects a custom max", () => {
    expect(truncate("abcdefgh", 4)).toBe("abc…");
  });

  it("returns an empty string for nothing", () => {
    expect(truncate(undefined)).toBe("");
    expect(truncate(null)).toBe("");
    expect(truncate("")).toBe("");
  });
});

describe("pluralize", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralize(1, "deal")).toBe("1 deal");
  });

  it("uses the plural otherwise", () => {
    expect(pluralize(0, "deal")).toBe("0 deals");
    expect(pluralize(7, "deal")).toBe("7 deals");
  });

  it("accepts an irregular plural", () => {
    expect(pluralize(2, "person", "people")).toBe("2 people");
    expect(pluralize(1, "person", "people")).toBe("1 person");
  });
});
