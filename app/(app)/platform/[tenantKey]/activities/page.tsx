"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, endOfDay, endOfWeek, isToday, startOfDay, startOfWeek } from "date-fns";
import { CalendarCheck2, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/empty-state";
import { PaginationBar } from "@/components/crm/pagination-bar";
import { SimpleSelect } from "@/components/crm/simple-select";
import { ActivityRow } from "@/components/crm/activity-timeline";
import { InfoTip } from "@/components/crm/info-tip";
import { ActivityDialog } from "@/components/crm/activities/activity-dialog";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { useSession } from "@/hooks/use-session";
import { useListActivitiesQuery } from "@/lib/crm/api";
import {
  ACTIVITY_TYPES,
  type Activity,
  type ActivityListParams,
  type ActivityType,
} from "@/lib/crm/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

type Scope = "mine" | "everyone";
type Status = "open" | "done" | "all";
type Range = "all" | "overdue" | "today" | "week" | "next7";

const RANGE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "next7", label: "Next 7 days" },
  { value: "all", label: "All dates" },
];

/** Translate the quick-range picker into the API's `schedule_from` window. */
export function rangeParams(range: Range, now = new Date()): Partial<ActivityListParams> {
  switch (range) {
    case "overdue":
      return { schedule_from__lte: now.toISOString(), is_done: false };
    case "today":
      return {
        schedule_from__gte: startOfDay(now).toISOString(),
        schedule_from__lte: endOfDay(now).toISOString(),
      };
    case "week":
      return {
        schedule_from__gte: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
        schedule_from__lte: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      };
    case "next7":
      return {
        schedule_from__gte: now.toISOString(),
        schedule_from__lte: endOfDay(addDays(now, 7)).toISOString(),
      };
    default:
      return {};
  }
}

interface Grouped {
  overdue: Activity[];
  today: Activity[];
  upcoming: Activity[];
  unscheduled: Activity[];
  done: Activity[];
}

/** Bucket activities the way a counselor reads them: late, today, ahead, someday, history. */
export function groupActivities(rows: Activity[], now = new Date()): Grouped {
  const dayStart = startOfDay(now).getTime();
  const out: Grouped = { overdue: [], today: [], upcoming: [], unscheduled: [], done: [] };
  for (const a of rows) {
    if (a.is_done) {
      out.done.push(a);
      continue;
    }
    if (!a.schedule_from) {
      out.unscheduled.push(a);
      continue;
    }
    const at = new Date(a.schedule_from);
    if (Number.isNaN(at.getTime())) {
      out.unscheduled.push(a);
    } else if (isToday(at)) {
      out.today.push(a);
    } else if (at.getTime() < dayStart) {
      out.overdue.push(a);
    } else {
      out.upcoming.push(a);
    }
  }
  const byScheduleAsc = (a: Activity, b: Activity) =>
    new Date(a.schedule_from ?? 0).getTime() - new Date(b.schedule_from ?? 0).getTime();
  out.overdue.sort(byScheduleAsc);
  out.today.sort(byScheduleAsc);
  out.upcoming.sort(byScheduleAsc);
  out.unscheduled.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  out.done.sort(
    (a, b) =>
      new Date(b.done_at ?? b.updated_at).getTime() - new Date(a.done_at ?? a.updated_at).getTime(),
  );
  return out;
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<ActivitiesFallback />}>
      <ActivitiesView />
    </Suspense>
  );
}

function ActivitiesFallback() {
  return (
    <>
      <PageHeader icon={<CalendarCheck2 />} title="Activities" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <ListSkeleton />
      </div>
    </>
  );
}

function ActivitiesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, href } = useSession();
  useBreadcrumbs([{ label: "Activities", href: href("/activities") }]);

  const [scope, setScope] = useState<Scope>("mine");
  const [status, setStatus] = useState<Status>("open");
  const [type, setType] = useState<string>("");
  const [range, setRange] = useState<Range>("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | undefined>(undefined);
  const [showDone, setShowDone] = useState(false);

  // `?new=1` (from the command palette / a link) opens the composer once.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(undefined);
      setDialogOpen(true);
      router.replace(href("/activities"));
    }
  }, [searchParams, router, href]);

  const params = useMemo<ActivityListParams>(() => {
    const ranged = rangeParams(range);
    const isDone = status === "all" ? undefined : status === "done";
    return {
      page,
      page_size: PAGE_SIZE,
      owner: scope === "mine" ? (userId ?? undefined) : undefined,
      type: (type || undefined) as ActivityType | undefined,
      ...ranged,
      // An explicit Open/Done choice wins over the range's implicit filter.
      is_done: isDone ?? ranged.is_done,
    };
  }, [page, scope, status, type, range, userId]);

  const { data, isLoading, isFetching } = useListActivitiesQuery(params);
  const rows = useMemo(() => data?.results ?? [], [data]);
  const groups = useMemo(() => groupActivities(rows), [rows]);
  const hasRows = rows.length > 0;

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const openEdit = (activity?: Activity) => {
    setEditing(activity);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        icon={<CalendarCheck2 />}
        title="Activities"
        count={data?.count ?? null}
        description="Calls, visits, meetings, tasks and notes across every prospect and application"
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="sm" className="ibl-button-primary" onClick={() => openEdit()} />
              }
            >
              <Plus data-icon="inline-start" /> New activity
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Log a call, visit or note, or schedule a task or meeting
            </TooltipContent>
          </Tooltip>
        }
        toolbar={
          <>
            <ToggleGroup
              value={[scope]}
              onValueChange={(v) => {
                const next = (v[0] as Scope) ?? scope;
                setScope(next);
                setPage(1);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Counselor scope"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value="mine"
                      className="data-pressed:bg-[#eef6fc] data-pressed:text-[#0058cc]"
                    />
                  }
                >
                  Mine
                </TooltipTrigger>
                <TooltipContent side="bottom">Mine — activities you own</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value="everyone"
                      className="data-pressed:bg-[#eef6fc] data-pressed:text-[#0058cc]"
                    />
                  }
                >
                  Everyone
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Everyone — activities owned by anyone on the team
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>

            <ToggleGroup
              value={[status]}
              onValueChange={(v) => {
                const next = (v[0] as Status) ?? status;
                setStatus(next);
                setPage(1);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Status"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value="open"
                      className="data-pressed:bg-[#eef6fc] data-pressed:text-[#0058cc]"
                    />
                  }
                >
                  Open
                </TooltipTrigger>
                <TooltipContent side="bottom">Open — still to do</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value="done"
                      className="data-pressed:bg-[#eef6fc] data-pressed:text-[#0058cc]"
                    />
                  }
                >
                  Done
                </TooltipTrigger>
                <TooltipContent side="bottom">Done — already completed</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value="all"
                      className="data-pressed:bg-[#eef6fc] data-pressed:text-[#0058cc]"
                    />
                  }
                >
                  All
                </TooltipTrigger>
                <TooltipContent side="bottom">All — open and done together</TooltipContent>
              </Tooltip>
            </ToggleGroup>

            <SimpleSelect
              value={type}
              onChange={resetPage(setType)}
              options={ACTIVITY_TYPES}
              allowEmpty
              emptyLabel="All types"
              placeholder="All types"
              size="sm"
              className="w-36"
              aria-label="Activity type"
            />

            <SimpleSelect
              value={range}
              onChange={resetPage((v: string) => setRange(v as Range))}
              options={RANGE_OPTIONS}
              size="sm"
              className="w-36"
              aria-label="Date range"
            />

            {isFetching && !isLoading ? (
              <span className="text-muted-foreground text-xs">Refreshing…</span>
            ) : null}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex-1 p-4 md:p-6">
          {isLoading ? (
            <ListSkeleton />
          ) : !hasRows ? (
            <EmptyState
              icon={<CalendarCheck2 />}
              title="Nothing scheduled here"
              description={
                scope === "mine"
                  ? "Nothing of yours matches these filters. Try “Everyone”, widen the date range, or log a call or task from a prospect or application page."
                  : "Nothing matches these filters. Widen the date range, or log a call or task from a prospect or application page."
              }
              action={
                <Button className="ibl-button-primary" onClick={() => openEdit()}>
                  <Plus data-icon="inline-start" /> New activity
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-6">
              <Section
                title="Overdue"
                tone="overdue"
                info="Scheduled before today and still not done."
                items={groups.overdue}
                onEdit={openEdit}
              />
              <Section
                title="Today"
                tone="today"
                info="Scheduled for today and still open."
                items={groups.today}
                onEdit={openEdit}
              />
              <Section
                title="Upcoming"
                info="Scheduled after today."
                items={groups.upcoming}
                onEdit={openEdit}
              />
              <Section
                title="Unscheduled"
                info="Open work with no date yet — newest first."
                items={groups.unscheduled}
                onEdit={openEdit}
              />
              {groups.done.length ? (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowDone((s) => !s)}
                    className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase hover:text-gray-900"
                    aria-expanded={showDone}
                  >
                    {showDone ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                    Done
                    <span className="rounded-full bg-gray-100 px-1.5 py-px text-[11px] font-medium text-gray-600 normal-case">
                      {groups.done.length}
                    </span>
                  </button>
                  {showDone ? (
                    <ul className="space-y-2">
                      {groups.done.map((a) => (
                        <RowShell key={a.id} activity={a} onEdit={openEdit} />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
        <PaginationBar
          data={data}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          label="activities"
        />
      </div>

      <ActivityDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(undefined);
        }}
        activity={editing}
      />
    </>
  );
}

const TONES = {
  overdue: "text-rose-600",
  today: "text-[#0058cc]",
  default: "text-muted-foreground",
};

function Section({
  title,
  items,
  tone = "default",
  info,
  onEdit,
}: {
  title: string;
  items: Activity[];
  tone?: keyof typeof TONES;
  /** One short sentence explaining what lands in this bucket. */
  info?: string;
  onEdit: (activity: Activity) => void;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2
        className={cn(
          "mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase",
          TONES[tone],
        )}
      >
        {title}
        <span className="rounded-full bg-gray-100 px-1.5 py-px text-[11px] font-medium text-gray-600 normal-case">
          {items.length}
        </span>
        {info ? <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip> : null}
      </h2>
      <ul className="space-y-2">
        {items.map((a) => (
          <RowShell key={a.id} activity={a} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}

/** ActivityRow + a click target that opens the edit dialog. */
function RowShell({
  activity,
  onEdit,
}: {
  activity: Activity;
  onEdit: (activity: Activity) => void;
}) {
  return (
    <div className="group/row relative">
      <ActivityRow activity={activity} showDealLink showPersonLink />
      <button
        type="button"
        onClick={() => onEdit(activity)}
        className="absolute top-2 right-20 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#0058cc] opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-[#eef6fc]"
      >
        Edit
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((s) => (
        <div key={s} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
