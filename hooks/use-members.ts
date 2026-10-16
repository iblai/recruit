"use client";

import { useMemo } from "react";
import { useListMembersQuery } from "@/lib/crm/api";
import type { PlatformMember } from "@/lib/crm/types";

/**
 * The organization's members — for owner pickers and for showing who owns a
 * record. Reads the CRM's member list, open to every CRM role; emails come
 * back only for callers who may list the platform's users.
 */
export function useMembers(tenantKey: string, options?: { skip?: boolean }) {
  const { data, isLoading, isError } = useListMembersQuery(undefined, {
    skip: !tenantKey || options?.skip,
  });

  const members = useMemo<PlatformMember[]>(
    () =>
      (data ?? []).map((m) => ({
        id: m.id,
        username: m.username ?? "",
        email: m.email,
        name: m.name || undefined,
        is_admin: m.is_admin,
      })),
    [data],
  );

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return { members, byId, isLoading, isError };
}

export function memberLabel(member?: PlatformMember | null, fallbackId?: number | null) {
  if (member) return member.name || member.username || member.email || `User ${member.id}`;
  if (fallbackId) return `User #${fallbackId}`;
  return "Unassigned";
}
