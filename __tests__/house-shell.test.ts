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

  it("the shell and the Chief of Staff panel fit the phone's safe area", () => {
    const layout = read("app/(app)/platform/[tenantKey]/layout.tsx");
    expect(layout).toMatch(/<SidebarProvider\s+defaultOpen=\{defaultOpen\}\s+className="min-h-0"/);
    expect(layout).toMatch(/<SidebarInset\s+asChild/);
    expect(layout).toContain(
      "h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]",
    );
    expect(layout).not.toContain("h-dvh");
    const panel = read("components/recruit/chief-of-staff/assistant-panel.tsx");
    expect(panel).toContain("pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]");
    expect(panel).toContain("md:py-0");
  });
});
