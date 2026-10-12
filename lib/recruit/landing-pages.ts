/**
 * Landing pages — the public, prospect-facing forms a recruitment team
 * publishes ("Request information", "Register for the Fall open house",
 * "Apply for the nursing info session"). Every page is a JSON document in
 * the organization's metadata (see org-settings.ts); the public route renders
 * it, and a submission becomes a Prospect (+ optional Application, note and
 * tags) through the CRM API.
 *
 * Pure module: no React, no SDK; unit-tested in __tests__/landing-pages.test.ts.
 */
import { applicationTitle, coerceMeta, PROSPECT_FIELDS, type Metadata } from "./fields";

export type FormFieldType =
  "text" | "email" | "tel" | "number" | "date" | "select" | "textarea" | "checkbox";

/**
 * Where a submitted answer lands. Everything else goes into
 * `person.metadata` under the field's own key.
 */
export type FieldMapping =
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "school"
  | "program"
  | "term"
  | "message"
  | "graduation_year"
  | "entry_type"
  | "residency"
  | "city"
  | "state"
  | "country"
  | "parent_name"
  | "parent_email"
  | "sms_consent"
  | "none";

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  /** For `select`. */
  options?: string[];
  mapTo?: FieldMapping;
  /** Shown under the input. */
  help?: string;
}

export interface LandingPage {
  /** URL segment under `/p/<org>/`. */
  slug: string;
  title: string;
  headline: string;
  subheadline?: string;
  /** Short paragraphs under the headline (markdown-free plain text). */
  body?: string[];
  /** Bullet list of what the prospect gets. */
  highlights?: string[];
  /** Hero image (https URL). */
  heroImageUrl?: string;
  /** Call-to-action on the submit button. */
  ctaLabel?: string;
  successTitle?: string;
  successMessage?: string;
  fields: FormField[];
  /** Create an Application for every submission. */
  createApplication?: boolean;
  /** Funnel + stage the application starts in (codes, stable across renames). */
  pipelineCode?: string;
  stageCode?: string;
  /** Lead-source code recorded on the application (created on first use). */
  sourceCode?: string;
  /** Default program / term when the form does not ask. */
  program?: string;
  term?: string;
  /** Tag names attached to the prospect (created on first use). */
  tags?: string[];
  /** Counselor (platform user id) who owns submissions. */
  ownerId?: number | null;
  /** Lifecycle stage new prospects get. */
  lifecycleStage?: "lead" | "qualified" | "opportunity";
  published: boolean;
  createdAt: string;
  updatedAt: string;
  /** Number of submissions received (incremented by the server). */
  submissions?: number;
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string, max = 60): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/** The field set almost every inquiry form starts from. */
export function defaultFields(): FormField[] {
  return [
    { key: "first_name", label: "First name", type: "text", required: true, mapTo: "first_name" },
    { key: "last_name", label: "Last name", type: "text", required: true, mapTo: "last_name" },
    { key: "email", label: "Email", type: "email", required: true, mapTo: "email" },
    { key: "phone", label: "Mobile phone", type: "tel", mapTo: "phone" },
    { key: "school", label: "Current high school or college", type: "text", mapTo: "school" },
    {
      key: "graduation_year",
      label: "Graduation year",
      type: "select",
      options: PROSPECT_FIELDS.find((f) => f.key === "graduation_year")?.options?.map(
        (o) => o.value,
      ),
      mapTo: "graduation_year",
    },
    { key: "program", label: "Program of interest", type: "text", mapTo: "program" },
    {
      key: "term",
      label: "When would you like to start?",
      type: "select",
      options: PROSPECT_FIELDS.find((f) => f.key === "entry_term")?.options?.map((o) => o.value),
      mapTo: "term",
    },
    { key: "message", label: "Anything you want us to know?", type: "textarea", mapTo: "message" },
    {
      key: "sms_consent",
      label: "Text me about deadlines and events",
      type: "checkbox",
      mapTo: "sms_consent",
    },
  ];
}

