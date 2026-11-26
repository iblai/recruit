import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findingPrompt,
  findingTitle,
  localWeekday,
  rightAway,
  weeklyAt,
  type SavedSearch,
} from "../lib/recruit/schedule";

const search: SavedSearch = {
  program: "Business",
  area: "New York City area",
  classYear: "2027",
  channels: ["instagram", "x"],
  every: "week",
};

afterEach(() => vi.unstubAllEnvs());

describe("a saved search", () => {
  it("is a task the app can tell apart, whose prompt holds the search and ends in a shortlist", () => {
    expect(findingTitle(search)).toBe("Find students: Business · New York City area · 2027");
    const prompt = findingPrompt(search);
    expect(prompt).toMatch(
      /criteria "Students interested in Business who live or study in New York City area, class of 2027"/,
    );
    expect(prompt).toMatch(/Channels: Instagram, X\./);
    expect(prompt).toMatch(/shortlist_found_students once/);
    // More than the tool takes would lose the whole run.
    expect(prompt).toMatch(/at most 50 \(the best matches\)/);
    expect(prompt).toMatch(/under 16/);
    // No hints given: the agent chooses where to look.
    expect(prompt).toMatch(/Where to look: public hashtags/);
    expect(findingPrompt({ ...search, where: " r/nyc, #nycstudents " })).toMatch(
      /Where to look: r\/nyc, #nycstudents\./,
    );
  });

  it("runs weekly on the viewer's weekday and hour, written in the scheduler's UTC", () => {
    vi.stubEnv("TZ", "America/New_York");
    // Wednesday 2027-03-10, noon in New York: next Monday 7:00 there is 11:00 UTC (daylight time from Mar 14).
    const { crontab, start_time } = weeklyAt(7, 1, new Date("2027-03-10T17:00:00Z"));
    expect(start_time).toBe("2027-03-15T11:00:00.000Z");
    expect(crontab).toEqual({
      minute: "0",
      hour: "11",
      day_of_week: "1",
      day_of_month: "*",
      month_of_year: "*",
    });
    expect(localWeekday(crontab)).toBe("Monday");
  });

  it("moves to the scheduler's next day when the viewer's morning is its evening before", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    // Monday 7:00 in Tokyo is Sunday 22:00 UTC.
    const { crontab } = weeklyAt(7, 1, new Date("2027-03-10T03:00:00Z"));
    expect(crontab).toMatchObject({ hour: "22", day_of_week: "0" });
    expect(localWeekday(crontab)).toBe("Monday");
    expect(localWeekday({ ...crontab, day_of_week: "*" })).toBe("");
  });

  it("runs now once: every minute from now, which the one-off flag stops after the first", () => {
    const now = new Date("2027-03-10T17:00:00Z");
    expect(rightAway(now)).toEqual({
      crontab: { minute: "*", hour: "*", day_of_week: "*", day_of_month: "*", month_of_year: "*" },
      start_time: "2027-03-10T17:00:00.000Z",
    });
  });
});
