"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, ClipboardList, Globe, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/components/crm/dashboard/use-dashboard-data";
import { UpNextList } from "@/components/crm/dashboard/up-next-list";
import { useSession } from "@/hooks/use-session";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import { pluralize } from "@/lib/crm/format";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

/**
 * The glanceable column next to the Chief of Staff: the funnel in numbers,
 * what is due, and the newest prospects — the same cached queries the Funnel
 * dashboard uses, so it costs nothing extra.
 */
export function TodayBrief({ className }: { className?: string }) {
  const { href } = useSession();
  const data = useDashboardData();
  const { settings } = useRecruitSettings();
  const published = (settings.landingPages ?? []).filter((p) => p.published).length;

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      <div>
        <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Today
        </h2>
        {data.isLoading && data.deals.length === 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Tile
              label={`Open ${VOCAB.application.lowerMany}`}
              value={data.stats.openCount}
              icon={<ClipboardList />}
              href={href("/applications")}
            />
            <Tile
              label="Due today"
              value={data.upcoming.dueToday}
              hint={data.upcoming.overdue ? pluralize(data.upcoming.overdue, "overdue") : undefined}
              tone={data.upcoming.overdue ? "warning" : "default"}
              icon={<CalendarClock />}
              href={href("/activities")}
            />
            <Tile
              label={VOCAB.prospect.many}
              value={data.peopleCount}
              icon={<Users />}
              href={href("/prospects")}
            />
            <Tile
              label="Live landing pages"
              value={published}
              icon={<Globe />}
              href={href("/landing-pages")}
            />
          </div>
        )}
      </div>

      {data.stageBreakdown.length ? (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              {data.lookups.defaultPipeline?.name ?? VOCAB.funnel.one}
            </h2>
            <Link
              href={href("/dashboard")}
              className="text-[11px] font-medium text-[#0058cc] hover:underline"
            >
              Full dashboard
            </Link>
          </div>
          <ul className="mt-2 grid gap-1">
            {data.stageBreakdown.map((s) => {
              const max = Math.max(1, ...data.stageBreakdown.map((x) => x.count));
              return (
                <li
                  key={s.name}
                  className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-gray-700">{s.name}</span>
                    </div>
                    <div
                      className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-[#0058cc]"
                        style={{ width: `${(s.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-right font-medium text-gray-900 tabular-nums">
                    {s.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            Up next
          </h2>
          <Link
            href={href("/activities")}
            className="text-[11px] font-medium text-[#0058cc] hover:underline"
          >
            All activities
          </Link>
        </div>
        <div className="mt-2 text-sm">
          <UpNextList activities={data.upcoming.list.slice(0, 4)} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            New {VOCAB.prospect.lowerMany}
          </h2>
          <Link
            href={href("/prospects?new=1")}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0058cc] hover:underline"
          >
            <UserPlus className="size-3" strokeWidth={1.75} /> Add
          </Link>
        </div>
        {data.recentPeople.length ? (
          <ul className="mt-2 divide-y divide-gray-100">
            {data.recentPeople.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link
                  href={href(`/prospects/${p.id}`)}
                  className="group -mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">{p.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {p.job_title || p.primary_email || "—"}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="size-3.5 shrink-0 text-gray-300 group-hover:text-[#0058cc]"
                    strokeWidth={1.75}
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">
            No prospects yet — publish a landing page or add one.
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  icon: React.ReactNode;
  href: string;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border-color,#e5e7eb)] bg-white p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-[#0058cc]/40"
    >
      <span className="min-w-0">
        <span className="text-muted-foreground block truncate text-[11px] font-medium">
          {label}
        </span>
        <span className="mt-0.5 block text-xl font-semibold tracking-tight text-gray-900 tabular-nums">
          {value}
        </span>
        {hint ? (
          <span
            className={cn(
              "block text-[11px]",
              tone === "warning" ? "text-amber-600" : "text-muted-foreground",
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5",
          tone === "warning" ? "bg-amber-50 text-amber-600" : "bg-[#eef6fc] text-[#0058cc]",
        )}
      >
        {icon}
      </span>
    </Link>
  );
}
