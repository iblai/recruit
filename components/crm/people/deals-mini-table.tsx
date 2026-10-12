"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/crm/empty-state";
import { DealStatusBadge } from "@/components/crm/badges";
import { useSession } from "@/hooks/use-session";
import { useListDealsQuery, useListPipelinesQuery } from "@/lib/crm/api";
import { formatCurrency, formatDate } from "@/lib/crm/format";
import { VOCAB } from "@/lib/recruit/vocabulary";

const th =
  "h-9 whitespace-nowrap px-4 text-left text-xs font-medium tracking-wide text-muted-foreground";
const td = "border-b border-gray-100 px-4 py-2 align-middle";

/**
 * The applications (CRM deals) attached to a prospect or a school, as a
 * compact table on the record's "Applications" tab. Stage names come from
 * the funnels the org has configured; the link goes to the Applications module.
 */
export function DealsMiniTable({
  person,
  organization,
  emptyDescription,
}: {
  person?: string;
  organization?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const { href } = useSession();
  const { data, isLoading } = useListDealsQuery(
    { person, organization, page_size: 50 },
    { skip: !person && !organization },
  );
  const { data: pipelines } = useListPipelinesQuery({ page_size: 100 });

  const stageNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of pipelines?.results ?? []) {
      for (const s of p.stages ?? []) map.set(s.id, s.name);
    }
    return map;
  }, [pipelines]);

  const newDealHref = person
    ? href(`/applications?new=1&person=${person}`)
    : href(`/applications?new=1&organization=${organization ?? ""}`);

  const deals = data?.results ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!deals.length) {
    return (
      <EmptyState
        icon={<Handshake strokeWidth={1.75} />}
        title={`No ${VOCAB.application.lowerMany} yet`}
        description={
          emptyDescription ??
          `Start an ${VOCAB.application.lower} to track this ${VOCAB.prospect.lower} through the ${VOCAB.funnel.lower}.`
        }
        action={
          <Button className="ibl-button-primary" size="sm" onClick={() => router.push(newDealHref)}>
            <Plus data-icon="inline-start" strokeWidth={1.75} /> New {VOCAB.application.lower}
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2">
        <span className="text-muted-foreground text-xs font-medium">
          {data?.count ?? deals.length}{" "}
          {(data?.count ?? deals.length) === 1
            ? VOCAB.application.lower
            : VOCAB.application.lowerMany}
        </span>
        <Button variant="outline" size="sm" onClick={() => router.push(newDealHref)}>
          <Plus data-icon="inline-start" strokeWidth={1.75} /> New {VOCAB.application.lower}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${th} border-b border-gray-100`}>
                {VOCAB.application.one}
              </th>
              <th scope="col" className={`${th} border-b border-gray-100`}>
                Status
              </th>
              <th scope="col" className={`${th} border-b border-gray-100`}>
                {VOCAB.value}
              </th>
              <th scope="col" className={`${th} border-b border-gray-100`}>
                Stage
              </th>
              <th scope="col" className={`${th} border-b border-gray-100`}>
                {VOCAB.deadline}
              </th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr
                key={d.id}
                onClick={() => router.push(href(`/applications/${d.id}`))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(href(`/applications/${d.id}`));
                }}
                tabIndex={0}
                className="cursor-pointer transition-colors outline-none hover:bg-gray-50 focus-visible:bg-gray-50"
              >
                <td className={td}>
                  <Link
                    href={href(`/applications/${d.id}`)}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-gray-900 hover:text-[#0058cc]"
                  >
                    {d.title}
                  </Link>
                </td>
                <td className={td}>
                  <DealStatusBadge status={d.status} />
                </td>
                <td className={`${td} text-gray-700 tabular-nums`}>
                  {formatCurrency(d.lead_value, d.currency)}
                </td>
                <td className={`${td} text-gray-700`}>
                  {stageNames.get(d.stage) ?? `Stage #${d.stage}`}
                </td>
                <td className={`${td} text-muted-foreground`}>
                  {d.expected_close_date ? formatDate(d.expected_close_date) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
