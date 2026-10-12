/**
 * Server-only access to the ibl.ai platform REST API.
 *
 * Two credentials exist and they must never be confused:
 *  - the org's Platform API Token (`IBLAI_API_KEY`, or one entry of the
 *    `IBLAI_API_KEYS` map) — the org's own authority. Sent as
 *    `Authorization: Api-Token …`. Only from route handlers / server code;
 *    the browser never sees it.
 *  - the signed-in user's session `dm_token` — the browser forwards it as
 *    `Authorization: Token …` so the server can learn *who* is calling
 *    (verifyCaller) and whether they administer the org (requireAdmin).
 *
 * Relative imports on purpose: vitest resolves no `@/` alias for lib files.
 */
import { NextResponse } from "next/server";
import config from "./config";

export class PlatformError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `Platform request failed (${status})`);
    this.name = "PlatformError";
  }
}

export type PlatformInit = Omit<RequestInit, "body" | "headers"> & {
  headers?: Record<string, string>;
  /** JSON-encoded when it is not a string / FormData. */
  body?: unknown;
  /** The organization whose Platform API Token signs the request. */
  org?: string;
};

/** `https://api.<domain>` — the consolidated gateway every REST family hangs off. */
export function platformBase(): string {
  // dmUrl() is `<base>/dm` on hosted iblai.app; strip the service prefix.
  return config.dmUrl().replace(/\/(dm|lms|axd)$/, "");
}

/**
 * The Platform API Token that acts for `org`.
 *
 * `IBLAI_API_KEYS` (a JSON map of org key → token) wins when it names the
 * org; otherwise `IBLAI_API_KEY` is used for every org — the common case of
 * one institution deploying the app for its own organization. Returns "" when
 * the server holds no key for that org.
 */
export function apiKeyFor(org?: string): string {
  const raw = config.apiKeys();
  if (raw && org) {
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const hit = map?.[org];
      if (typeof hit === "string" && hit.trim()) return hit.trim();
    } catch {
      // A malformed map is a deployment mistake; fall through to the single key.
    }
  }
  return config.apiKey();
}

/** Every org the server holds a key for (for status screens; never the keys). */
export function serverConfiguredOrgs(): string[] {
  const raw = config.apiKeys();
  if (!raw) return [];
  try {
    return Object.keys(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return [];
  }
}

/**
 * fetch() the platform as the org (Api-Token). `path` starts with `/dm/…`,
 * `/lms/…`, or `/axd/…`. Non-2xx throws PlatformError with the parsed body.
 */
export async function platformFetch<T = unknown>(
  path: string,
  init: PlatformInit = {},
): Promise<T> {
  const { body, headers, org, ...rest } = init;
  const key = apiKeyFor(org);
  if (!key)
    throw new PlatformError(
      500,
      null,
      org
        ? `No Platform API Token is configured for organization "${org}" (IBLAI_API_KEY / IBLAI_API_KEYS)`
        : "IBLAI_API_KEY is not set on the server",
    );
  const isJson = body !== undefined && typeof body !== "string" && !(body instanceof FormData);
  const res = await fetch(`${platformBase()}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      Authorization: `Api-Token ${key}`,
      Accept: "application/json",
      ...(isJson && { "Content-Type": "application/json" }),
      ...headers,
    },
    body: isJson ? JSON.stringify(body) : (body as BodyInit | undefined),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new PlatformError(res.status, data ?? text);
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The `Token <dm_token>` the browser forwarded, or "". */
export function callerToken(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Token\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : "";
}

export type Caller = { username: string; token: string };

/**
 * Who is calling: verifies the forwarded session token against the platform
 * and returns the username. `null` when there is no token or it is rejected.
 */
export async function verifyCaller(req: Request): Promise<Caller | null> {
  const token = callerToken(req);
  if (!token) return null;
  const res = await fetch(`${platformBase()}/dm/api/core/token/verify/`, {
    headers: { Authorization: `Token ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { username?: string } | null;
  return data?.username ? { username: data.username, token } : null;
}

type PlatformUser = { username?: string; is_admin?: boolean; active?: boolean };

/** Is `username` an admin of `org`? Asked with the org's authority. */
export async function isOrgAdmin(username: string, org: string): Promise<boolean> {
  const q = new URLSearchParams({
    platform_key: org,
    platform_org: org,
    query: username,
    page: "1",
    page_size: "10",
  });
  const data = await platformFetch<{ results?: PlatformUser[] }>(
    `/dm/api/core/platform/users/?${q.toString()}`,
    { org },
  );
  return !!data?.results?.find((u) => u.username === username)?.is_admin;
}

/**
 * The caller, provided they administer `org` — else the 401/403 response
 * the route should return as-is.
 */
export async function requireAdmin(req: Request, org: string): Promise<Caller | NextResponse> {
  if (!org) return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await isOrgAdmin(caller.username, org)))
    return NextResponse.json({ error: "Only organization admins can do this" }, { status: 403 });
  return caller;
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

/** Map a PlatformError to the response the browser should see; rethrow anything else. */
export function platformFailure(e: unknown): NextResponse {
  if (e instanceof PlatformError) {
    const passthrough = new Set([400, 401, 403, 404, 409, 422, 429]);
    const status = passthrough.has(e.status) ? e.status : e.status >= 500 ? 502 : e.status;
    const body =
      e.body && typeof e.body === "object" ? e.body : { error: String(e.body ?? e.message) };
    return NextResponse.json(body, { status: status || 502 });
  }
  throw e;
}

/** Parse a JSON body; garbage is `{}` so field checks 400 instead of crashing. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
