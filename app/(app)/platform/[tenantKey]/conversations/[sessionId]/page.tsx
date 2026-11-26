"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useGetTranscriptsMessagesDetailsQuery } from "@iblai/iblai-js/data-layer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { EmptyState } from "@/components/crm/empty-state";
import { PageHeader } from "@/components/crm/page-header";
import { useSession } from "@/hooks/use-session";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

// The platform saves the context it appended to a visitor's message; a reader does not need it.
const said = (text: string) =>
  text.replace(/\s*<CONTEXT METADATA>[\s\S]*?<\/END CONTEXT METADATA>/g, "").trim();
const named = (
  list: Array<{ title?: string | null; source?: string | null; name?: string | null }>,
) => [...new Set(list.map((x) => x.title || x.source || x.name).filter(Boolean))].join(" · ");

/**
 * One conversation, as a counselor reads it before stepping in: what was
 * asked, what Recruit answered, from which sources, and what it did.
 */
export default function ConversationPage() {
  const t = useTranslations("recruit.conversations");
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ? decodeURIComponent(params.sessionId) : "";
  const { tenantKey, href } = useSession();
  const { settings } = useRecruitSettings();
  const { data, isLoading } = useGetTranscriptsMessagesDetailsQuery(
    {
      session_id: sessionId,
      platform_key: tenantKey,
      ...(settings.studentAgentId && { mentor_unique_id: settings.studentAgentId }),
    },
    { skip: !sessionId || !tenantKey },
  );
  useBreadcrumbs([{ label: t("title"), href: href("/conversations") }, { label: t("transcript") }]);
  const started = data?.summary?.created_at ? new Date(data.summary.created_at) : null;

  return (
    <>
      <PageHeader
        icon={<MessagesSquare />}
        title={t("transcript")}
        description={started ? started.toLocaleString() : undefined}
      />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : !data?.messages?.length ? (
          <EmptyState
            icon={<MessagesSquare />}
            title={t("notFound")}
            description={t("notFoundBody")}
            action={
              <Button variant="outline" render={<Link href={href("/conversations")} />}>
                <ArrowLeft data-icon="inline-start" /> {t("back")}
              </Button>
            }
          />
        ) : (
          <ol data-testid="transcript" className="mx-auto grid max-w-3xl gap-4">
            {data.messages.map((turn, i) => (
              <li key={i} className="grid gap-2 text-sm leading-6">
                {said(turn.human) ? (
                  <div>
                    <p className="text-[11px] font-medium text-gray-500">{t("visitor")}</p>
                    <p className="whitespace-pre-wrap text-gray-900">{said(turn.human)}</p>
                  </div>
                ) : null}
                {turn.ai ? (
                  <div className="rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-3">
                    <p className="text-[11px] font-medium text-gray-500">{t("agent")}</p>
                    <p className="whitespace-pre-wrap text-gray-900">{turn.ai}</p>
                    {turn.documents?.length ? (
                      <p className="mt-2 text-[11px] text-gray-500">
                        {t("sources")}: {named(turn.documents)}
                      </p>
                    ) : null}
                    {turn.tool_calls?.length ? (
                      <p className="mt-1 text-[11px] text-gray-500">
                        {t("tools")}: {named(turn.tool_calls)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
