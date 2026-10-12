"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A small wrapper over the shadcn (Base UI) Select for the common
 * "pick one of these strings" case. Use `""` as the value for "none".
 */
export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  size = "default",
  disabled,
  allowEmpty,
  emptyLabel = "None",
  "aria-label": ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  "aria-label"?: string;
}) {
  const items = [...(allowEmpty ? [{ value: "", label: emptyLabel }] : []), ...options];
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange((v as string) ?? "")}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={cn("w-full", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value || "__empty"} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
