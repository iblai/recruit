"use client";

/**
 * Browser → this app's admin routes. Forwards the signed-in user's session
 * token (`Authorization: Token <dm_token>`) so the server can verify who is
 * calling and whether they administer the organization. Never the API key.
 */
import { LOCAL_STORAGE_KEYS } from "@/lib/iblai/auth-utils";

export class AdminRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

export async function adminFetch<T>(
  path: string,
  init: { method?: string; json?: unknown } = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_STORAGE_KEYS.DM_TOKEN) : null;
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      (data && typeof data.detail === "string" && data.detail) ||
      `Request failed (${res.status})`;
    throw new AdminRequestError(res.status, message, data);
  }
  return data as T;
}
