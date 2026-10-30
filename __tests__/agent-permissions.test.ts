import { configureStore } from "@reduxjs/toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRbacPermission,
  selectMentorPermissionsLoaded,
  selectRbacPermissions,
} from "@iblai/iblai-js/web-utils";
import { loadAgentPermissions } from "../lib/recruit/use-agent-permissions";
import { reducer } from "../store/iblai-store";

const newStore = () =>
  configureStore({ reducer, middleware: (defaults) => defaults({ serializableCheck: false }) });

describe("the Chief of Staff's permissions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets the SDK composer through once the platform answers", async () => {
    const store = newStore();
    // The composer stays disabled while this is false.
    expect(selectMentorPermissionsLoaded(store.getState())).toBe(false);

    await loadAgentPermissions(store.dispatch, async () => ({ "/mentors/7/": { chat: true } }));

    const state = store.getState();
    expect(selectMentorPermissionsLoaded(state)).toBe(true);
    expect(checkRbacPermission(selectRbacPermissions(state), "/mentors/7/#chat")).toBe(true);
  });

  it("marks the answer in after a failed request too, and logs the failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = newStore();

    await loadAgentPermissions(store.dispatch, () => Promise.reject(new Error("offline")));

    expect(selectMentorPermissionsLoaded(store.getState())).toBe(true);
    expect(logged).toHaveBeenCalledOnce();
  });
});
