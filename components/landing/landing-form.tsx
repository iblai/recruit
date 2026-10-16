"use client";

import { useMemo, useState, type FormEvent } from "react";
import config from "@/lib/iblai/config";
import type { FormField, LandingPage, SubmissionIssue } from "@/lib/recruit/landing-pages";
import { pickUtm, submissionOutcome } from "@/lib/recruit/landing-pages";

/**
 * The prospect-facing form. Plain controlled inputs (no SDK, no shadcn — this
 * bundle must stay tiny and work with no session), a honeypot, per-field
 * errors from the platform, and a success state that replaces the form. It
 * submits to the platform's public web-form endpoint, no credential.
 * `preview` renders without submitting (the in-app editor uses it).
 */
export function LandingForm({
  page,
  org,
  accent,
  preview = false,
}: {
  page: LandingPage;
  org: string;
  accent: string;
  preview?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [website, setWebsite] = useState("");
  const [issues, setIssues] = useState<SubmissionIssue[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ title: string; message: string } | null>(null);

  const issueFor = useMemo(() => new Map(issues.map((i) => [i.key, i.message])), [issues]);

  const set = (key: string, v: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (issueFor.has(key)) setIssues((prev) => prev.filter((i) => i.key !== key));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (preview) {
      setDone({ title: page.successTitle ?? "Thanks", message: page.successMessage ?? "" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const utm = pickUtm(new URLSearchParams(window.location.search));
      const res = await fetch(
        `${config.dmUrl()}/api/crm/orgs/${encodeURIComponent(org)}/web-forms/${encodeURIComponent(page.slug)}/submissions/`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers: values, website, utm, page_url: window.location.href }),
        },
      );
      const outcome = submissionOutcome(res.status, await res.json().catch(() => null));
      if (!outcome.ok) {
        setIssues(outcome.issues);
        setError(outcome.message);
        return;
      }
      setDone({ title: page.successTitle || "Thanks", message: page.successMessage ?? "" });
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div
          className="mx-auto flex size-12 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: accent }}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">{done.title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">{done.message}</p>
        {preview ? (
          <button
            type="button"
            onClick={() => setDone(null)}
            className="mt-6 text-sm font-medium underline-offset-4 hover:underline"
            style={{ color: accent }}
          >
            Back to the form (preview)
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
      aria-label={page.title}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {page.fields.map((f) => (
          <Field
            key={f.key}
            field={f}
            value={values[f.key]}
            error={issueFor.get(f.key)}
            accent={accent}
            onChange={(v) => set(f.key, v)}
          />
        ))}
      </div>
      {/* Honeypot — hidden from people, filled by bots. */}
      <div className="absolute top-auto -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {busy ? "Sending…" : page.ctaLabel || "Request information"}
      </button>
      <p className="mt-3 text-center text-[11px] leading-5 text-gray-500">
        We use what you share only to contact you about admissions. Message and data rates may apply
        to texts; reply STOP to opt out.
      </p>
    </form>
  );
}

function Field({
  field,
  value,
  error,
  accent,
  onChange,
}: {
  field: FormField;
  value: string | boolean | undefined;
  error?: string;
  accent: string;
  onChange: (v: string | boolean) => void;
}) {
  const id = `lp-${field.key}`;
  const kind = fieldKind(field);
  const wide =
    field.type === "textarea" ||
    field.type === "checkbox" ||
    kind === "school" ||
    kind === "program";
  const base =
    "mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2";
  const border = error ? "border-rose-400 focus:ring-rose-200" : "border-gray-300";
  const ring = { ["--tw-ring-color" as string]: `${accent}55` } as React.CSSProperties;

  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-3 sm:col-span-2" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 size-4 rounded border-gray-300"
          style={{ accentColor: accent }}
        />
        <span className="text-sm leading-6 text-gray-700">
          {field.label}
          {field.help ? <span className="block text-xs text-gray-500">{field.help}</span> : null}
        </span>
      </label>
    );
  }

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {field.label}
        {field.required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </label>
      {field.type === "textarea" ? (
        <textarea
          id={id}
          rows={3}
          required={field.required}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border}`}
          style={ring}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border}`}
          style={ring}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <option value="">{field.placeholder || "Choose…"}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={
            field.type === "tel"
              ? "tel"
              : field.type === "email"
                ? "email"
                : field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : "text"
          }
          inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "decimal" : undefined}
          autoComplete={autoCompleteFor(field)}
          required={field.required}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${border}`}
          style={ring}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : field.help ? (
        <p className="mt-1 text-xs text-gray-500">{field.help}</p>
      ) : null}
    </div>
  );
}

/** The mapping, or on the public page (which gets none) the key the default fields share with it. */
function fieldKind(field: FormField): string {
  return field.mapTo ?? field.key;
}

function autoCompleteFor(field: FormField): string | undefined {
  switch (fieldKind(field)) {
    case "first_name":
      return "given-name";
    case "last_name":
      return "family-name";
    case "name":
      return "name";
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "city":
      return "address-level2";
    case "state":
      return "address-level1";
    case "country":
      return "country-name";
    default:
      return field.type === "email" ? "email" : field.type === "tel" ? "tel" : undefined;
  }
}
