"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DealStatusBadge } from "@/components/crm/badges";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { OwnerName } from "@/components/crm/owner-select";
import { useSession } from "@/hooks/use-session";
import { isOverdue } from "@/components/crm/deals/deal-card";
import { dealValue, formatCurrency, formatDate } from "@/lib/crm/format";
import type { Deal, PipelineStage } from "@/lib/crm/types";
import { APPLICATION_FIELDS, metaLabel } from "@/lib/recruit/fields";
import { cn } from "@/lib/utils";

const HEAD = [
  "Application",
  "Prospect",
  "School",
  "Program",
  "Term",
  "Stage",
  "Status",
  "Counselor",
  "Deadline",
  "Est. tuition",
];

const PROGRAM_FIELD = APPLICATION_FIELDS.find((f) => f.key === "program");
const TERM_FIELD = APPLICATION_FIELDS.find((f) => f.key === "term");

/** The spreadsheet view of the funnel — one page of applications at a time. */
export function DealsTable({
  deals,
  isLoading,
  stageById,
  personName,
  organizationName,
}: {
  deals: Deal[];
  isLoading?: boolean;
  stageById: Map<number, PipelineStage>;
  personName: (id?: string | null) => string;
  organizationName: (id?: string | null) => string;
}) {
  const router = useRouter();
  const { href } = useSession();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/70 hover:bg-gray-50/70">
            {HEAD.map((h) => (
              <TableHead
                key={h}
                className={cn(
                  "text-muted-foreground text-[11px] font-semibold tracking-wide uppercase",
                  h === "Est. tuition" && "text-right",
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && deals.length === 0
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={`s-${i}`}>
                  {HEAD.map((h) => (
                    <TableCell key={h}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : deals.map((deal) => {
                const stage = stageById.get(deal.stage);
                const overdue = isOverdue(deal.expected_close_date, deal.status);
                const org = organizationName(deal.organization);
                const program = PROGRAM_FIELD ? metaLabel(PROGRAM_FIELD, deal.metadata) : "";
                const term = TERM_FIELD ? metaLabel(TERM_FIELD, deal.metadata) : "";
                const tuition = dealValue(deal);
                return (
                  <TableRow
                    key={deal.id}
                    onClick={() => router.push(href(`/applications/${deal.id}`))}
                    className="cursor-pointer"
                  >
                    <TableCell className="max-w-[16rem] font-medium text-gray-900">
                      <span className="block truncate">{deal.title}</span>
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <EntityAvatar name={personName(deal.person)} seed={deal.person} size="xs" />
                        <span className="truncate">{personName(deal.person)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      {org ? (
                        <span className="block truncate text-gray-700">{org}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[12rem] text-gray-700">
                      {program ? (
                        <span className="block truncate">{program}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-700">
                      {term || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                          stage?.is_won
                            ? "bg-emerald-50 text-emerald-700"
                            : stage?.is_lost
                              ? "bg-rose-50 text-rose-700"
                              : "bg-gray-100 text-gray-700",
                        )}
                      >
                        {stage?.name ?? `Stage #${deal.stage}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DealStatusBadge status={deal.status} />
                    </TableCell>
                    <TableCell className="text-gray-700">
                      <OwnerName ownerId={deal.owner} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap",
                        overdue ? "font-medium text-rose-600" : "text-gray-700",
                      )}
                    >
                      {deal.expected_close_date ? formatDate(deal.expected_close_date) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {tuition > 0 ? (
                        formatCurrency(deal.lead_value, deal.currency)
                      ) : (
                        <span className="text-muted-foreground font-normal">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    </div>
  );
}
