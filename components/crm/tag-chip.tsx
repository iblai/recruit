"use client";

import { X } from "lucide-react";
import { tagStyle } from "@/lib/crm/format";
import type { TagChip as TagChipType } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

export function TagChip({
  tag,
  onRemove,
  size = "sm",
  className,
}: {
  tag: Pick<TagChipType, "name" | "color"> & { id?: number };
  onRemove?: () => void;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
      style={tagStyle(tag)}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color || "#888888" }}
        aria-hidden
      />
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 rounded-full p-px opacity-60 hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export function TagList({
  tags,
  max = 3,
  size = "sm",
}: {
  tags?: TagChipType[];
  max?: number;
  size?: "xs" | "sm";
}) {
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <TagChip key={t.id} tag={t} size={size} />
      ))}
      {rest > 0 ? <span className="text-muted-foreground text-[11px]">+{rest}</span> : null}
    </span>
  );
}
