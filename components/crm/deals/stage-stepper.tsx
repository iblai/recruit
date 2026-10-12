"use client";

import { Check, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sortStages } from "@/lib/crm/format";
import type { DealStatus, Pipeline, PipelineStage } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

/**
 * The application's journey through its funnel as connected pills — click one
 * to move the application there. Stages before the current one read as
 * completed; the enrolled stage is emerald and the withdrawn stage rose.
 */
export function StageStepper({
  pipeline,
  currentStageId,
  status,
  onSelect,
  disabled,
}: {
  pipeline?: Pipeline;
  currentStageId?: number;
  status: DealStatus;
  onSelect: (stage: PipelineStage) => void;
  disabled?: boolean;
}) {
  const stages = sortStages(pipeline?.stages ?? []);
  if (stages.length === 0) return null;
  const current = stages.find((s) => s.id === currentStageId);
  const currentOrder = current?.sort_order ?? -1;

  return (
    <nav
      className="flex w-full flex-wrap items-center gap-1 overflow-x-auto"
      aria-label="Funnel stage"
    >
      {stages.map((stage, i) => {
        const isCurrent = stage.id === currentStageId;
        const isDone = !isCurrent && (stage.sort_order ?? 0) < currentOrder && !stage.is_lost;
        const terminalWon = stage.is_won;
        const terminalLost = stage.is_lost;
        const hint = isCurrent
          ? `This application is in ${stage.name}`
          : terminalWon
            ? "Mark this application enrolled"
            : terminalLost
              ? "Mark this application withdrawn"
              : typeof stage.probability === "number"
                ? `Move this application to ${stage.name} (${stage.probability}% likely to enroll)`
                : `Move this application to ${stage.name}`;
        return (
          <Tooltip key={stage.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(stage)}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={hint}
                  className={cn(
                    "relative inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                    i > 0 &&
                      "before:absolute before:top-1/2 before:-left-1 before:h-px before:w-1 before:-translate-y-1/2 before:bg-gray-200",
                    isCurrent && terminalWon && "bg-emerald-600 text-white shadow-sm",
                    isCurrent && terminalLost && "bg-rose-600 text-white shadow-sm",
                    isCurrent &&
                      !terminalWon &&
                      !terminalLost &&
                      "bg-[#0058cc] text-white shadow-sm",
                    !isCurrent && isDone && "bg-[#eef6fc] text-[#0058cc] hover:bg-[#dceaf8]",
                    !isCurrent &&
                      !isDone &&
                      terminalWon &&
                      "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
                    !isCurrent &&
                      !isDone &&
                      terminalLost &&
                      "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
                    !isCurrent &&
                      !isDone &&
                      !terminalWon &&
                      !terminalLost &&
                      "border border-[var(--border-color,#e5e7eb)] bg-white text-gray-600 hover:bg-gray-50",
                  )}
                />
              }
            >
              {isDone ? <Check className="size-3" /> : null}
              {!isCurrent && terminalLost ? <X className="size-3" /> : null}
              <span className="truncate">{stage.name}</span>
              {typeof stage.probability === "number" && !terminalWon && !terminalLost ? (
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    isCurrent ? "text-white/70" : "text-gray-400",
                  )}
                >
                  {stage.probability}%
                </span>
              ) : null}
            </TooltipTrigger>
            <TooltipContent side="bottom">{hint}</TooltipContent>
          </Tooltip>
        );
      })}
      {status !== "open" ? (
        <span
          className={cn(
            "ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            status === "won" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
          )}
        >
          {status === "won" ? "Enrolled" : "Withdrawn"}
        </span>
      ) : null}
    </nav>
  );
}
