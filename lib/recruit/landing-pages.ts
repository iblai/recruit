/**
 * Landing pages — the public, prospect-facing forms a recruitment team
 * publishes ("Request information", "Register for the Fall open house",
 * "Apply for the nursing info session"). Every page is a CRM web form on the
 * platform (`/api/crm/web-forms/`): the copy in its `metadata`, the questions
 * in `fields`, where a submission lands in `routing`. Visitors submit to the
 * platform directly; it files the prospect, the application, tags and a note.
 *
 * Pure module: no React, no SDK; unit-tested in __tests__/landing-pages.test.ts.
 */
import type { PublicWebForm, WebForm, WebFormInput } from "../crm/types";
import { clickIds } from "./ad-tags";
import { PROSPECT_FIELDS } from "./fields";

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "select"
  | "textarea"
  | "checkbox";

/**
 * Where a submitted answer lands (`TARGETS`). `none` keeps it on the
 * prospect's metadata under the field's own key.
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

/** A dated event a page signs people up for. Instants are ISO strings; `timeZone` is where it happens. */
export interface PageEvent {
  startsAt: string;
  endsAt?: string;
  /** IANA zone the date and time are shown in, whoever is looking. */
  timeZone: string;
  place?: string;
  /** Sign-ups close here; without it, when the event starts. */
  signUpBy?: string;
}

/** One lesson of a taster course: short paragraphs, and a question to think about. */
export interface Lesson {
  title: string;
  body: string[];
  question?: string;
}

