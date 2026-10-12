"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A muted question-mark next to a label or a stat title that explains the
 * concept behind it. Keep the copy to one short sentence — anything longer
 * belongs in the page description.
 */
export function InfoTip({
  children,
  label = "What is this?",
  side = "top",
  className,
}: {
  children: ReactNode;
  /** Accessible name of the trigger — the tooltip text is the description. */
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className={cn(
          "text-muted-foreground/60 hover:text-muted-foreground inline-flex shrink-0 cursor-help items-center align-middle transition-colors",
          className,
        )}
      >
        <CircleHelp className="size-3.5" strokeWidth={1.75} aria-hidden />
      </TooltipTrigger>
      <TooltipContent side={side}>{children}</TooltipContent>
    </Tooltip>
  );
}
