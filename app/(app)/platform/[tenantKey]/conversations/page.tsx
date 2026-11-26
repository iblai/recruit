"use client";

import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { AgentHistoryTab } from "@iblai/iblai-js/web-containers/next";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { EmptyState } from "@/components/crm/empty-state";
import { PageHeader } from "@/components/crm/page-header";
import { AgentFrame } from "@/components/recruit/agent-frame";
import { useSession } from "@/hooks/use-session";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

/** Every conversation Recruit had: the question, the sources it answered from, what it did. */
export default function ConversationsPage() {
  const t = useTranslations("recruit.conversations");
  const { href } = useSession();
  const { settings, isLoading } = useRecruitSettings();
  useBreadcrumbs([{ label: t("title"), href: href("/conversations") }]);
  const agentId = settings.studentAgentId ?? "";

  return (
    <>
      <PageHeader icon={<MessagesSquare />} title={t("title")} />
      {agentId ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-white">
          <AgentFrame agentId={agentId}>
            <AgentHistoryTab currentSPA="recruit" />
          </AgentFrame>
        </div>
      ) : isLoading ? null : (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <EmptyState
            icon={<MessagesSquare />}
            title={t("noAgent")}
            description={t("noAgentBody")}
          />
        </div>
      )}
    </>
  );
}
