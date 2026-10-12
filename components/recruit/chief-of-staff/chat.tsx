"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chat, type ChatConfig } from "@iblai/iblai-js/web-containers/next";
import {
  useAxdToken,
  useCachedSessionId,
  useUserTenants,
  useUsername,
  useVisitingTenant,
} from "@iblai/iblai-js/web-utils";
import { useAdminMode } from "@/components/crm/admin-mode";
import { useSession } from "@/hooks/use-session";
import { redirectToAuthSpa } from "@/lib/iblai/auth-utils";
import config from "@/lib/iblai/config";

/**
 * The conversation with the Chief of Staff — the SDK's in-process `Chat`
 * surface (message stream, attachments, voice, prompt gallery), for the
 * organization in the URL. Nothing is styled or overridden on the SDK
 * component itself.
 *
 * Session handling follows /iblai-vibe-agent-chat: the SDK reads its cached
 * session map once at mount, so `?session=<id>` (resume) and `?new=<nonce>`
 * (fresh chat) are seeded before mounting, and the component is keyed on them
 * — that key is the only legitimate remount.
 */
export function ChiefOfStaffChat({ agentId }: { agentId: string }) {
  return (
    <Suspense fallback={null}>
      <ChatInner agentId={agentId} />
    </Suspense>
  );
}

function ChatInner({ agentId }: { agentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantKey, href } = useSession();
  const { adminMode } = useAdminMode();

  const restoreSessionId = searchParams.get("session") ?? undefined;
  const newParam = searchParams.get("new") ?? undefined;
  const [cachedSessionId, saveCachedSessionId] = useCachedSessionId();
  const [seededFor, setSeededFor] = useState<string | undefined>(
    restoreSessionId || newParam ? undefined : "none",
  );
  useEffect(() => {
    if (!agentId) {
      setSeededFor("none");
      return;
    }
    const map = { ...((cachedSessionId ?? {}) as Record<string, string>) };
    if (restoreSessionId) {
      if (map[agentId] !== restoreSessionId) {
        saveCachedSessionId({ ...map, [agentId]: restoreSessionId });
      }
      setSeededFor(restoreSessionId);
    } else if (newParam) {
      if (map[agentId]) {
        delete map[agentId];
        saveCachedSessionId(map);
      }
      setSeededFor(`new:${newParam}`);
    } else {
      setSeededFor("none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreSessionId, newParam, agentId]);
  const sessionReady = restoreSessionId
    ? seededFor === restoreSessionId
    : newParam
      ? seededFor === `new:${newParam}`
      : true;

  const username = useUsername();
  const axdToken = useAxdToken();
  const { userTenants } = useUserTenants();
  const { visitingTenant } = useVisitingTenant();

  const chatConfig: ChatConfig = {
    baseWsUrl: () => config.baseWsUrl(),
    supportEmail: () => config.supportEmail(),
    authUrl: () => config.authUrl(),
    mainTenantKey: config.mainTenantKey(),
    navigateToAdminBilling: () =>
      window.open(
        `${config.osUrl()}/platform/${encodeURIComponent(tenantKey)}`,
        "_blank",
        "noopener",
      ),
    navigateToExplore: () => router.push(href()),
    navigateToMentor: () => router.push(href()),
  };

  if (!tenantKey || !agentId || !sessionReady) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Chat
        key={`${agentId}:${restoreSessionId ?? ""}:${newParam ?? ""}`}
        isPreviewMode={false}
        mentorId={agentId}
        tenantKey={tenantKey}
        config={chatConfig}
        redirectToAuthSpa={(to, key, logout) => void redirectToAuthSpa(to, key, logout)}
        username={username ?? null}
        userTenants={userTenants ?? []}
        visitingTenant={visitingTenant}
        axdToken={axdToken ?? ""}
        userIsStudent={!adminMode}
        showExploreMentors={false}
      />
    </div>
  );
}
