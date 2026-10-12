"use client";

import { useMemo } from "react";
import { usePlatformUsersQuery } from "@iblai/iblai-js/data-layer";
import type { PlatformMember } from "@/lib/crm/types";

/**
 * The organization's members — for owner pickers and for showing who owns a
 * record. Reads the platform's user directory through the SDK (admins see the
 * full list; members may see a reduced one or none — callers must degrade to
 * showing a user id).
 */
export function useMembers(tenantKey: string, options?: { skip?: boolean; query?: string }) {
  const { data, isLoading, isError } = usePlatformUsersQuery(
    { platform_key: tenantKey, page_size: 200, query: options?.query },
    { skip: !tenantKey || options?.skip },
  );

  const members = useMemo<PlatformMember[]>(() => {
    const results = (data as { results?: unknown } | undefined)?.results;
    const rows: Array<Record<string, unknown>> = Array.isArray(results)
      ? (results as Array<Record<string, unknown>>)
      : Array.isArray((results as { data?: unknown[] } | undefined)?.data)
        ? (results as { data: Array<Record<string, unknown>> }).data
        : [];
    return rows
      .map((r) => ({
        id: Number(r.user_id ?? r.id),
        username: String(r.username ?? ""),
        email: typeof r.email === "string" ? r.email : undefined,
        name: typeof r.name === "string" && r.name ? r.name : undefined,
      }))
      .filter((m) => Number.isFinite(m.id));
  }, [data]);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return { members, byId, isLoading, isError };
}

export function memberLabel(member?: PlatformMember | null, fallbackId?: number | null) {
  if (member) return member.name || member.username || member.email || `User ${member.id}`;
  if (fallbackId) return `User #${fallbackId}`;
  return "Unassigned";
}