/** A short taster course a page carries, read without an account. */
export interface PageCourse {
  lessons: Lesson[];
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
  /** Set when the page is an event (open house, visit day). */
  event?: PageEvent;
  /** Set when the page is a taster course. */
  course?: PageCourse;
  createdAt: string;
  updatedAt: string;
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
    // Blank: the organization's default funnel.
    pipelineCode: input.pipelineCode ?? "",
    stageCode: input.stageCode ?? "",
    sourceCode: input.sourceCode ?? `landing-${slug}`.slice(0, 64),
    program: input.program ?? "",
    term: input.term ?? "",
    tags: input.tags ?? ["Web inquiry"],
    ownerId: input.ownerId ?? null,
    lifecycleStage: input.lifecycleStage ?? "lead",
    published: input.published ?? false,
    ...(input.event && { event: input.event }),
    ...(input.course && { course: input.course }),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Where each mapping's answer is written on the platform. */
const TARGETS: Record<Exclude<FieldMapping, "none">, string[]> = {
  name: ["person.name"],
  first_name: ["person.first_name"],
  last_name: ["person.last_name"],
  email: ["person.primary_email"],
  phone: ["person.phone"],
  school: ["organization.name"],
  program: ["person.job_title", "deal.metadata.program"],
  term: ["person.metadata.entry_term", "deal.metadata.term"],
  message: ["deal.description"],
  graduation_year: ["person.metadata.graduation_year"],
  entry_type: ["person.metadata.entry_type", "deal.metadata.entry_type"],
  residency: ["person.metadata.residency"],
  city: ["person.metadata.city"],
  state: ["person.metadata.state"],
  country: ["person.metadata.country"],
  parent_name: ["person.metadata.parent_name"],
  parent_email: ["person.metadata.parent_email"],
  sms_consent: ["person.metadata.sms_consent"],
};

/** The platform's rules for a question (`crm/serializers/web_forms.py`). */
const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const SOURCE_RE = /^[-a-zA-Z0-9_]{0,64}$/;
const STRING_TYPES = new Set<FormFieldType>(["text", "email", "tel", "select", "textarea"]);
const RECORD_COLUMNS = new Set([
  "person.name",
  "person.first_name",
  "person.last_name",
  "person.primary_email",
  "person.phone",
  "person.job_title",
  "organization.name",
  "deal.description",
]);
const MAX_FIELDS = 50;

/** Where a question's answer is written. */
export function fieldTargets(field: FormField): string[] {
  const mapping = field.mapTo ?? "none";
  return mapping === "none" ? [`person.metadata.${field.key}`] : TARGETS[mapping];
}

/** The mapping that writes exactly these targets; anything else reads as an extra field. */
function mappingFor(targets: string[]): FieldMapping {
  const want = [...targets].sort().join(" ");
  const hit = Object.entries(TARGETS).find(([, t]) => [...t].sort().join(" ") === want);
  return (hit?.[0] as FieldMapping | undefined) ?? "none";
}

/** A question key from its label, in the shape the platform takes. */
export function fieldKey(label: string): string {
  return (
    slugify(label, 64)
      .replace(/-/g, "_")
      .replace(/^[^a-z]+/, "") || "question"
  );
}

/**
 * Problems the platform would refuse a save for; with `publish`, also what a
 * published page needs (a way to reach the prospect, and a name).
 */
export function validateLandingPage(
  page: LandingPage,
  { publish = false }: { publish?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  if (!SLUG_RE.test(page.slug) || page.slug.length > 64)
    add("slug", "Use lowercase letters, numbers and dashes (at most 64).");
  if (!page.title.trim()) add("title", "Give the page a title.");
  if (page.fields.length > MAX_FIELDS) add("fields", `Use at most ${MAX_FIELDS} questions.`);
  const keys = new Set<string>();
  const claimed = new Map<string, string>();
  for (const f of page.fields) {
    const name = f.label.trim() || f.key || "A question";
    if (!f.label.trim()) add(f.key || "fields", "Every question needs a label.");
    if (!KEY_RE.test(f.key))
      add(
        f.key || "fields",
        `"${name}" needs a key: a lowercase letter, then letters, digits or _.`,
      );
    else if (keys.has(f.key)) add(f.key, `Field key "${f.key}" is used twice.`);
    keys.add(f.key);
    if (f.type === "select") {
      const options = f.options ?? [];
      if (!options.length || options.length > 100)
        add(f.key, `"${name}" needs between 1 and 100 options.`);
      else if (new Set(options).size !== options.length)
        add(f.key, `"${name}" lists an option twice.`);
    }
    for (const target of fieldTargets(f)) {
      if (target === "person.primary_email" && f.type !== "email")
        add(f.key, `"${name}" maps to Email, so it must be an Email question.`);
      else if (RECORD_COLUMNS.has(target) && !STRING_TYPES.has(f.type))
        add(f.key, `"${name}" must be a text, email, phone, dropdown or paragraph question.`);
      const other = claimed.get(target);
      if (other !== undefined) add(f.key, `"${other}" and "${name}" save to the same place.`);
      claimed.set(target, name);
    }
  }
  const tags = (page.tags ?? []).map((t) => t.trim());
  if (tags.length > 20) add("tags", "Use at most 20 tags.");
  if (tags.some((t) => !t || t.length > 64)) add("tags", "Tag names are 1 to 64 characters.");
  if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length)
    add("tags", "Each tag can be listed once.");
  if (!SOURCE_RE.test(page.sourceCode ?? ""))
    add("sourceCode", "Source codes use letters, numbers, - and _ (at most 64).");
  if (page.event) for (const problem of eventProblems(page.event)) add("event", problem);
  if (page.course) for (const problem of courseProblems(page.course)) add("course", problem);
  if (!publish) return issues;

  if (!page.headline.trim()) add("headline", "Write a headline.");
  if (!page.fields.length) add("fields", "Add at least one field.");
  if (!page.fields.some((f) => f.mapTo === "email"))
    add("fields", "Map one field to Email so prospects can be reached.");
  if (!page.fields.some((f) => f.mapTo === "name" || f.mapTo === "first_name"))
    add("fields", "Map a field to Name or First name.");
  return issues;
}

/** The application title: the program and term when the page knows them. */
function dealTitle(page: LandingPage): string {
  const known = (mapping: FieldMapping, fallback?: string) =>
    !!fallback?.trim() || page.fields.some((f) => f.mapTo === mapping);
  const parts = [
    known("program", page.program) && "{program}",
    known("term", page.term) && "{term}",
  ];
  const tokens = parts.filter(Boolean);
  return tokens.length ? `{name} — ${tokens.join(" · ")}` : "{name} — Application";
}

/** The web form a page is saved as. */
export function toWebForm(page: LandingPage): WebFormInput {
  const defaults: Record<string, string> = {};
  if (page.program?.trim()) defaults.program = page.program.trim();
  if (page.term?.trim()) defaults.term = page.term.trim();
  // Sign-ups are counted by this, whether they came through the form or the chat.
  if (page.event) defaults.event = page.slug;
  // So nobody is offered the course they signed up on.
  if (page.course) defaults.course = page.slug;
  return {
    slug: page.slug,
    name: page.title.trim(),
    is_published: page.published,
    fields: page.fields.map((f) => ({
      key: f.key,
      label: f.label.trim(),
      type: f.type,
      required: !!f.required,
      placeholder: f.placeholder ?? "",
      help: f.help ?? "",
      // The platform refuses options on anything but a dropdown.
      options: f.type === "select" ? (f.options ?? []) : [],
      maps_to: fieldTargets(f),
    })),
    routing: {
      create_deal: !!page.createApplication,
      pipeline_code: page.pipelineCode ?? "",
      stage_code: page.stageCode ?? "",
      lead_source_code: page.sourceCode ?? "",
      tags: (page.tags ?? []).map((t) => t.trim()),
      owner: page.ownerId ?? null,
      lifecycle_stage: page.lifecycleStage ?? "lead",
      deal_title: dealTitle(page),
      deal_metadata: defaults,
    },
    metadata: {
      headline: page.headline,
      subheadline: page.subheadline ?? "",
      body: page.body ?? [],
      highlights: page.highlights ?? [],
      heroImageUrl: page.heroImageUrl ?? "",
      ctaLabel: page.ctaLabel ?? "",
      program: page.program ?? "",
      term: page.term ?? "",
      ...(page.event && { event: page.event }),
      ...(page.course && { course: page.course }),
    },
    success_title: page.successTitle ?? "",
    success_message: page.successMessage ?? "",
  };
}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const lines = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** The page copy kept in a web form's `metadata`. */
function pageCopy(name: string, copy: Record<string, unknown> = {}) {
  return {
    title: name,
    headline: text(copy.headline) || name,
    subheadline: text(copy.subheadline),
    body: lines(copy.body),
    highlights: lines(copy.highlights),
    heroImageUrl: text(copy.heroImageUrl),
    ctaLabel: text(copy.ctaLabel),
    program: text(copy.program),
    term: text(copy.term),
    ...(readEvent(copy.event) && { event: readEvent(copy.event) }),
    ...(readCourse(copy.course) && { course: readCourse(copy.course) }),
  };
}

const instant = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : "");

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The event kept in a web form's `metadata`, or nothing when it is not one. */
function readEvent(v: unknown): PageEvent | undefined {
  if (!v || typeof v !== "object") return undefined;
  const e = v as Record<string, unknown>;
  const startsAt = instant(e.startsAt);
  const timeZone = text(e.timeZone);
  if (!startsAt || !validZone(timeZone)) return undefined;
  return {
    startsAt,
    timeZone,
    ...(instant(e.endsAt) && { endsAt: instant(e.endsAt) }),
    ...(text(e.place).trim() && { place: text(e.place).trim() }),
    ...(instant(e.signUpBy) && { signUpBy: instant(e.signUpBy) }),
  };
}

