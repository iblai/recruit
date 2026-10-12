/**
 * Redux store: the SDK's RTK Query caches + the slices its components expect,
 * plus our own CRM API slice.
 */
import { configureStore } from "@reduxjs/toolkit";
import { coreApiSlice, mentorReducer, mentorMiddleware } from "@iblai/iblai-js/data-layer";
import {
  hostChatReducer,
  chatInputSliceReducer,
  chatSliceReducerShared,
  filesReducer,
  rbacReducer,
  subscriptionReducer,
  topBannerReducer,
} from "@iblai/iblai-js/web-utils";
import { crmApi } from "@/lib/crm/api";

export const iblaiStore = configureStore({
  reducer: {
    [coreApiSlice.reducerPath]: coreApiSlice.reducer,
    ...mentorReducer,
    [crmApi.reducerPath]: crmApi.reducer,

    // The SDK selectors hard-code these slice keys — do not rename them.
    chat: hostChatReducer,
    chatInput: chatInputSliceReducer,
    chatSliceShared: chatSliceReducerShared,
    files: filesReducer,
    rbac: rbacReducer,
    subscription: subscriptionReducer,
    topBanner: topBannerReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false })
      .concat(coreApiSlice.middleware)
      .concat(crmApi.middleware)
      .concat(...mentorMiddleware),
});

export type IblaiRootState = ReturnType<typeof iblaiStore.getState>;
export type IblaiAppDispatch = typeof iblaiStore.dispatch;
