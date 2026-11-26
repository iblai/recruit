"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useGetRbacPermissionsMutation } from "@iblai/iblai-js/data-layer";
import { AgentSettingsProvider } from "@iblai/iblai-js/web-containers/next";
import { useMentorSettings } from "@iblai/iblai-js/web-utils";
import { useSession } from "@/hooks/use-session";

/**
 * The SDK's agent tabs read which agent they edit from this provider. The
 * grants are the agent's own: without them a tab renders but its buttons hide.
 */
export function AgentFrame({ agentId, children }: { agentId: string; children: ReactNode }) {
  const { tenantKey, username } = useSession();
  const { mentorDbId } = useMentorSettings({ mentorId: agentId, tenantKey }).data;
  const [getRbacPermissions] = useGetRbacPermissionsMutation();
  const [grants, setGrants] = useState<object>({});

  useEffect(() => {
    if (!mentorDbId) return;
    getRbacPermissions({
      requestBody: {
        platform_key: tenantKey,
        resources: [
          `/mentors/${mentorDbId}/`,
          `/mentors/${mentorDbId}/documents/`,
          // The connectors tab hides its Add button without these two.
          "/mcpservers/",
          `/mentors/${mentorDbId}/mcpservers/`,
        ],
      },
    })
      .unwrap()
      .then((permissions) => setGrants({ ...permissions }))
      .catch((error) => console.error("failed to load Recruit’s permissions", error));
  }, [mentorDbId, tenantKey, getRbacPermissions]);

  return (
    <AgentSettingsProvider
      tenantKey={tenantKey}
      mentorId={agentId}
      username={username}
      enableRBAC={false}
      rbacPermissions={grants}
    >
      {children}
    </AgentSettingsProvider>
  );
}
