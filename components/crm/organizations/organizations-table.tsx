"use client";

import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { OwnerName } from "@/components/crm/owner-select";
import { SCHOOL_TYPE_FIELD } from "@/components/crm/organizations/school-type";
import { TagList } from "@/components/crm/tag-chip";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/crm/format";
import type { Address, Organization } from "@/lib/crm/types";
import { metaLabel } from "@/lib/recruit/fields";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

const th =
  "h-9 whitespace-nowrap px-4 text-left text-xs font-medium tracking-wide text-muted-foreground border-b border-[var(--border-color,#e5e7eb)]";
const td = "border-b border-gray-100 px-4 py-2 align-middle";

/** "City, State" (falling back to the country) — the one-line location we show in the grid. */
export function locationLabel(address?: Address) {
  const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  const parts = [address?.city, address?.state].filter(isText);
  if (parts.length === 0 && isText(address?.country)) parts.push(address.country);
  return parts.join(", ");
}

const HEADINGS = [
  "Name",
  SCHOOL_TYPE_FIELD.label,
  "City / State",
  VOCAB.counselor.one,
  "Tags",
  "Created",
];

/** The schools & partners grid — compact rows, whole row opens the record. */
export function OrganizationsTable({
  organizations,
  isLoading,
  skeletonRows = 8,
}: {
  organizations: Organization[];
  isLoading?: boolean;
  skeletonRows?: number;
}) {
  const router = useRouter();
  const { href } = useSession();

  return (
    <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr>
          {HEADINGS.map((h) => (
            <th key={h} scope="col" className={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {isLoading
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`sk-${i}`}>
                <td className={td}>
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="size-8 rounded-md" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </td>
                {Array.from({ length: HEADINGS.length - 1 }, (_, j) => (
                  <td key={j} className={td}>
                    <Skeleton className="h-3 w-24" />
                  </td>
                ))}
              </tr>
            ))
          : organizations.map((o) => {
              const location = locationLabel(o.address);
              const type = metaLabel(SCHOOL_TYPE_FIELD, o.metadata);
              return (
                <tr
                  key={o.id}
                  onClick={() => router.push(href(`/schools/${o.id}`))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(href(`/schools/${o.id}`));
                  }}
                  tabIndex={0}
                  className="cursor-pointer transition-colors outline-none hover:bg-gray-50 focus-visible:bg-gray-50"
                >
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <EntityAvatar name={o.name} seed={o.id} kind="organization" />
                      <span className="truncate font-medium text-gray-900">{o.name}</span>
                    </div>
                  </td>
                  <td className={cn(td, type ? "text-gray-700" : "text-muted-foreground")}>
                    {type || "—"}
                  </td>
                  <td className={cn(td, location ? "text-gray-700" : "text-muted-foreground")}>
                    {location || "—"}
                  </td>
                  <td className={`${td} text-gray-700`}>
                    <OwnerName ownerId={o.owner} />
                  </td>
                  <td className={td}>
                    {o.tags?.length ? (
                      <TagList tags={o.tags} max={2} size="xs" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`${td} text-muted-foreground`}>{formatDate(o.created_at)}</td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );
}
