"use client";

import type { ActivityType, DealStatus, LifecycleStage } from "@/lib/crm/types";
import { ACTIVITY_LABELS, LIFECYCLE_LABELS, STATUS_LABELS } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

/*
 * Labels come from the recruitment vocabulary (Inquiry, Enrolled, Visit…);
 * the keys stay the CRM API's enum names.
 */

const LIFECYCLE: Record<LifecycleStage, { label: string; className: string }> = {
  lead: { label: LIFECYCLE_LABELS.lead, className: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  qualified: {
    label: LIFECYCLE_LABELS.qualified,
    className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  },
  opportunity: {
    label: LIFECYCLE_LABELS.opportunity,
    className: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  customer: {
    label: LIFECYCLE_LABELS.customer,
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  churned: {
    label: LIFECYCLE_LABELS.churned,
    className: "bg-gray-100 text-gray-600 ring-gray-500/20",
  },
};

export function LifecycleBadge({
  stage,
  className,
}: {
  stage?: LifecycleStage | null;
  className?: string;
}) {
  const meta = LIFECYCLE[stage ?? "lead"] ?? LIFECYCLE.lead;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

const DEAL_STATUS: Record<DealStatus, { label: string; className: string; dot: string }> = {
  open: {
    label: STATUS_LABELS.open,
    className: "bg-[#eef6fc] text-[#0058cc] ring-[#0058cc]/20",
    dot: "bg-[#0058cc]",
  },
  won: {
    label: STATUS_LABELS.won,
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  lost: {
    label: STATUS_LABELS.lost,
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
    dot: "bg-rose-500",
  },
};

export function DealStatusBadge({
  status,
  className,
}: {
  status?: DealStatus | null;
  className?: string;
}) {
  const meta = DEAL_STATUS[status ?? "open"] ?? DEAL_STATUS.open;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

export const ACTIVITY_TONES: Record<ActivityType, { label: string; className: string }> = {
  call: { label: ACTIVITY_LABELS.call, className: "bg-sky-50 text-sky-600" },
  meeting: { label: ACTIVITY_LABELS.meeting, className: "bg-violet-50 text-violet-600" },
  email: { label: ACTIVITY_LABELS.email, className: "bg-amber-50 text-amber-600" },
  note: { label: ACTIVITY_LABELS.note, className: "bg-gray-100 text-gray-600" },
  task: { label: ACTIVITY_LABELS.task, className: "bg-[#eef6fc] text-[#0058cc]" },
  lunch: { label: ACTIVITY_LABELS.lunch, className: "bg-orange-50 text-orange-600" },
  deadline: { label: ACTIVITY_LABELS.deadline, className: "bg-rose-50 text-rose-600" },
};

export function ActivityTypeBadge({ type, className }: { type: ActivityType; className?: string }) {
  const meta = ACTIVITY_TONES[type] ?? ACTIVITY_TONES.note;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
