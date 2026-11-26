"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { EmptyState } from "@/components/crm/empty-state";
import { OwnerName } from "@/components/crm/owner-select";
import { PageHeader } from "@/components/crm/page-header";
import { ApproveAllDialog } from "@/components/recruit/needs-you/approve-all-dialog";
import { FollowUpDialog } from "@/components/recruit/needs-you/follow-up-dialog";
import { ShortlistDialog } from "@/components/recruit/needs-you/shortlist-dialog";
import { useSession } from "@/hooks/use-session";
import { errorMessage, useMarkActivityDoneMutation } from "@/lib/crm/api";
import type { Activity } from "@/lib/crm/types";
import { formatRelative } from "@/lib/crm/format";
import { followUpOf, handoffOf } from "@/lib/recruit/follow-ups";
import { shortlistOf } from "@/lib/recruit/found";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import { useNeedsYou } from "@/lib/recruit/use-needs-you";

const ROW =
  "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-4 py-3 last:border-b-0";

/**
 * What waits for a person: conversations Recruit handed over, messages an
 * agent wrote and nobody has sent, pages nobody has published.
 */
export default function NeedsYouPage() {
  const t = useTranslations("recruit.needsYou");
  const { href, isAdmin } = useSession();
  const { settings } = useRecruitSettings();
  const { shortlists, handoffs, followUps, pages, count, isLoading, error } = useNeedsYou();
  const [markDone] = useMarkActivityDoneMutation();
  const [reviewing, setReviewing] = useState<Activity | null>(null);
  const [shortlist, setShortlist] = useState<Activity | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const emails = followUps.filter((a) => followUpOf(a)?.channel === "email");
  useBreadcrumbs([{ label: t("title"), href: href("/needs-you") }]);

  const finish = (id: number) =>
    markDone(id)
      .unwrap()
      .catch(() => toast.error(t("failed")));

  return (
    <>
      <PageHeader icon={<Inbox />} title={t("title")} count={isLoading ? null : count} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : error ? (
          <EmptyState icon={<Inbox />} title={errorMessage(error)} />
        ) : count === 0 ? (
          <EmptyState icon={<Inbox />} title={t("empty")} description={t("emptyBody")} />
        ) : (
          <div className="grid gap-6">
            <Group title={t("studentsFound")} testId="shortlists" rows={shortlists}>
              {(a) => {
                const list = shortlistOf(a);
                return (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {list?.criteria || a.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {t("shortlistLine", {
                          source: list?.source ?? "",
                          count: list?.people.length ?? 0,
                          when: formatRelative(list?.at || a.created_at),
                        })}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShortlist(a)}>
                      {t("review")}
                    </Button>
                  </>
                );
              }}
            </Group>
            <Group title={t("handoffs")} testId="handoffs" rows={handoffs}>
              {(a) => {
                const conversation = handoffOf(a)?.conversation;
                return (
                  <>
                    <Subject activity={a} href={href} unassigned={t("unassigned")} />
                    {conversation ? (
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={href(`/conversations/${conversation}`)} />}
                      >
                        {t("openConversation")}
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => finish(a.id)}>
                      {t("done")}
                    </Button>
                  </>
                );
              }}
            </Group>
            <Group
              title={t("followUps")}
              testId="follow-ups"
              rows={followUps}
              action={
                isAdmin && settings.mailConnector && emails.length ? (
                  <Button variant="outline" size="sm" onClick={() => setApprovingAll(true)}>
                    {t("approveAll")}
                  </Button>
                ) : null
              }
            >
              {(a) => (
                <>
                  <Subject activity={a} href={href} unassigned={t("unassigned")} />
                  <Button variant="outline" size="sm" onClick={() => setReviewing(a)}>
                    {t("review")}
                  </Button>
                </>
              )}
            </Group>
            <Group title={t("pages")} testId="pages" rows={pages}>
              {(page) => (
                <>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                    {page.title}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={href(`/landing-pages/${page.slug}`)} />}
                  >
                    {t("review")}
                  </Button>
                </>
              )}
            </Group>
          </div>
        )}
      </div>
      <FollowUpDialog activity={reviewing} onClose={() => setReviewing(null)} />
      <ShortlistDialog activity={shortlist} onClose={() => setShortlist(null)} />
      <ApproveAllDialog
        drafts={emails}
        open={approvingAll}
        onClose={() => setApprovingAll(false)}
      />
    </>
  );
}

function Group<T extends { id?: number; slug?: string }>({
  title,
  testId,
  rows,
  action,
  children,
}: {
  title: string;
  testId: string;
  rows: T[];
  action?: ReactNode;
  children: (row: T) => ReactNode;
}) {
  if (!rows.length) return null;
  return (
    <section data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-gray-500">
          {title} · {rows.length}
        </h2>
        {action}
      </div>
      <ul className="rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white">
        {rows.map((row) => (
          <li key={row.id ?? row.slug} className={ROW}>
            {children(row)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Who it is about, what it says, and whose it is. */
function Subject({
  activity,
  href,
  unassigned,
}: {
  activity: Activity;
  href: (path?: string) => string;
  unassigned: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-gray-900">
        {activity.person ? (
          <Link href={href(`/prospects/${activity.person}`)} className="hover:underline">
            {activity.title}
          </Link>
        ) : (
          activity.title
        )}
      </p>
      <p className="line-clamp-2 text-xs whitespace-pre-line text-gray-600">
        {activity.comment?.replace(/\n{2,}/g, "\n")}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        {activity.owner ? <OwnerName ownerId={activity.owner} /> : unassigned}
      </p>
    </div>
  );
}
