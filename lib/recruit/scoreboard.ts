/**
 * The scoreboard's numbers, from what the platform records and nothing else:
 * a figure it cannot back is `null`, and the screen says "Not recorded".
 */
import type { Activity, CrmOverviewStage, Person } from "../crm/types";
import { CHANNELS, PLATFORMS, foundOf, shortlistOf, type FoundPlatform } from "./found";

/** The title of the note the platform writes on every stage move (`crm/services/pipeline.py`). */
export const STAGE_CHANGED = "Stage changed";

const ordered = (byStage: CrmOverviewStage[]) =>
  [...byStage].sort((a, b) => (a.stage.sort_order ?? 0) - (b.stage.sort_order ?? 0));

/** How many of these moments fall outside weekdays 9 to 5, in the viewer's time zone. */
export function outsideOfficeHours(startedAt: string[]): number {
  return startedAt.filter((at) => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return false;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return weekend || d.getHours() < 9 || d.getHours() >= 17;
  }).length;
}

/** The platform's median model latency (milliseconds) as seconds; `null` when it sent none. */
export function medianSeconds(rows: Array<Record<string, unknown>> | undefined): number | null {
  const ms = rows?.[0]?.p50_latency;
  return typeof ms === "number" && Number.isFinite(ms) ? Math.round(ms / 100) / 10 : null;
}

/** The last 30 days and the same days a year earlier, as the platform's `start_date`/`end_date`. */
export function windows(now: Date) {
  const day = (years: number, back: number) =>
    new Date(Date.UTC(now.getFullYear() - years, now.getMonth(), now.getDate() - back))
      .toISOString()
      .slice(0, 10);
  return [0, 1].map((years) => ({ start_date: day(years, 29), end_date: day(years, 0) }));
}

/** The last `n` days up to today, as the platform's `start_date`/`end_date`. */
export function lastDays(now: Date, n: number) {
  const day = (back: number) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - back))
      .toISOString()
      .slice(0, 10);
  return { start_date: day(n - 1), end_date: day(0) };
}

/** One row of "Where students are talking". */
export interface ChatterRow {
  label: string;
  proposed: number;
  kept: number;
}

/**
 * Where the agents found students and how many a person kept, from shortlists
 * and kept students alone. On a channel, proposed is kept + passed over +
 * waiting: a list nobody reviewed in 14 days lost its people, so it counts
 * under the places the agent looked only.
 */
export function chatter(
  shortlists: Pick<Activity, "metadata" | "is_done">[],
  kept: Pick<Person, "metadata">[],
): { channels: (ChatterRow & { platform: FoundPlatform })[]; places: ChatterRow[] } {
  const passed = shortlists
    .flatMap((a) => (Array.isArray(a.metadata?.passed) ? a.metadata.passed : []))
    .filter((u): u is string => typeof u === "string");
  const waiting = shortlists.filter((a) => !a.is_done).flatMap((a) => shortlistOf(a)?.people ?? []);
  const channels = PLATFORMS.map((platform) => {
    const here = kept.filter((p) => foundOf(p)?.platform === platform).length;
    const proposed =
      here +
      passed.filter((u) => u.startsWith(`${platform}:`)).length +
      waiting.filter((c) => c.platform === platform).length;
    return { platform, label: CHANNELS[platform].label, proposed, kept: here };
  });
  const places = new Map<string, ChatterRow>();
  for (const a of shortlists) {
    const list = shortlistOf(a);
    if (!list?.source) continue;
    const key = list.source.toLowerCase();
    const row = places.get(key) ?? { label: list.source, proposed: 0, kept: 0 };
    row.proposed += list.proposed;
    row.kept += list.kept ?? 0;
    places.set(key, row);
  }
  return {
    channels,
    places: [...places.values()].sort((a, b) => b.proposed - a.proposed).slice(0, 8),
  };
}

type Note = Pick<Activity, "title" | "comment">;

/** Noted moves as positions in the funnel; the note names stages, so a name the funnel lacks is dropped. */
function moves(notes: Note[], stages: CrmOverviewStage[]) {
  const at = (name = "") => stages.findIndex((s) => s.stage.name === name.trim());
  return notes
    .filter((n) => n.title === STAGE_CHANGED)
    .map((n) => (n.comment ?? "").split(" → "))
    .map(([from, to]) => ({ from: at(from), to: at(to) }))
    .filter((m) => m.from >= 0 && m.to >= 0);
}

/** Noted moves from before `code` to it or a later open stage; `null` when the funnel has no such stage. */
export function reached(notes: Note[], byStage: CrmOverviewStage[], code: string): number | null {
  const stages = ordered(byStage);
  const i = stages.findIndex((s) => s.stage.code === code);
  if (i < 0) return null;
  return moves(notes, stages).filter((m) => m.from < i && m.to >= i && !stages[m.to].stage.is_lost)
    .length;
}

/** Noted moves into a lost stage from `code` or a later open one; `null` when the funnel has no such stage. */
export function lostFrom(notes: Note[], byStage: CrmOverviewStage[], code: string): number | null {
  const stages = ordered(byStage);
  const i = stages.findIndex((s) => s.stage.code === code);
  if (i < 0) return null;
  return moves(notes, stages).filter(
    (m) => m.from >= i && !stages[m.from].stage.is_lost && stages[m.to].stage.is_lost,
  ).length;
}
