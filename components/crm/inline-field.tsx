"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SimpleSelect, type SelectOption } from "@/components/crm/simple-select";
import { InfoTip } from "@/components/crm/info-tip";
import { cn } from "@/lib/utils";

/** A labelled row in a record's field panel (Twenty's "show page" left column). */
export function FieldRow({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  /** One short sentence explaining the field, shown as an info tip. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1.5", className)}
    >
      <dt className="text-muted-foreground flex items-center gap-1 pt-1 text-xs font-medium">
        <span className="min-w-0 truncate">{label}</span>
        {hint ? (
          <InfoTip label={typeof label === "string" ? `About ${label}` : "About this field"}>
            {hint}
          </InfoTip>
        ) : null}
      </dt>
      <dd className="min-w-0 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/** Click-to-edit text (or textarea) — Enter saves, Escape cancels, blur saves. */
export function InlineText({
  value,
  onSave,
  placeholder = "Empty",
  type = "text",
  multiline = false,
  disabled,
  className,
  render,
}: {
  value?: string | null;
  onSave: (value: string) => Promise<unknown> | void;
  placeholder?: string;
  type?: "text" | "email" | "url" | "number" | "date" | "datetime-local";
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
  /** Custom read-mode rendering (e.g. a mailto link). */
  render?: (value: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = async () => {
    if (draft === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        title={disabled ? undefined : "Click to edit"}
        className={cn(
          "group/field -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-start justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-gray-50 disabled:hover:bg-transparent",
          className,
        )}
      >
        <span
          className={cn(
            "min-w-0 break-words",
            !value && "text-muted-foreground italic",
            multiline && "whitespace-pre-wrap",
          )}
        >
          {value ? (render ? render(value) : value) : placeholder}
        </span>
        {!disabled ? (
          <Pencil className="mt-0.5 size-3 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover/field:opacity-100" />
        ) : null}
      </button>
    );
  }

  const common = {
    ref,
    value: draft,
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(value ?? "");
        setEditing(false);
      }
      if (e.key === "Enter" && !(multiline && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        void commit();
      }
    },
    onBlur: () => void commit(),
  };

  return (
    <div className="flex items-start gap-1">
      {multiline ? (
        <Textarea {...common} rows={3} className="text-sm" />
      ) : (
        <Input {...common} type={type} className="h-8 text-sm" />
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void commit()}
        aria-label="Save"
      >
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setDraft(value ?? "");
          setEditing(false);
        }}
        aria-label="Cancel"
      >
        <X />
      </Button>
    </div>
  );
}

/** A select that saves on change. */
export function InlineSelect({
  value,
  options,
  onSave,
  placeholder,
  allowEmpty,
  emptyLabel,
  disabled,
  renderValue,
}: {
  value?: string | null;
  options: SelectOption[];
  onSave: (value: string) => Promise<unknown> | void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  renderValue?: (value: string) => ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {renderValue && value ? <span className="shrink-0">{renderValue(value)}</span> : null}
      <SimpleSelect
        value={value ?? ""}
        onChange={async (v) => {
          setSaving(true);
          try {
            await onSave(v);
          } finally {
            setSaving(false);
          }
        }}
        options={options}
        placeholder={placeholder}
        allowEmpty={allowEmpty}
        emptyLabel={emptyLabel}
        size="sm"
        disabled={disabled || saving}
        className="h-8 border-transparent bg-transparent shadow-none hover:bg-gray-50"
      />
    </div>
  );
}
