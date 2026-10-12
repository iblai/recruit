"use client";

import Link from "next/link";
import { DealStatusBadge, LifecycleBadge } from "@/components/crm/badges";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { useSession } from "@/hooks/use-session";
import { dealValue, formatCurrency, formatRelative } from "@/lib/crm/format";
import type { Deal, Person } from "@/lib/crm/types";
import { readMeta } from "@/lib/recruit/fields";

/** The five prospects most recently added to the organization. */
export function RecentPeopleList({ people }: { people: Person[] }) {
  const { href } = useSession();
  if (people.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No prospects yet.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {people.map((p) => (
        <li key={p.id}>
          <Link
            href={href(`/prospects/${p.id}`)}
            className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50"
          >
            <EntityAvatar name={p.name} seed={p.id} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {[p.job_title, readMeta(p.metadata, "entry_term")].filter(Boolean).join(" · ") ||
                  p.primary_email ||
                  "—"}
              </span>
            </span>
            <LifecycleBadge stage={p.lifecycle_stage} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The five most recently opened applications. */
export function RecentDealsList({
  deals,
  personName,
}: {
  deals: Deal[];
  personName: (id?: string | null) => string;
}) {
  const { href } = useSession();
  if (deals.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No applications yet.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {deals.map((d) => (
        <li key={d.id}>
          <Link
            href={href(`/applications/${d.id}`)}
            className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50"
          >
            <EntityAvatar name={d.title} seed={d.id} kind="deal" size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{d.title}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {personName(d.person)} · added {formatRelative(d.created_at)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {dealValue(d) > 0 ? (
                <span className="block text-sm font-medium text-gray-900 tabular-nums">
                  {formatCurrency(d.lead_value, d.currency)}
                </span>
              ) : null}
              <DealStatusBadge status={d.status} className="mt-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
