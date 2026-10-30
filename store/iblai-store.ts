/**
 * Redux store: every RTK Query API the SDK exports, the plain slices its
 * components select, and our own CRM API slice. `__tests__/store.test.ts`
 * names any SDK state this misses.
 */
import { configureStore, type Middleware, type Reducer } from "@reduxjs/toolkit";
import * as dataLayer from "@iblai/iblai-js/data-layer";
import { imagePreviewsReducer } from "@iblai/iblai-js/web-containers/next";
import {
  appleRestrictionReducer,
  hostChatReducer,
  chatInputSliceReducer,
  chatSliceReducerShared,
  filesReducer,
  monetizationSlice,
  rbacReducer,
  subscriptionReducer,
  topBannerReducer,
} from "@iblai/iblai-js/web-utils";
import { crmApi } from "@/lib/crm/api";

type RtkApi = { reducerPath: string; reducer: Reducer; middleware: Middleware };

const isRtkApi = (v: unknown): v is RtkApi =>
  typeof v === "object" &&
  v !== null &&
  "reducerPath" in v &&
  "middleware" in v &&
  "injectEndpoints" in v;

// All of them, not mentorReducer's pick: it leaves out mcpApiSlice, which the chat composer queries.
const sdkApis = [...new Set(Object.values(dataLayer as Record<string, unknown>).filter(isRtkApi))];

const appReducers = {
  [crmApi.reducerPath]: crmApi.reducer,

  // The SDK selectors hard-code these slice keys — do not rename them.
  chat: hostChatReducer,
  chatInput: chatInputSliceReducer,
  chatSliceShared: chatSliceReducerShared,
  files: filesReducer,
  rbac: rbacReducer,
  subscription: subscriptionReducer,
  topBanner: topBannerReducer,
  imagePreviews: imagePreviewsReducer,
  appleRestriction: appleRestrictionReducer,
  monetization: monetizationSlice.reducer,
};

const claimedTwice = sdkApis
  .map((api) => api.reducerPath)
  .filter((path, i, paths) => path in appReducers || paths.indexOf(path) !== i);
if (claimedTwice.length > 0) {
  throw new Error(`Store reducer paths claimed twice: ${claimedTwice.join(", ")}`);
}

export const reducer = {
  ...Object.fromEntries(sdkApis.map((api) => [api.reducerPath, api.reducer])),
  ...appReducers,
};

export const iblaiStore = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false })
      .concat(...sdkApis.map((api) => api.middleware))
      .concat(crmApi.middleware),
});

export type IblaiRootState = ReturnType<typeof iblaiStore.getState>;
export type IblaiAppDispatch = typeof iblaiStore.dispatch;
