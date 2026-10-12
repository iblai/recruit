import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `lib/iblai/platform.ts` resolves the org's Platform API Token from env at call time. */
async function load() {
  vi.resetModules();
  return import("../lib/iblai/platform");
}

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.IBLAI_API_KEY;
  delete process.env.IBLAI_API_KEYS;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("apiKeyFor", () => {
  it("prefers the per-org map and falls back to the single key", async () => {
    process.env.IBLAI_API_KEY = "single";
    process.env.IBLAI_API_KEYS = JSON.stringify({ northfield: "nf-key", westbrook: "wb-key" });
    const { apiKeyFor, serverConfiguredOrgs } = await load();
    expect(apiKeyFor("northfield")).toBe("nf-key");
    expect(apiKeyFor("other")).toBe("single");
    expect(apiKeyFor()).toBe("single");
    expect(serverConfiguredOrgs()).toEqual(["northfield", "westbrook"]);
  });
  it("tolerates a malformed map and returns empty when nothing is set", async () => {
    process.env.IBLAI_API_KEYS = "{not json";
    const { apiKeyFor, serverConfiguredOrgs } = await load();
    expect(apiKeyFor("x")).toBe("");
    expect(serverConfiguredOrgs()).toEqual([]);
  });
  it("platformFetch refuses to run without a key for the org", async () => {
    const { platformFetch, PlatformError } = await load();
    await expect(platformFetch("/dm/api/x", { org: "nobody" })).rejects.toBeInstanceOf(
      PlatformError,
    );
    await expect(platformFetch("/dm/api/x", { org: "nobody" })).rejects.toThrow(/nobody/);
  });
});