/** A new "Request information" page with sensible defaults. */
export function newLandingPage(input: Partial<LandingPage> & { title: string }): LandingPage {
  const now = new Date().toISOString();
  const slug = input.slug?.trim() || slugify(input.title) || "request-information";
  return {
    slug,
    title: input.title.trim(),
    headline: input.headline?.trim() || input.title.trim(),
    subheadline:
      input.subheadline ??
      "Tell us a little about yourself and an admissions counselor will be in touch.",
    body: input.body ?? [],
    highlights: input.highlights ?? [
      "Personalized guidance from a counselor",
      "Scholarship and financial-aid details",
      "Invitations to visit days and info sessions",
    ],
    heroImageUrl: input.heroImageUrl ?? "",
    ctaLabel: input.ctaLabel ?? "Request information",
    successTitle: input.successTitle ?? "Thanks — we have your request",
    successMessage:
      input.successMessage ??
      "A counselor will reach out within two business days. Watch your inbox for next steps.",
    fields: input.fields?.length ? input.fields : defaultFields(),
    createApplication: input.createApplication ?? true,
    pipelineCode: input.pipelineCode ?? "default",
    stageCode: input.stageCode ?? "",
    sourceCode: input.sourceCode ?? `landing-${slug}`,
    program: input.program ?? "",
    term: input.term ?? "",
    tags: input.tags ?? ["Web inquiry"],
    ownerId: input.ownerId ?? null,
    lifecycleStage: input.lifecycleStage ?? "lead",
    published: input.published ?? false,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    submissions: input.submissions ?? 0,
  };
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Problems that make a page unpublishable. */
export function validateLandingPage(page: LandingPage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!SLUG_RE.test(page.slug))
    issues.push({ field: "slug", message: "Use lowercase letters, numbers and dashes." });
  if (!page.title.trim()) issues.push({ field: "title", message: "Give the page a title." });
  if (!page.headline.trim()) issues.push({ field: "headline", message: "Write a headline." });
  if (!page.fields.length) issues.push({ field: "fields", message: "Add at least one field." });
  const keys = new Set<string>();
  for (const f of page.fields) {
    if (!f.key.trim()) issues.push({ field: "fields", message: "Every field needs a key." });
    if (keys.has(f.key))
      issues.push({ field: "fields", message: `Field key "${f.key}" is used twice.` });
    keys.add(f.key);
    if (f.type === "select" && !f.options?.length)
      issues.push({ field: f.key, message: `"${f.label}" needs options.` });
  }
  const hasEmail = page.fields.some((f) => f.mapTo === "email");
  const hasName = page.fields.some((f) => f.mapTo === "name" || f.mapTo === "first_name");
  if (!hasEmail)
    issues.push({
      field: "fields",
      message: "Map one field to Email so prospects can be reached.",
    });
  if (!hasName) issues.push({ field: "fields", message: "Map a field to Name or First name." });
  return issues;
}

export type Answers = Record<string, string | boolean | number | null | undefined>;

export interface SubmissionIssue {
  key: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate a prospect's answers against the page; returns per-field problems. */
export function validateSubmission(page: LandingPage, answers: Answers): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  for (const f of page.fields) {
    const raw = answers[f.key];
    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    if (f.type === "checkbox") continue;
    if (f.required && !text) {
      issues.push({ key: f.key, message: `${f.label} is required.` });
      continue;
    }
    if (!text) continue;
    if (text.length > 2000) issues.push({ key: f.key, message: `${f.label} is too long.` });
    if (f.type === "email" && !EMAIL_RE.test(text))
      issues.push({ key: f.key, message: "Enter a valid email address." });
    if (f.type === "select" && f.options?.length && !f.options.includes(text))
      issues.push({ key: f.key, message: `Choose one of the listed options.` });
    if (f.type === "number" && !Number.isFinite(Number(text)))
      issues.push({ key: f.key, message: `${f.label} must be a number.` });
  }
  return issues;
}

/** What a submission becomes in the CRM, before any request is made. */
export interface SubmissionPlan {
  person: {
    name: string;
    primary_email?: string;
    contact_numbers?: string[];
    job_title?: string;
    lifecycle_stage: "lead" | "qualified" | "opportunity";
    owner?: number | null;
    metadata: Metadata;
  };
  /** Name of the school typed by the prospect, to find-or-create an Organization. */
  schoolName?: string;
  application?: {
    title: string;
    program?: string;
    term?: string;
    description?: string;
    pipelineCode: string;
    stageCode?: string;
    sourceCode?: string;
    metadata: Metadata;
  };
  note: { title: string; comment: string };
  tags: string[];
}

