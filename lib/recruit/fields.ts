/**
 * Recruitment fields that have no column in the CRM API and live in each
 * record's free-form `metadata` object instead. One definition feeds the
 * create dialogs, the record pages, the Chief of Staff's tools and the
 * landing-page form mapping, so a field added here appears everywhere.
 *
 * Pure module — no React, no SDK — so it is unit-tested and shared by the
 * browser and the route handlers.
 */

export type FieldType = "text" | "number" | "select" | "email" | "tel" | "date" | "boolean";

export interface MetaField {
  /** Key inside `metadata`. */
  key: string;
  label: string;
  type: FieldType;
  /** One short sentence for the info tip. */
  hint?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

const thisYear = new Date().getFullYear();

/** High-school graduation years offered in pickers: last year through +6. */
export function graduationYears(
  from = thisYear - 1,
  count = 8,
): { value: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => String(from + i)).map((y) => ({
    value: y,
    label: y,
  }));
}

export const RESIDENCY_OPTIONS = [
  { value: "in_state", label: "In-state" },
  { value: "out_of_state", label: "Out-of-state" },
  { value: "international", label: "International" },
];

export const ENTRY_TYPE_OPTIONS = [
  { value: "first_year", label: "First-year" },
  { value: "transfer", label: "Transfer" },
  { value: "graduate", label: "Graduate" },
  { value: "international", label: "International" },
  { value: "continuing_ed", label: "Continuing education" },
];

/** Entry terms offered in pickers: the next eight Fall / Spring / Summer terms. */
export function entryTerms(now = new Date()): { value: string; label: string }[] {
  const seasons = ["Spring", "Summer", "Fall"] as const;
  const out: { value: string; label: string }[] = [];
  let year = now.getFullYear();
  let idx = now.getMonth() < 1 ? 0 : now.getMonth() < 5 ? 1 : 2; // next term after today
  while (out.length < 8) {
    const label = `${seasons[idx]} ${year}`;
    out.push({ value: label, label });
    idx += 1;
    if (idx === seasons.length) {
      idx = 0;
      year += 1;
    }
  }
  return out;
}

/** Fields stored in `person.metadata` for a prospect. */
export const PROSPECT_FIELDS: MetaField[] = [
  {
    key: "graduation_year",
    label: "Graduation year",
    type: "select",
    hint: "High-school (or current institution) graduation year.",
    options: graduationYears(),
  },
  {
    key: "entry_term",
    label: "Entry term",
    type: "select",
    hint: "When they intend to start.",
    options: entryTerms(),
  },
  {
    key: "entry_type",
    label: "Entry type",
    type: "select",
    hint: "First-year, transfer, graduate…",
    options: ENTRY_TYPE_OPTIONS,
  },
  {
    key: "residency",
    label: "Residency",
    type: "select",
    hint: "Drives tuition estimates and recruiting territory.",
    options: RESIDENCY_OPTIONS,
  },
  {
    key: "gpa",
    label: "GPA",
    type: "number",
    hint: "Self-reported, on a 4.0 scale.",
    placeholder: "3.7",
  },
  {
    key: "city",
    label: "City",
    type: "text",
    placeholder: "Austin",
  },
  {
    key: "state",
    label: "State / region",
    type: "text",
    placeholder: "TX",
  },
  {
    key: "country",
    label: "Country",
    type: "text",
    placeholder: "United States",
  },
  {
    key: "parent_name",
    label: "Parent / guardian",
    type: "text",
    hint: "Who else is part of the decision.",
    placeholder: "Dana Lovelace",
  },
  { key: "parent_email", label: "Parent email", type: "email", placeholder: "dana@example.com" },
  {
    key: "sms_consent",
    label: "SMS consent",
    type: "boolean",
    hint: "The prospect agreed to receive text messages.",
  },
];

/** Fields stored in `deal.metadata` for an application. */
export const APPLICATION_FIELDS: MetaField[] = [
  {
    key: "program",
    label: "Program",
    type: "text",
    hint: "The major, degree or certificate applied to.",
    placeholder: "B.S. Computer Science",
  },
  {
    key: "term",
    label: "Entry term",
    type: "select",
    hint: "The term this application is for.",
    options: entryTerms(),
  },
  {
    key: "entry_type",
    label: "Entry type",
    type: "select",
    options: ENTRY_TYPE_OPTIONS,
  },
  {
    key: "financial_aid",
    label: "Financial aid requested",
    type: "boolean",
    hint: "FAFSA / institutional aid requested.",
  },
  {
    key: "scholarship",
    label: "Scholarship offered",
    type: "text",
    hint: "Name or amount of any merit award.",
    placeholder: "Presidential — $12,000/yr",
  },
];

export type Metadata = Record<string, unknown>;

/** Read a metadata field as a display string ("" when unset). */
export function readMeta(metadata: Metadata | undefined | null, key: string): string {
  const v = metadata?.[key];
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/** Coerce a form value to the type the field declares; `""` clears the key. */
export function coerceMeta(
  field: MetaField,
  raw: string | boolean | number | null | undefined,
): unknown {
  if (raw === "" || raw === undefined || raw === null) return undefined;
  switch (field.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on" || raw === "yes" || raw === 1;
    default:
      return String(raw).trim() || undefined;
  }
}

/**
 * Merge one field into a record's metadata, dropping it when cleared — for a
 * new record's `metadata`. Edits send `metaPatch` to `…/metadata/` instead.
 */
export function withMeta(
  metadata: Metadata | undefined | null,
  field: MetaField,
  raw: string | boolean | number | null | undefined,
): Metadata {
  const next: Metadata = { ...metadata };
  const value = coerceMeta(field, raw);
  if (value === undefined) delete next[field.key];
  else next[field.key] = value;
  return next;
}

/** One field as a merge patch for `PATCH …/metadata/`; a cleared field is `null`, which removes it. */
export function metaPatch(
  field: MetaField,
  raw: string | boolean | number | null | undefined,
): Metadata {
  return { [field.key]: coerceMeta(field, raw) ?? null };
}

/** Label for a stored value (select fields show their option label). */
export function metaLabel(field: MetaField, metadata: Metadata | undefined | null): string {
  const raw = readMeta(metadata, field.key);
  if (!raw) return "";
  if (field.type === "boolean") return raw === "true" ? "Yes" : "No";
  if (field.options) return field.options.find((o) => o.value === raw)?.label ?? raw;
  return raw;
}

/** "{Name} — {Program} · {Term}" — the default application title. */
export function applicationTitle(personName: string, program?: string, term?: string): string {
  const parts = [program?.trim(), term?.trim()].filter(Boolean);
  return parts.length ? `${personName} — ${parts.join(" · ")}` : `${personName} — Application`;
}
