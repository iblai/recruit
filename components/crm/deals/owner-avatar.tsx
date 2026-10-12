"use client";

import { EntityAvatar } from "@/components/crm/entity-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { memberLabel, useMembers } from "@/hooks/use-members";
import { useSession } from "@/hooks/use-session";

/** Resolve a counselor (owner) id to a display name through the member directory. */
export function useOwnerLabel() {
  const { tenantKey, userId, displayName } = useSession();
  const { byId } = useMembers(tenantKey);
  return (ownerId?: number | null) => {
    if (!ownerId) return "Unassigned";
    const member = byId.get(ownerId);
    if (!member && ownerId === userId) return displayName || "Me";
    return memberLabel(member, ownerId);
  };
}

/** Small initials avatar for the counselor (platform user) who owns a record. */
export function OwnerAvatar({
  ownerId,
  size = "xs",
}: {
  ownerId?: number | null;
  size?: "xs" | "sm" | "md";
}) {
  const label = useOwnerLabel()(ownerId);
  if (!ownerId) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-gray-300 text-[9px] text-gray-400" />
          }
        >
          ?
        </TooltipTrigger>
        <TooltipContent>Unassigned</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <EntityAvatar name={label} seed={ownerId} size={size} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
