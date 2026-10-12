import { format, formatDistanceToNowStrict, isPast, isToday, isTomorrow, parseISO } from "date-fns";
import type { Deal, PipelineStage, TagChip } from "./types";

export function formatCurrency(value: string | number | null | undefined, currency = "USD") {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatCompactCurrency(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

export function toDate(value?: string | null): Date | null {
  if (!value) return null;
  try {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function formatDate(value?: string | null, pattern = "MMM d, yyyy") {
  const d = toDate(value);
  return d ? format(d, pattern) : "—";
}

export function formatDateTime(value?: string | null) {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy · h:mm a") : "—";
}

export function formatRelative(value?: string | null) {
  const d = toDate(value);
  if (!d) return "—";
  const rel = formatDistanceToNowStrict(d, { addSuffix: true });
  return rel;
}

/** "Today", "Tomorrow", "Overdue · Sep 3" style label for scheduled work. */
export function scheduleLabel(value?: string | null, done = false) {
  const d = toDate(value);
  if (!d) return { label: "Unscheduled", tone: "muted" as const };
  if (isToday(d)) return { label: `Today · ${format(d, "h:mm a")}`, tone: "today" as const };
  if (isTomorrow(d)) return { label: `Tomorrow · ${format(d, "h:mm a")}`, tone: "soon" as const };
  if (!done && isPast(d))
    return { label: `Overdue · ${format(d, "MMM d")}`, tone: "overdue" as const };
  return { label: format(d, "MMM d, yyyy"), tone: "muted" as const };
}

export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  "#0058cc",
  "#00b0ef",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#0891b2",
  "#4f46e5",
];

/** Stable brand-palette color for an entity, from its id or name. */
export function avatarColor(seed?: string | number | null) {
  const s = String(seed ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** Readable text color (black/white) for a hex background. */
export function contrastText(hex?: string) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#111827";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

/** Soft chip styling for a tag: tinted background + strong text. */
export function tagStyle(tag: Pick<TagChip, "color">) {
  const color = tag.color && /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : "#888888";
  return { backgroundColor: `${color}1f`, color, borderColor: `${color}55` };
}

export function dealValue(deal: Pick<Deal, "lead_value">) {
  const n = parseFloat(deal.lead_value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export function weightedValue(
  deal: Pick<Deal, "lead_value">,
  stage?: Pick<PipelineStage, "probability">,
) {
  const p = (stage?.probability ?? 0) / 100;
  return dealValue(deal) * p;
}

export function sortStages<T extends Pick<PipelineStage, "sort_order" | "id">>(stages: T[]) {
  return [...stages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function truncate(s: string | undefined | null, max = 60) {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** An open deal whose expected close date has passed. */
export function isOverdue(
  expectedCloseDate?: string | null,
  status?: string,
  now: Date = new Date(),
) {
  if (status && status !== "open") return false;
  const d = toDate(expectedCloseDate);
  return !!d && d.getTime() < now.getTime();
}
