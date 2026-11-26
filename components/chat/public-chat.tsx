"use client";

import { useCallback, useEffect, useState } from "react";
import { Provider as ReduxProvider, useDispatch } from "react-redux";
import { Toaster } from "sonner";
import { initializeDataLayer } from "@iblai/iblai-js/data-layer";
import { Chat, type ChatConfig } from "@iblai/iblai-js/web-containers/next";
import {
  AuthContextProvider,
  TenantContextProvider,
  chatActions,
  markMentorPermissionsLoaded,
} from "@iblai/iblai-js/web-utils";
import { BrandHeader, type Branding } from "@/components/landing/landing-page-view";
import { LoadingScreen } from "@/components/loading-screen";
import config from "@/lib/iblai/config";
import { iblaiStore } from "@/store/iblai-store";

export interface PublicChatProps {
  org: string;
  agentId: string;
  branding: Branding;
  /** The platform's public metadata, which the chat reads for its own chrome. */
  orgMetadata: Record<string, unknown>;
  /** What the agent is told about where the visitor is, and the page's slug if any. */
  pageContent: string;
  page?: string;
  /** Sites that may host this page in a frame. */
  websiteOrigins: string[];
  notice: string;
  busy: string;
  /** Inside one of this app's landing pages, which already carries the brand. */
  framed?: boolean;
}

// A visitor holds no session: a staff sign-in in the same browser must not ride along.
const visitorStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};
const nothing = () => {};
const visitor = {
  userIsAccessingPublicRoute: true,
  isLoggedIn: false,
  setUserIsAccessingPublicRoute: nothing,
};

/**
 * Recruit, for a visitor who is not signed in: the SDK `Chat` under the
 * university's brand. The app's own providers would send a visitor to sign in,
 * so this page supplies the two contexts `Chat` reads and nothing else.
 */
export function PublicChat(props: PublicChatProps) {
  return (
    <ReduxProvider store={iblaiStore}>
      <Visitor {...props} />
    </ReduxProvider>
  );
}

function Visitor({
  org,
  agentId,
  branding,
  orgMetadata,
  pageContent,
  page,
  websiteOrigins,
  notice,
  busy,
  framed = false,
}: PublicChatProps) {
  const dispatch = useDispatch();
  const [ready] = useState(() => {
    if (typeof window === "undefined") return false;
    initializeDataLayer(config.dmUrl(), config.lmsUrl(), config.legacyLmsUrl(), visitorStorage, {});
    return true;
  });
  const [mounted, setMounted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    // Without it the composer waits for permissions a visitor never has.
    dispatch(markMentorPermissionsLoaded());
    setMounted(true);
  }, [dispatch]);

  // The agent reads this on every turn and hands `conversation` to its tools.
  const onSessionChange = useCallback(
    (conversation: string) => {
      const embedded = window.self !== window.top;
      dispatch(
        chatActions.setIframeContext({
          hostInfo: { title: document.title, href: window.location.origin },
          pageContent,
          metadata: {
            conversation,
            source: framed ? "landing-page" : embedded ? "site-widget" : "chat-page",
            ...(page && { page }),
          },
        }),
      );
    },
    [dispatch, pageContent, page, framed],
  );

  if (!ready || !mounted) return <LoadingScreen />;

  const chatConfig: ChatConfig = {
    baseWsUrl: () => config.baseWsUrl(),
    supportEmail: () => branding.contactEmail || config.supportEmail(),
    authUrl: () => config.authUrl(),
    mainTenantKey: config.mainTenantKey(),
    navigateToAdminBilling: nothing,
    navigateToExplore: nothing,
    navigateToMentor: nothing,
    features: {
      voiceCall: false,
      dictation: false,
      screenShare: false,
      fileUpload: false,
      camera: false,
      canvas: false,
      memory: false,
      prompts: false,
      skills: false,
      cowork: false,
    },
    onSessionChange,
    on402Error: () => setUnavailable(true),
    freeTrialDialog: null,
    allowedParentOrigins: websiteOrigins,
  };

  return (
    <AuthContextProvider value={visitor}>
      <TenantContextProvider
        value={{
          determineUserPath: false,
          setDetermineUserPath: nothing,
          tenantKey: org,
          setTenantKey: nothing,
          metadata: orgMetadata,
          setMetadata: nothing,
        }}
      >
        <Toaster position="bottom-right" richColors closeButton />
        <div className="flex h-dvh flex-col bg-white">
          {framed ? null : <BrandHeader branding={branding} />}
          <p
            data-testid="ai-notice"
            className="border-b border-[var(--border-color,#e5e7eb)] px-4 py-2 text-center text-xs text-gray-600"
          >
            {unavailable ? busy : notice}
          </p>
          <div className="flex min-h-0 flex-1 flex-col">
            <Chat
              embed
              isPublicRoute
              isPreviewMode={false}
              mentorId={agentId}
              tenantKey={org}
              config={chatConfig}
              redirectToAuthSpa={nothing}
              username={null}
              userTenants={[]}
              axdToken=""
              userIsStudent
              showConversationStarters
              showExploreMentors={false}
              slashSkillsEnabled={false}
            />
          </div>
        </div>
      </TenantContextProvider>
    </AuthContextProvider>
  );
}
