import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const projectRoot = resolve(__dirname, "..");
const read = (file: string) => readFileSync(join(projectRoot, file), "utf-8");

describe("house shell", () => {
  it("the top bar is the OS's: 64 px, the hairline, the system font", () => {
    const header =
      /<header className="([^"]+)"/.exec(read("components/crm/top-bar.tsx"))?.[1] ?? "";
    expect(header).toContain("h-16");
    expect(header).not.toMatch(/md:h-/);
    expect(header).toContain("border-[#D0E0FF]");
    expect(header).toContain("font-[ui-sans-serif,system-ui,sans-serif]");
  });

  it("the page renders Open Sans, with no !important body font left", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/--font-sans:\s*var\(--font-open-sans\)/);
    expect(css).toContain("--font-weight-semibold: 500;");
    expect(read("app/layout.tsx")).toContain("openSans.variable");
    expect(css).not.toMatch(/font-family:[^}]*!important/);
    expect(read("app/iblai-styles.css")).not.toMatch(/font-family:[^}]*!important/);
  });

  it("Lucide renders at 1.75 through one rule", () => {
    expect(read("app/globals.css")).toContain('.lucide[stroke-width="2"]');
  });
});
