import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import zh from "../messages/zh.json";

/** Every key path of a message tree, with the value's emptiness. */
function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "object" && v
      ? keys(v, `${prefix}${k}.`)
      : [`${prefix}${k}${v ? "" : " (empty)"}`],
  );
}

describe("messages", () => {
  it("carry the same keys, none empty, in every locale", () => {
    const want = keys(en);
    expect(want.filter((k) => k.endsWith("(empty)"))).toEqual([]);
    for (const locale of [es, fr, zh]) expect(keys(locale)).toEqual(want);
  });
});
