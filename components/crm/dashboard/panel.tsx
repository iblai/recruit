"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InfoTip } from "@/components/crm/info-tip";
import { cn } from "@/lib/utils";

/** The white card every dashboard block sits in. */
export function Panel({
  title,
  titleText,
  info,
  description,
  href,
  linkLabel = "View all",
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  /** Plain-text title, used to name the info tip for screen readers. */
  titleText?: string;
  /** One short sentence explaining what the panel shows. */
  info?: ReactNode;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            <span className="truncate">{title}</span>
            {info ? <InfoTip label={`About ${titleText ?? "this panel"}`}>{info}</InfoTip> : null}
          </h2>
          {description ? (
            <p className="text-muted-foreground truncate text-xs">{description}</p>
          ) : null}
        </div>
        {action ??
          (href ? (
            <Link
              href={href}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#0058cc] hover:underline"
            >
              {linkLabel} <ArrowRight className="size-3" />
            </Link>
          ) : null)}
      </header>
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
