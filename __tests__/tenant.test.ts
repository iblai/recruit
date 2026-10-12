import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/iblai/tenant.ts` reads the browser session out of localStorage, so
 * every test stubs a tiny store and re-imports the module.
 */
let store: Record<string, string> = {};

function stubBrowser() {
  store = {};
  const ls = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("localStorage", ls);
}

async function loadTenant() {
  vi.resetModules();
  return import("../lib/iblai/tenant");
}

beforeEach(() => {
  stubBrowser();
  delete process.env.NEXT_PUBLIC_MAIN_TENANT_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readTenants", () => {
  it("returns the stored organizations", async () => {
    store.tenants = JSON.stringify([{ key: "acme" }, { key: "globex" }]);
    const { readTenants } = await loadTenant();
    expect(readTenants().map((t) => t.key)).toEqual(["acme", "globex"]);
  });

  it("returns [] when nothing is stored", async () => {
    const { readTenants } = await loadTenant();
    expect(readTenants()).toEqual([]);
  });

  it("returns [] for corrupt JSON", async () => {
    store.tenants = "{not json";
    const { readTenants } = await loadTenant();
    expect(readTenants()).toEqual([]);
  });

  it("returns [] when the stored value is not an array", async () => {
    store.tenants = JSON.stringify({ key: "acme" });
    const { readTenants } = await loadTenant();
    expect(readTenants()).toEqual([]);
  });

  it("returns [] with no browser at all", async () => {
    vi.unstubAllGlobals();
    const { readTenants } = await loadTenant();
    expect(readTenants()).toEqual([]);
  });
});

describe("isTenantAdmin / isTenantMember", () => {
  beforeEach(() => {
    store.tenants = JSON.stringify([
      { key: "acme", is_admin: true },
      { key: "globex", is_admin: false },
      { key: "initech" },
    ]);
  });

  it("is true only for orgs the user administers", async () => {
    const { isTenantAdmin } = await loadTenant();
    expect(isTenantAdmin("acme")).toBe(true);
    expect(isTenantAdmin("globex")).toBe(false);
    expect(isTenantAdmin("initech")).toBe(false);
    expect(isTenantAdmin("nope")).toBe(false);
  });

  it("is true for every org the user belongs to", async () => {
    const { isTenantMember } = await loadTenant();
    expect(isTenantMember("acme")).toBe(true);
    expect(isTenantMember("globex")).toBe(true);
    expect(isTenantMember("initech")).toBe(true);
    expect(isTenantMember("nope")).toBe(false);
  });
});

describe("readCurrentTenantKey", () => {
  it("reads the key out of the JSON object the SDK writes", async () => {
    store.current_tenant = JSON.stringify({ key: "acme", name: "Acme Inc" });
    const { readCurrentTenantKey } = await loadTenant();
    expect(readCurrentTenantKey()).toBe("acme");
  });

  it("accepts a JSON string", async () => {
    store.current_tenant = JSON.stringify("acme");
    const { readCurrentTenantKey } = await loadTenant();
    expect(readCurrentTenantKey()).toBe("acme");
  });

  it("accepts a bare key that is not JSON at all", async () => {
    store.current_tenant = "acme";
    const { readCurrentTenantKey } = await loadTenant();
    expect(readCurrentTenantKey()).toBe("acme");
  });

  it("falls back to the SDK's `tenant` key", async () => {
    store.tenant = "globex";
    const { readCurrentTenantKey } = await loadTenant();
    expect(readCurrentTenantKey()).toBe("globex");
  });

  it("falls back to `tenant` when current_tenant carries no key", async () => {
    store.current_tenant = JSON.stringify({ name: "No key here" });
    store.tenant = "globex";
    const { readCurrentTenantKey } = await loadTenant();
    expect(readCurrentTenantKey()).toBe("globex");
  });

  it("returns an empty string when the browser knows nothing", async () => {
    const { readCurrentTenantKey } = await loadTenant();
    expect(readCurrentTenantKey()).toBe("");
  });
});

describe("resolveDefaultTenant", () => {
  it("prefers the session's organization", async () => {
    store.current_tenant = JSON.stringify({ key: "acme" });
    store.tenant = "globex";
    store.tenants = JSON.stringify([{ key: "initech" }]);
    const { resolveDefaultTenant } = await loadTenant();
    expect(resolveDefaultTenant()).toBe("acme");
  });

  it("falls back to the SDK's last organization", async () => {
    store.tenant = "globex";
    store.tenants = JSON.stringify([{ key: "initech" }]);
    const { resolveDefaultTenant } = await loadTenant();
    expect(resolveDefaultTenant()).toBe("globex");
  });

  it("then picks the first organization that is not the community org", async () => {
    store.tenants = JSON.stringify([{ key: "main" }, { key: "initech" }, { key: "acme" }]);
    const { resolveDefaultTenant } = await loadTenant();
    expect(resolveDefaultTenant()).toBe("initech");
  });

  it("then falls back to the first organization, community or not", async () => {
    store.tenants = JSON.stringify([{ key: "main" }]);
    const { resolveDefaultTenant } = await loadTenant();
    expect(resolveDefaultTenant()).toBe("main");
  });

  it("lands on the community org when the user belongs to none", async () => {
    const { resolveDefaultTenant } = await loadTenant();
    expect(resolveDefaultTenant()).toBe("main");
  });

  it("honors a custom community org key", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "community";
    store.tenants = JSON.stringify([{ key: "community" }, { key: "acme" }]);
    const { resolveDefaultTenant } = await loadTenant();
    expect(resolveDefaultTenant()).toBe("acme");
  });
});

describe("tenantHref", () => {
  it("builds an org-scoped path", async () => {
    const { tenantHref } = await loadTenant();
    expect(tenantHref("acme", "/activities")).toBe("/platform/acme/activities");
  });

  it("adds the missing leading slash", async () => {
    const { tenantHref } = await loadTenant();
    expect(tenantHref("acme", "activities")).toBe("/platform/acme/activities");
  });

  it("returns the org root for an empty path", async () => {
    const { tenantHref } = await loadTenant();
    expect(tenantHref("acme")).toBe("/platform/acme");
    expect(tenantHref("acme", "")).toBe("/platform/acme");
  });

  it("encodes the organization key", async () => {
    const { tenantHref } = await loadTenant();
    expect(tenantHref("my org", "/tags")).toBe("/platform/my%20org/tags");
    expect(tenantHref("a/b")).toBe("/platform/a%2Fb");
  });
});

describe("tenantKeyFromPath", () => {
  it("reads the org out of an org route", async () => {
    const { tenantKeyFromPath } = await loadTenant();
    expect(tenantKeyFromPath("/platform/acme")).toBe("acme");
    expect(tenantKeyFromPath("/platform/acme/deals/12")).toBe("acme");
  });

  it("decodes the key", async () => {
    const { tenantKeyFromPath } = await loadTenant();
    expect(tenantKeyFromPath("/platform/my%20org/tags")).toBe("my org");
  });

  it("returns null when the path names no org", async () => {
    const { tenantKeyFromPath } = await loadTenant();
    expect(tenantKeyFromPath("/")).toBeNull();
    expect(tenantKeyFromPath("/platform/")).toBeNull();
    expect(tenantKeyFromPath("/error/403")).toBeNull();
  });
});

describe("tenantDisplayName", () => {
  it("prefers the platform name, then name, then org, then key", async () => {
    const { tenantDisplayName } = await loadTenant();
    expect(
      tenantDisplayName({ key: "acme", org: "ACME", name: "Acme", platform_name: "Acme Inc" }),
    ).toBe("Acme Inc");
    expect(tenantDisplayName({ key: "acme", org: "ACME", name: "Acme" })).toBe("Acme");
    expect(tenantDisplayName({ key: "acme", org: "ACME" })).toBe("ACME");
    expect(tenantDisplayName({ key: "acme" })).toBe("acme");
  });

  it("is empty for no organization", async () => {
    const { tenantDisplayName } = await loadTenant();
    expect(tenantDisplayName(null)).toBe("");
    expect(tenantDisplayName(undefined)).toBe("");
  });
});
