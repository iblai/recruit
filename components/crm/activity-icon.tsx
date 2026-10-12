"use client";

import {
  CalendarClock,
  Landmark,
  Mail,
  MessageSquareText,
  Phone,
  SquareCheckBig,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ACTIVITY_TONES } from "@/components/crm/badges";
import type { ActivityType } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

export const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  call: Phone,
  meeting: Users,
  email: Mail,
  note: MessageSquareText,
  task: SquareCheckBig,
  /** The CRM's `lunch` type is the campus tour / school visit. */
  lunch: Landmark,
  deadline: CalendarClock,
};

export function ActivityIcon({
  type,
  className,
  size = "md",
}: {
  type: ActivityType;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = ACTIVITY_ICONS[type] ?? MessageSquareText;
  const tone = ACTIVITY_TONES[type] ?? ACTIVITY_TONES.note;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "size-6 [&_svg]:size-3" : "size-8 [&_svg]:size-4",
        tone.className,
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
