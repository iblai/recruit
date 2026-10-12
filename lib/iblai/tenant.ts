/**
 * Organization (tenant) resolution for ibl.ai/crm — a MULTI-ORGANIZATION app.
 *
 * The organization the user is working in comes from the URL
 * (`/platform/[tenantKey]/…`). This module only answers "which org should we
 * land on when the URL names none?" and "is the signed-in user an admin of
 * org X?" from what the sign-in stored in localStorage:
 *
 *   - `tenants`         every org the user belongs to (`key`, `is_admin`, …)
 *   - `current_tenant`  the org the session is scoped to (JSON object or key)
 *   - `tenant`          the org key the SDK last authenticated into
 *   - `userData`        the signed-in user (`user_nicename`, `user_email`, …)
 *
 * Relative import (not @/): vitest resolves no alias for lib files.
 */
import config from "./config";

export const PLATFORM_ROUTE_PREFIX = "/platform";

export type TenantEntry = {
  key: string;
  is_admin?: boolean;
  org?: string;
  name?: string;
  platform_name?: string;
  show_paywall?: boolean;
  [k: string]: unknown;
};

export type UserData = {
  user_id?: number;
  user_nicename?: string;
  user_email?: string;
  user_display_name?: string;
  user_fullname?: string | null;
  [k: string]: unknown;
};

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    if (typeof window.localStorage?.getItem !== "function") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The orgs the sign-in handed the browser (`tenants`), or [] when signed out. */
export function readTenants(): TenantEntry[] {
  const store = ls();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem("tenants") ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The signed-in user, or null. */
export function readUserData(): UserData | null {
  const store = ls();
  if (!store) return null;
  try {
    const raw = store.getItem("userData");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function readUsername(): string {
  return readUserData()?.user_nicename ?? "";
}

export function readUserEmail(): string {
  return readUserData()?.user_email ?? "";
}

export function readUserId(): number | null {
  const id = readUserData()?.user_id;
  return typeof id === "number" ? id : null;
}

/**
 * The org key the current session is scoped to. `current_tenant` is written
 * as a JSON object by the SDK (SsoLogin / TenantProvider) but tolerate a bare
 * key as well; fall back to the SDK's `tenant` key.
 */
export function readCurrentTenantKey(): string {
  const store = ls();
  if (!store) return "";
  const raw = store.getItem("current_tenant");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
        return parsed.key;
      }
      if (typeof parsed === "string") return parsed;
    } catch {
      return raw;
    }
  }
  return store.getItem("tenant") ?? "";
}

/** The `tenants` entry for an org, if the user belongs to it. */
export function findTenant(tenantKey: string): TenantEntry | undefined {
  return readTenants().find((t) => t.key === tenantKey);
}

/** Whether the signed-in user is an admin of `tenantKey`. */
export function isTenantAdmin(tenantKey: string): boolean {
  return !!findTenant(tenantKey)?.is_admin;
}

/** Whether the signed-in user belongs to `tenantKey`. */
export function isTenantMember(tenantKey: string): boolean {
  return !!findTenant(tenantKey);
}

/**
 * Where to land when the URL names no organization: the session's org, then
 * the SDK's last org, then the first non-community org the user belongs to,
 * then the community org (`NEXT_PUBLIC_MAIN_TENANT_KEY`, default `main`).
 */
export function resolveDefaultTenant(): string {
  const current = readCurrentTenantKey();
  if (current) return current;
  const tenants = readTenants();
  const main = config.mainTenantKey();
  const firstOwn = tenants.find((t) => t.key && t.key !== main);
  if (firstOwn) return firstOwn.key;
  if (tenants[0]?.key) return tenants[0].key;
  return main;
}

/** Path of a page inside an organization: `/platform/<org>/<path>`. */
export function tenantHref(tenantKey: string, path = ""): string {
  const clean = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${PLATFORM_ROUTE_PREFIX}/${encodeURIComponent(tenantKey)}${clean}`;
}

/** Extract the org key from a pathname, or null when it is not an org route. */
export function tenantKeyFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/platform\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Organizations created programmatically often carry a generated key as their
 * name (`2c0da5f7216d4b639f7a2b200307ebd2`). That is an identifier, not a name
 * — never show it as one.
 */
export function isHashLike(value?: string | null): boolean {
  if (!value) return false;
  return (
    /^[0-9a-f]{20,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/** A short, readable id for an org key (`2c0da5f7`), for secondary lines. */
export function shortTenantKey(key?: string | null): string {
  if (!key) return "";
  return isHashLike(key) ? key.slice(0, 8) : key;
}

/**
 * Display name for an org: its real name when it has one, otherwise a friendly
 * label ("Organization"). Pair with `shortTenantKey` in lists where several
 * unnamed organizations must stay distinguishable.
 */
export function tenantDisplayName(t?: TenantEntry | null): string {
  if (!t) return "";
  const candidates = [t.platform_name, t.name, t.org, t.key] as Array<string | undefined>;
  const named = candidates.find((c) => c && !isHashLike(c));
  return named ?? "Organization";
}

/** `true` when the org has no human name (its label is the generic fallback). */
export function isUnnamedTenant(t?: TenantEntry | null): boolean {
  if (!t) return false;
  return tenantDisplayName(t) === "Organization";
}
