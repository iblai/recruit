import { describe, expect, it } from "vitest";
import * as dataLayer from "@iblai/iblai-js/data-layer";
import * as webContainers from "@iblai/iblai-js/web-containers/next";
import * as webUtils from "@iblai/iblai-js/web-utils";
import { iblaiStore, reducer } from "../store/iblai-store";

/**
 * Every value the SDK's state packages export, named. A bump that adds an API
 * or a slice the store does not mount fails here instead of in a chat: an
 * RTK Query hook whose API is missing notifies the whole store mid-render.
 */
const sdkExports = Object.entries({
  "data-layer": dataLayer,
  "web-utils": webUtils,
  "web-containers/next": webContainers,
}).flatMap(([pkg, ns]) =>
  Object.entries(ns as Record<string, unknown>).map(([name, value]) => ({
    label: `${pkg} ${name}`,
    name,
    value,
  })),
);

type Probed = {
  reducerPath: string;
  internalActions: { internal_getRTKQSubscriptions: () => { type: string } };
};
type SliceLike = { reducerPath: string; reducer: unknown };

const isApi = (v: unknown): v is Probed =>
  typeof v === "object" && v !== null && "reducerPath" in v && "internalActions" in v;
const isSlice = (v: unknown): v is SliceLike =>
  typeof v === "object" &&
  v !== null &&
  "reducerPath" in v &&
  "reducer" in v &&
  "actions" in v &&
  !("internalActions" in v);

describe("the store holds all the SDK state", () => {
  it("mounts every RTK Query API, and its middleware answers the hooks' probe", () => {
    // Each API middleware announces itself on the first action it sees.
    iblaiStore.dispatch({ type: "store-test/warm-up" });
    let notified = 0;
    const unsubscribe = iblaiStore.subscribe(() => notified++);
    const missing = sdkExports.filter(({ value }) => {
      if (!isApi(value)) return false;
      const before = notified;
      iblaiStore.dispatch(value.internalActions.internal_getRTKQSubscriptions());
      return !(value.reducerPath in iblaiStore.getState()) || notified !== before;
    });
    unsubscribe();
    expect(sdkExports.filter(({ value }) => isApi(value)).length).toBeGreaterThan(60);
    expect(
      missing.map(({ label }) => label),
      "not mounted by store/iblai-store.ts",
    ).toEqual([]);
  });

  it("mounts every exported reducer, each slice at its own key", () => {
    const byKey: Record<string, unknown> = reducer;
    const mounted = new Set(Object.values(byKey));
    const missing = sdkExports.flatMap(({ label, name, value }) => {
      if (isSlice(value))
        return byKey[value.reducerPath] === value.reducer
          ? []
          : [`${label} at "${value.reducerPath}"`];
      if (typeof value === "function" && /Reducer(Shared)?$/.test(name))
        return mounted.has(value) ? [] : [label];
      return [];
    });
    expect(
      missing,
      "mount these in store/iblai-store.ts under the keys the SDK selectors read",
    ).toEqual([]);
  });
});
