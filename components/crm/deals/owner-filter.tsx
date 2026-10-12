"use client";

import { useMemo } from "react";
import { SimpleSelect } from "@/components/crm/simple-select";
import { memberLabel, useMembers } from "@/hooks/use-members";
import { useSession } from "@/hooks/use-session";

/**
 * Counselor (owner) filter for list toolbars. Same directory as `OwnerSelect`,
 * but the empty option reads "Any counselor" — in a filter, no owner means
 * "don't filter", not "unassigned".
 */
export function OwnerFilter({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (owner: number | null) => void;
  className?: string;
}) {
  const { tenantKey, userId, displayName } = useSession();
  const { members } = useMembers(tenantKey);

  const options = useMemo(() => {
    const opts = members.map((m) => ({ value: String(m.id), label: memberLabel(m) }));
    if (userId && !members.some((m) => m.id === userId)) {
      opts.unshift({ value: String(userId), label: `${displayName || "Me"} (me)` });
    }
    return opts;
  }, [members, userId, displayName]);

  return (
    <SimpleSelect
      value={value ? String(value) : ""}
      onChange={(v) => onChange(v ? Number(v) : null)}
      options={options}
      allowEmpty
      emptyLabel="Any counselor"
      placeholder="Any counselor"
      size="sm"
      className={className}
      aria-label="Counselor"
    />
  );
}
