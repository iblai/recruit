import { describe, expect, it } from "vitest";
import { fill, pickLocale, publicMessages } from "../lib/recruit/locale";

describe("pickLocale", () => {
  it("is the first of the visitor's languages we carry", () => {
    expect(pickLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(pickLocale("de-DE,de;q=0.9,fr;q=0.8,en;q=0.7")).toBe("fr");
    expect(pickLocale("en;q=0.5, zh-CN;q=0.9")).toBe("zh");
    expect(pickLocale("fr;q=0, es")).toBe("es");
  });

  it("is English for nothing we carry, or no header", () => {
    for (const header of ["de-DE,de;q=0.9", "", "*", null, undefined])
      expect(pickLocale(header)).toBe("en");
  });
});

describe("the public pages' words", () => {
  it("name the institution in the visitor's language", () => {
    expect(fill(publicMessages("es").chat.notice, { institution: "Northfield" })).toContain(
      "publicada por Northfield",
    );
    expect(fill("{a} and {missing}", { a: "x" })).toBe("x and ");
  });
});
