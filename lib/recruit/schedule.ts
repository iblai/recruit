/**
 * The scheduled task that makes outreach proactive: once a day the platform
 * runs the Chief of Staff with this prompt. It only drafts; a person approves.
 */

import { CHANNELS, type FoundPlatform } from "./found";

/** The task's name, and how the app finds it again. */
export const OUTREACH_TASK = "Daily outreach";

export const OUTREACH_PROMPT = `Run today's outreach.
1. Call list_outreach_due.
2. For each person it returns, write one short, warm message in the institution's voice with one clear next step, and queue it with queue_message, with the channel and kind it gives. Pass the event when the reason names one. Use a link only when it gives one, exactly as given; state no cost, deadline or requirement.
3. Queue nothing for anyone it did not return, and do not work around a refusal.
4. When it reports people left over, call it again and go on with anyone it returns that you have not seen yet; stop when it returns no one new.
Finish with one line: how many you queued, and how many were refused and why. You send nothing: every message waits under Needs you for a person.`;

export interface Crontab {
  minute: string;
  hour: string;
  day_of_week: string;
  day_of_month: string;
  month_of_year: string;
}

/**
 * Every day at `hour` o'clock by the viewer's clock, from the next time it
 * comes round. The platform's scheduler runs in UTC and takes no time zone.
 */
// ponytail: a fixed UTC hour, so an hour off after a clock change; a zone on the task when the platform takes one.
export function dailyAt(hour: number, now = new Date()): { crontab: Crontab; start_time: string } {
  const start = new Date(now);
  start.setHours(hour, 0, 0, 0);
  if (start <= now) start.setDate(start.getDate() + 1);
  return {
    crontab: {
      minute: String(start.getUTCMinutes()),
      hour: String(start.getUTCHours()),
      day_of_week: "*",
      day_of_month: "*",
      month_of_year: "*",
    },
    start_time: start.toISOString(),
  };
}

/** The viewer's clock time of a daily task, for the line that says when it runs; "" when it is not daily. */
export function localTime(crontab: Partial<Crontab> | undefined, locale = "en"): string {
  const hour = Number(crontab?.hour);
  const minute = Number(crontab?.minute);
  if (!crontab || !Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  const at = new Date();
  at.setUTCHours(hour, minute, 0, 0);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
    .format(at)
    .replace(/[\u00a0\u2009\u202f]/g, " ");
}

/** The viewer's weekday of a weekly task; "" when it runs every day. */
export function localWeekday(crontab: Partial<Crontab> | undefined, locale = "en"): string {
  const day = Number(crontab?.day_of_week);
  const hour = Number(crontab?.hour);
  const minute = Number(crontab?.minute);
  if (!crontab || ![day, hour, minute].every(Number.isInteger)) return "";
  const at = new Date();
  at.setUTCHours(hour, minute, 0, 0);
  at.setUTCDate(at.getUTCDate() + ((day - at.getUTCDay() + 7) % 7));
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(at);
}

/** A weekly task on `weekday` (0 is Sunday) at `hour` by the viewer's clock, from the next time it comes round. */
export function weeklyAt(
  hour: number,
  weekday: number,
  now = new Date(),
): { crontab: Crontab; start_time: string } {
  const start = new Date(now);
  start.setHours(hour, 0, 0, 0);
  start.setDate(start.getDate() + ((weekday - start.getDay() + 7) % 7));
  if (start <= now) start.setDate(start.getDate() + 7);
  return {
    crontab: {
      minute: String(start.getUTCMinutes()),
      hour: String(start.getUTCHours()),
      day_of_week: String(start.getUTCDay()),
      day_of_month: "*",
      month_of_year: "*",
    },
    start_time: start.toISOString(),
  };
}

/** A one-off task's schedule: its first minute from now, after which the platform turns it off. */
export function rightAway(now = new Date()): { crontab: Crontab; start_time: string } {
  return {
    crontab: { minute: "*", hour: "*", day_of_week: "*", day_of_month: "*", month_of_year: "*" },
    start_time: now.toISOString(),
  };
}

/** How a saved search's task is told from the platform's other tasks. */
export const FIND_PREFIX = "Find students: ";

/** Who a saved search looks for, and how often; it runs as a platform task with `findingPrompt`. */
export interface SavedSearch {
  program: string;
  area: string;
  classYear?: string;
  channels: FoundPlatform[];
  /** Hashtags, subreddits, search terms; the agent chooses when empty. */
  where?: string;
  every: "day" | "week";
}

export function findingTitle(s: SavedSearch): string {
  return `${FIND_PREFIX}${s.program} · ${s.area}${s.classYear ? ` · ${s.classYear}` : ""}`;
}

/** What the Chief of Staff is told on each run: the search, then the rules every shortlist keeps. */
export function findingPrompt(s: SavedSearch): string {
  const criteria = `Students interested in ${s.program} who live or study in ${s.area}${s.classYear ? `, class of ${s.classYear}` : ""}`;
  return `Run the saved search "${criteria}".
Channels: ${s.channels.map((p) => CHANNELS[p].label).join(", ")}. Where to look: ${s.where?.trim() || "public hashtags, subreddits, search terms and videos you choose to fit the program and the area"}.
1. On each channel, look the way your instructions say, with the Apify connector's scrapers: at most 50 results a call, public posts only.
2. Keep only people who say in their own words that they are interested in this program or its field, and that they live or study in this area. Leave out anyone who says or appears to be under 16, and anyone not writing about themselves.
3. Call shortlist_found_students once with the people you keep, at most 50 (the best matches), the criteria "${criteria}", and where you looked as the source. If it refuses, stop and report why.
4. Finish with one line: how many you proposed on each channel, and why any channel gave none.`;
}