/** What is wrong with an event's dates, in words for the editor. */
export function eventProblems(event: PageEvent): string[] {
  const problems: string[] = [];
  const at = (v?: string) => (v ? Date.parse(v) : Number.NaN);
  const start = at(event.startsAt);
  if (Number.isNaN(start)) problems.push("Give the event a date and time.");
  if (!validZone(event.timeZone)) problems.push("The event needs a time zone.");
  if (event.endsAt && !(at(event.endsAt) > start)) problems.push("The event ends after it starts.");
  if (event.signUpBy && !(at(event.signUpBy) <= start))
    problems.push("Sign-ups close before the event starts.");
  if ((event.place ?? "").length > 200) problems.push("Keep the place under 200 characters.");
  return problems;
}

/** The course kept in a web form's `metadata`, or nothing when it has no lesson. */
function readCourse(v: unknown): PageCourse | undefined {
  const raw = (v as { lessons?: unknown } | null | undefined)?.lessons;
  const lessons = (Array.isArray(raw) ? raw : [])
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      title: text(l.title).trim(),
      body: lines(l.body),
      ...(text(l.question).trim() && { question: text(l.question).trim() }),
    }))
    .filter((l) => l.title);
  return lessons.length ? { lessons } : undefined;
}

export const COURSE_LIMITS = {
  lessons: [2, 6],
  title: 120,
  paragraphs: 4,
  paragraph: 600,
  question: 200,
};

/** What is wrong with a course, in words for the editor. The whole page has to fit the platform's 64 KB. */
export function courseProblems(course: PageCourse): string[] {
  const problems: string[] = [];
  const max = COURSE_LIMITS;
  const n = course.lessons.length;
  if (n < max.lessons[0] || n > max.lessons[1])
    problems.push(`A course has ${max.lessons[0]} to ${max.lessons[1]} lessons.`);
  course.lessons.forEach((lesson, i) => {
    const name = lesson.title.trim() || `Lesson ${i + 1}`;
    if (!lesson.title.trim()) problems.push(`Lesson ${i + 1} needs a title.`);
    if (lesson.title.length > max.title)
      problems.push(`Keep the title of "${name}" under ${max.title} characters.`);
    const body = lesson.body.filter((p) => p.trim());
    if (!body.length) problems.push(`"${name}" needs some text.`);
    if (body.length > max.paragraphs)
      problems.push(`Keep "${name}" to ${max.paragraphs} paragraphs.`);
    if (body.some((p) => p.length > max.paragraph))
      problems.push(`Keep each paragraph of "${name}" under ${max.paragraph} characters.`);
    if ((lesson.question ?? "").length > max.question)
      problems.push(`Keep the question of "${name}" under ${max.question} characters.`);
  });
  return problems;
}