/** Turn answers into CRM payloads using each field's `mapTo`. */
export function planSubmission(
  page: LandingPage,
  answers: Answers,
  context: { pageUrl?: string; utm?: Record<string, string>; submittedAt?: string } = {},
): SubmissionPlan {
  const get = (mapping: FieldMapping) => {
    const f = page.fields.find((x) => x.mapTo === mapping);
    if (!f) return undefined;
    const raw = answers[f.key];
    if (raw === undefined || raw === null) return undefined;
    if (f.type === "checkbox") return raw === true || raw === "true" || raw === "on" ? "true" : "";
    const text = String(raw).trim();
    return text || undefined;
  };

  const first = get("first_name");
  const last = get("last_name");
  const name =
    get("name") || [first, last].filter(Boolean).join(" ").trim() || get("email") || "Prospect";
  const email = get("email")?.toLowerCase();
  const phone = get("phone");
  const program = get("program") || page.program || undefined;
  const term = get("term") || page.term || undefined;
  const message = get("message");

  const metadata: Metadata = {};
  for (const key of [
    "graduation_year",
    "entry_type",
    "residency",
    "city",
    "state",
    "country",
    "parent_name",
    "parent_email",
  ] as const) {
    const v = get(key);
    if (v) metadata[key] = v;
  }
  const sms = get("sms_consent");
  if (sms !== undefined) metadata.sms_consent = sms === "true";
  if (term) metadata.entry_term = term;
  // Unmapped answers are kept too, under the field's own key.
  for (const f of page.fields) {
    if (f.mapTo && f.mapTo !== "none") continue;
    const raw = answers[f.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const field = {
      key: f.key,
      label: f.label,
      type: f.type === "checkbox" ? "boolean" : f.type === "number" ? "number" : "text",
    } as const;
    const v = coerceMeta(field, raw as string | boolean | number);
    if (v !== undefined) metadata[f.key] = v;
  }
  metadata.source_landing_page = page.slug;
  if (context.utm && Object.keys(context.utm).length) metadata.utm = context.utm;

  const lines = page.fields
    .map((f) => {
      const raw = answers[f.key];
      if (raw === undefined || raw === null || raw === "") return null;
      const v =
        f.type === "checkbox"
          ? raw === true || raw === "true" || raw === "on"
            ? "Yes"
            : "No"
          : String(raw);
      return `${f.label}: ${v}`;
    })
    .filter(Boolean) as string[];
  if (context.pageUrl) lines.push(`Page: ${context.pageUrl}`);

  const plan: SubmissionPlan = {
    person: {
      name,
      primary_email: email,
      contact_numbers: phone ? [phone] : undefined,
      job_title: program,
      lifecycle_stage: page.lifecycleStage ?? "lead",
      owner: page.ownerId ?? null,
      metadata,
    },
    schoolName: get("school"),
    note: {
      title: `Submitted “${page.title}”`,
      comment: lines.join("\n"),
    },
    tags: page.tags ?? [],
  };

  if (page.createApplication) {
    const appMeta: Metadata = { source_landing_page: page.slug };
    if (program) appMeta.program = program;
    if (term) appMeta.term = term;
    const entryType = get("entry_type");
    if (entryType) appMeta.entry_type = entryType;
    plan.application = {
      title: applicationTitle(name, program, term),
      program,
      term,
      description: message,
      pipelineCode: page.pipelineCode || "default",
      stageCode: page.stageCode || undefined,
      sourceCode: page.sourceCode || undefined,
      metadata: appMeta,
    };
  }
  return plan;
}

/** `https://recruit.example.edu/p/<org>/<slug>` */
export function landingPageUrl(appUrl: string, org: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, "")}/p/${encodeURIComponent(org)}/${encodeURIComponent(slug)}`;
}

/** Only `utm_*` keys, trimmed, at most 8 — never arbitrary query strings. */
export function pickUtm(params: URLSearchParams | Record<string, string>): Record<string, string> {
  const entries =
    params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!/^utm_[a-z_]{1,32}$/i.test(k) || !v) continue;
    out[k.toLowerCase()] = String(v).slice(0, 200);
    if (Object.keys(out).length >= 8) break;
  }
  return out;
}
