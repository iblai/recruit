"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SimpleSelect } from "@/components/crm/simple-select";
import {
  slugify,
  type FieldMapping,
  type FormField,
  type FormFieldType,
} from "@/lib/recruit/landing-pages";

const TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "textarea", label: "Paragraph" },
  { value: "checkbox", label: "Checkbox" },
];

const MAPPINGS: { value: FieldMapping; label: string }[] = [
  { value: "none", label: "Keep as extra field" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "name", label: "Full name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "school", label: "School (find or create)" },
  { value: "program", label: "Program of interest" },
  { value: "term", label: "Entry term" },
  { value: "graduation_year", label: "Graduation year" },
  { value: "entry_type", label: "Entry type" },
  { value: "residency", label: "Residency" },
  { value: "city", label: "City" },
  { value: "state", label: "State / region" },
  { value: "country", label: "Country" },
  { value: "parent_name", label: "Parent / guardian name" },
  { value: "parent_email", label: "Parent email" },
  { value: "sms_consent", label: "SMS consent" },
  { value: "message", label: "Message → application notes" },
];

/** The questions on the form, in order, each mapped to where its answer lands. */
export function FieldsEditor({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (next: FormField[]) => void;
}) {
  const set = (i: number, patch: Partial<FormField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => {
    let key = "question";
    let n = 1;
    while (fields.some((f) => f.key === key)) key = `question_${++n}`;
    onChange([...fields, { key, label: "New question", type: "text", mapTo: "none" }]);
  };

  return (
    <div className="grid gap-2">
      {fields.map((f, i) => (
        <div
          key={`${f.key}-${i}`}
          className="grid gap-2 rounded-lg border border-[var(--border-color,#e5e7eb)] bg-white p-2.5"
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <Input
              value={f.label}
              onChange={(e) => {
                const label = e.target.value;
                const autoKey = !f.key || f.key === slugify(f.label).replace(/-/g, "_");
                set(i, {
                  label,
                  ...(autoKey ? { key: slugify(label).replace(/-/g, "_") || f.key } : {}),
                });
              }}
              placeholder="Question label"
              className="h-8 text-sm"
              aria-label={`Label of field ${i + 1}`}
            />
            <SimpleSelect
              value={f.type}
              onChange={(v) =>
                set(i, {
                  type: v as FormFieldType,
                  ...(v === "select" && !f.options?.length
                    ? { options: ["Option 1", "Option 2"] }
                    : {}),
                })
              }
              options={TYPES}
              size="sm"
              aria-label={`Type of field ${i + 1}`}
            />
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                    />
                  }
                >
                  <ArrowUp strokeWidth={1.75} />
                </TooltipTrigger>
                <TooltipContent>Move up</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(i, 1)}
                      disabled={i === fields.length - 1}
                      aria-label="Move down"
                    />
                  }
                >
                  <ArrowDown strokeWidth={1.75} />
                </TooltipTrigger>
                <TooltipContent>Move down</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-gray-400 hover:text-rose-600"
                      onClick={() => remove(i)}
                      aria-label="Remove field"
                    />
                  }
                >
                  <Trash2 strokeWidth={1.75} />
                </TooltipTrigger>
                <TooltipContent>Remove this question</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <SimpleSelect
              value={f.mapTo ?? "none"}
              onChange={(v) => set(i, { mapTo: v as FieldMapping })}
              options={MAPPINGS}
              size="sm"
              aria-label={`Where the answer to field ${i + 1} is stored`}
            />
            <Input
              value={f.placeholder ?? ""}
              onChange={(e) => set(i, { placeholder: e.target.value })}
              placeholder="Placeholder (optional)"
              className="h-8 text-sm"
              aria-label={`Placeholder of field ${i + 1}`}
            />
            <label className="flex h-8 items-center gap-2 text-xs text-gray-700">
              <Switch
                checked={!!f.required}
                onCheckedChange={(on: boolean) => set(i, { required: on })}
                aria-label={`${f.label} is required`}
              />
              Required
            </label>
          </div>
          {f.type === "select" ? (
            <Input
              value={(f.options ?? []).join(", ")}
              onChange={(e) =>
                set(i, {
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Options, comma separated"
              className="h-8 text-sm"
              aria-label={`Options of field ${i + 1}`}
            />
          ) : null}
          <p className="text-muted-foreground text-[11px]">
            key <code className="font-mono">{f.key}</code>
          </p>
        </div>
      ))}
      <Button variant="outline" size="sm" className="justify-start border-dashed" onClick={add}>
        <Plus data-icon="inline-start" strokeWidth={1.75} /> Add a question
      </Button>
    </div>
  );
}
