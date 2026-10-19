/**
 * Recruit's own records on the platform's CRM. Every CRM call names this app,
 * and the platform keeps each app's records apart (crm 1.4.0). Recruit refuses
 * any record that isn't its own, and writes only once the platform has echoed
 * the scope: an older platform ignores `app` and would file the write among
 * the CRM's records.
 *
 * No imports: the public landing pages use it too.
 */
export const CRM_APP = "recruit";

export const SCOPE_MISSING =
  "This platform’s CRM doesn’t keep apps’ records apart yet, so recruit won’t show or change them. It needs the platform’s CRM 1.4.0.";

/** `url` with `app=recruit` added to its query. */
export function withApp(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}app=${CRM_APP}`;
}

// The resources whose records carry `app`, by the first segment of their path.
const SCOPED = new Set([
  "persons",
  "organizations",
  "deals",
  "activities",
  "pipelines",
  "lead-sources",
  "tags",
  "web-forms",
  "views",
]);

const isOwn = (row: unknown) =>
  typeof row === "object" && row !== null && (row as { app?: unknown }).app === CRM_APP;

const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Whether every record in a CRM response is recruit's. `path` is relative to `/api/crm`. */
export function isOwnRecords(path: string, body: unknown): boolean {
  if (typeof body !== "object" || body === null) return true;
  const data = body as Record<string, unknown>;
  const [resource, id, ...deeper] = path.split("?")[0].split("/").filter(Boolean);
  if (resource === "search")
    return ["persons", "organizations", "deals"].every((key) => rows(data[key]).every(isOwn));
  // Totals with no rows to check: the overview must echo recruit's scope.
  if (resource === "overview") return isOwn(data);
  // Stages, submissions, tags and metadata of a record: the record itself is checked.
  if (!SCOPED.has(resource) || deeper.length) return true;
  if (id === undefined) return rows(data.results).every(isOwn);
  // A detail; `merge/` and `board/` answer without a record of their own.
  return "id" in data ? isOwn(data) : true;
}

let confirmed = false;

/** Whether the platform has confirmed it keeps recruit's records apart. */
export const scopeConfirmed = () => confirmed;

/** True, and remembered, once the overview echoes recruit's scope. */
export function confirmScope(overview: unknown): boolean {
  if ((overview as { app?: unknown } | null)?.app === CRM_APP) confirmed = true;
  return confirmed;
}

/** Tests only. */
export function forgetScope() {
  confirmed = false;
}