/** Whether people can still sign up: before the sign-up-by time, else before the start. */
export function eventIsOpen(event: PageEvent, now = new Date()): boolean {
  return now.getTime() < Date.parse(event.signUpBy ?? event.startsAt);
}

/**
 * "Saturday, March 13 · 10:00 AM – 1:00 PM", in the event's own time zone.
 * Empty while a draft's event has no start or zone; an end not after the start is left out.
 */
export function eventWhen(event: PageEvent, locale = "en"): string {
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime()) || !validZone(event.timeZone)) return "";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: event.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: event.timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(event.endsAt ?? "");
  const hours = end > start ? time.formatRange(start, end) : time.format(start);
  // ICU's narrow and thin spaces vary by version; plain ones read the same everywhere.
  return `${day} · ${hours}`.replace(/[\u00a0\u2009\u202f]/g, " ");
}

/** An instant as a `datetime-local` value in this browser's zone; empty when it is not one. */
export function toLocalInput(iso?: string): string {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  // Four digits: a year being typed ("0002") has to stay a value the field accepts.
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value as an instant; nothing while the field is empty. */
export function fromLocalInput(value: string): string | undefined {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
}

/** A saved web form as the editor shows it. */
export function fromWebForm(form: WebForm): LandingPage {
  const { routing } = form;
  const copy = pageCopy(form.name, form.metadata);
  return {
    ...copy,
    slug: form.slug,
    successTitle: form.success_title,
    successMessage: form.success_message,
    fields: form.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      help: f.help,
      ...(f.type === "select" && { options: f.options }),
      mapTo: mappingFor(f.maps_to),
    })),
    createApplication: routing.create_deal,
    pipelineCode: routing.pipeline_code,
    stageCode: routing.stage_code,
    sourceCode: routing.lead_source_code,
    program: routing.deal_metadata.program ?? copy.program,
    term: routing.deal_metadata.term ?? copy.term,
    tags: routing.tags,
    ownerId: routing.owner,
    lifecycleStage: routing.lifecycle_stage as LandingPage["lifecycleStage"],
    published: form.is_published,
    createdAt: form.created_at,
    updatedAt: form.updated_at,
  };
}

/** A published page as a visitor gets it: no routing, no mappings. */
export function fromPublicWebForm(form: PublicWebForm): LandingPage {
  return {
    ...pageCopy(form.name, form.metadata),
    slug: form.slug,
    successTitle: form.success_title,
    successMessage: form.success_message,
    fields: form.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      help: f.help,
      ...(f.type === "select" && { options: f.options }),
    })),
    published: true,
    createdAt: "",
    updatedAt: "",
  };
}

/** Only `utm_*` keys, trimmed, at most 8 — never arbitrary query strings. */
export function pickUtm(params: URLSearchParams | Record<string, string>): Record<string, string> {
  const entries =
    params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  // Click IDs first so the platform's cap of 8 never drops them.
  const out: Record<string, string> = clickIds(params);
  for (const [k, v] of entries) {
    if (Object.keys(out).length >= 8) break;
    if (!/^utm_[a-z0-9_]{1,32}$/i.test(k) || !v) continue;
    out[k.toLowerCase()] = String(v).slice(0, 200);
  }
  return out;
}

export interface SubmissionIssue {
  key: string;
  message: string;
}

export type SubmissionOutcome =
  | { ok: true }
  | { ok: false; issues: SubmissionIssue[]; message: string };

/** What a visitor sees for the platform's answer to their submission. */
export function submissionOutcome(status: number, body: unknown): SubmissionOutcome {
  if (status === 200 || status === 201) return { ok: true };
  const fail = (message: string, issues: SubmissionIssue[] = []) =>
    ({ ok: false, issues, message }) as const;
  if (status === 400) {
    const raw = (body as { issues?: unknown } | null)?.issues;
    const issues: SubmissionIssue[] = [];
    let general = "";
    for (const [key, value] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      const message = String(Array.isArray(value) ? (value[0] ?? "") : value);
      if (key === "non_field_errors") general = message;
      else issues.push({ key, message });
    }
    return fail(general || "Please fix the highlighted fields.", issues);
  }
  if (status === 404) return fail("This page is no longer accepting requests.");
  if (status === 429)
    return fail("Too many requests from your network. Please try again in a minute.");
  return fail("We could not send your request right now. Please try again in a few minutes.");
}

/** `https://recruit.example.edu/p/<org>/<slug>` */
export function landingPageUrl(appUrl: string, org: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, "")}/p/${encodeURIComponent(org)}/${encodeURIComponent(slug)}`;
}
