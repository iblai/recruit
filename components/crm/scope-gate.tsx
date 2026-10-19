"use client";

import type { ReactNode } from "react";
import { useSelector } from "react-redux";
import { CircleAlert } from "lucide-react";
import { EmptyState } from "@/components/crm/empty-state";
import { SCOPE_MISSING } from "@/lib/crm/app";
import type { CrmApiError } from "@/lib/crm/types";
import type { IblaiRootState } from "@/store/iblai-store";

/** The scope refusal a CRM call ended in: recruit's own check, or the platform's 503. */
function refusal(entry?: { error?: unknown }): string | undefined {
  const error = entry?.error as CrmApiError | undefined;
  if (error?.detail === SCOPE_MISSING) return SCOPE_MISSING;
  const data = error?.data as { code?: unknown } | undefined;
  return data?.code === "app_scope_unavailable" ? error?.detail : undefined;
}

/**
 * Once any CRM call finds the platform can't keep recruit's records apart,
 * every page says so — a page that took the failure for "no records yet"
 * would look like an empty CRM.
 */
export function CrmScopeGate({ children }: { children: ReactNode }) {
  const detail = useSelector((state: IblaiRootState) =>
    [...Object.values(state.crmApi.queries), ...Object.values(state.crmApi.mutations)]
      .map(refusal)
      .find(Boolean),
  );
  if (!detail) return <>{children}</>;
  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <EmptyState
        icon={<CircleAlert />}
        title="Recruit can’t open this organization’s CRM"
        description={detail}
      />
    </div>
  );
}
