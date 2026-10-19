import { afterEach, describe, expect, it } from "vitest";
import { confirmScope, forgetScope, isOwnRecords, scopeConfirmed, withApp } from "../lib/crm/app";

const mine = { id: 1, app: "recruit" };
const theirs = { id: 2, app: "" };
const unscoped = { id: 3 }; // a platform without the app scope

afterEach(() => forgetScope());

describe("withApp", () => {
  it("adds the app to any query", () => {
    expect(withApp("/persons/")).toBe("/persons/?app=recruit");
    expect(withApp("/persons/?page_size=5")).toBe("/persons/?page_size=5&app=recruit");
  });
});

describe("isOwnRecords", () => {
  it("holds every row of a list to recruit's app", () => {
    expect(isOwnRecords("/persons/", { results: [mine, mine] })).toBe(true);
    expect(isOwnRecords("/persons/?page=2", { results: [mine, theirs] })).toBe(false);
    expect(isOwnRecords("/pipelines/", { results: [unscoped] })).toBe(false);
    expect(isOwnRecords("/deals/", { results: [] })).toBe(true);
  });

  it("holds a record, the search buckets and the overview to it", () => {
    expect(isOwnRecords("/deals/7/", mine)).toBe(true);
    expect(isOwnRecords("/web-forms/open-house/", theirs)).toBe(false);
    expect(isOwnRecords("/search/", { persons: [mine], deals: [mine] })).toBe(true);
    expect(isOwnRecords("/search/", { persons: [mine], organizations: [unscoped] })).toBe(false);
    expect(isOwnRecords("/overview/", { app: "recruit", persons: { count: 1 } })).toBe(true);
    expect(isOwnRecords("/overview/", { persons: { count: 1 } })).toBe(false);
  });

  it("leaves what carries no app of its own to its record", () => {
    const answers: [string, object][] = [
      ["/pipelines/3/stages/", { results: [unscoped] }],
      ["/web-forms/open-house/submissions/", { results: [unscoped] }],
      ["/persons/merge/", { primary_id: "p1", merged_ids: ["p2"] }],
      ["/persons/p1/metadata/", { id: "p1", metadata: {} }],
      ["/members/", { results: [unscoped] }],
    ];
    const verdicts = answers.map(([path, body]) => [path, isOwnRecords(path, body)]);
    expect(verdicts).toEqual(answers.map(([path]) => [path, true]));
  });
});

describe("confirmScope", () => {
  it("confirms only an overview that echoes recruit's app, then remembers it", () => {
    expect(confirmScope({})).toBe(false);
    expect(confirmScope({ app: "" })).toBe(false);
    expect(scopeConfirmed()).toBe(false);
    expect(confirmScope({ app: "recruit" })).toBe(true);
    expect(confirmScope(null)).toBe(true);
    expect(scopeConfirmed()).toBe(true);
  });
});
