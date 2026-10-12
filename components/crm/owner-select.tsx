"use client";

import { useMemo } from "react";
import { SimpleSelect } from "@/components/crm/simple-select";
import { memberLabel, useMembers } from "@/hooks/use-members";
import { useSession } from "@/hooks/use-session";

/**
 * Pick the counselor (the platform user who owns a record). Lists the
 * organization's members when the directory is readable; always offers "me"
 * so a member without directory access can still claim a record.
 */
export function OwnerSelect({
  value,
  onChange,
  size = "default",
  className,
  disabled,
  emptyLabel = "Unassigned",
}: {
  value: number | null | undefined;
  onChange: (owner: number | null) => void;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  /** Label for the empty choice — "Unassigned" on a record, "Any counselor" in a filter. */
  emptyLabel?: string;
}) {
  const { tenantKey, userId, displayName } = useSession();
  const { members } = useMembers(tenantKey);

  const options = useMemo(() => {
    const opts = members.map((m) => ({ value: String(m.id), label: memberLabel(m) }));
    if (userId && !members.some((m) => m.id === userId)) {
      opts.unshift({ value: String(userId), label: `${displayName || "Me"} (me)` });
    }
    if (value && !opts.some((o) => o.value === String(value))) {
      opts.push({ value: String(value), label: `User #${value}` });
    }
    return opts;
  }, [members, userId, displayName, value]);

  return (
    <SimpleSelect
      value={value ? String(value) : ""}
      onChange={(v) => onChange(v ? Number(v) : null)}
      options={options}
      allowEmpty
      emptyLabel={emptyLabel}
      placeholder={emptyLabel}
      size={size}
      className={className}
      disabled={disabled}
      aria-label="Counselor"
    />
  );
}

/** Text label for a counselor (owner id), resolved through the member directory. */
export function OwnerName({ ownerId }: { ownerId?: number | null }) {
  const { tenantKey, userId, displayName } = useSession();
  const { byId } = useMembers(tenantKey);
  if (!ownerId) return <span className="text-muted-foreground">Unassigned</span>;
  if (ownerId === userId && !byId.get(ownerId)) return <>{displayName || "Me"}</>;
  return <>{memberLabel(byId.get(ownerId), ownerId)}</>;
}
