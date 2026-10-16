"use client";

import { useMemo, useState } from "react";
import { useDealLookups } from "@/components/crm/deals/use-lookups";
import {
  useGetOverviewQuery,
  useListActivitiesQuery,
  useListDealsQuery,
  useListPersonsQuery,
} from "@/lib/crm/api";
import { sortStages, toDate } from "@/lib/crm/format";
import config from "@/lib/iblai/config";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Today's window and "now", read outside the render body. */
function todayWindow() {
  const today = startOfDay(new Date());
  return {
    today,
    tomorrow: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    now: Date.now(),
  };
}

/**
 * Everything the Funnel dashboard shows: the platform's `/overview/` totals
 * (every application, not a page of them), this month's new prospects, the
 * newest records, and the open activities — "today" stays the browser's.
 */
export function useDashboardData() {
  const lookups = useDealLookups();
  // One clock per mount; the memos read it instead of calling Date during render.
  const [now] = useState(() => new Date());
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);

  const { data: overview, isLoading: overviewLoading } = useGetOverviewQuery();
  const { data: activities, isLoading: activitiesLoading } = useListActivitiesQuery({
    is_done: false,
    page_size: 100,
  });
  const { data: inquiries } = useListPersonsQuery({
    created_at__gte: monthStart.toISOString(),
    page_size: 1,
  });
  const { data: newestPeople } = useListPersonsQuery({ ordering: "-created_at", page_size: 5 });
  const { data: newestDeals } = useListDealsQuery({ ordering: "-created_at", page_size: 5 });

  const deals = overview?.deals;
  const stats = useMemo(
    () => ({
      currency: deals?.currency || config.defaultCurrency(),
      openCount: deals?.open_count ?? 0,
      pipelineValue: Number(deals?.pipeline_value ?? 0),
      weighted: Number(deals?.weighted_value ?? 0),
      wonCount: deals?.won_this_month_count ?? 0,
      wonValue: Number(deals?.won_this_month_value ?? 0),
    }),
    [deals],
  );

  const upcoming = useMemo(() => {
    const open = (activities?.results ?? []).filter((a) => !a.is_done);
    const withSchedule = open
      .filter((a) => !!a.schedule_from)
      .sort(
        (a, b) =>
          new Date(a.schedule_from as string).getTime() -
          new Date(b.schedule_from as string).getTime(),
      );
    const { today, tomorrow, now } = todayWindow();
    const dueToday = withSchedule.filter((a) => {
      const d = toDate(a.schedule_from);
      return !!d && d >= today && d < tomorrow;
    }).length;
    const overdue = withSchedule.filter((a) => {
      const d = toDate(a.schedule_from);
      return !!d && d.getTime() < now;
    }).length;
    return { list: withSchedule.concat(open.filter((a) => !a.schedule_from)), dueToday, overdue };
  }, [activities]);

  const recentPeople = useMemo(() => newestPeople?.results ?? [], [newestPeople]);
  const recentDeals = useMemo(() => newestDeals?.results ?? [], [newestDeals]);

  /** Open applications in each open stage of the default funnel. */
  const stageBreakdown = useMemo(() => {
    const rows = new Map((deals?.by_stage ?? []).map((row) => [row.stage.id, row]));
    const stages = sortStages((deals?.by_stage ?? []).map((row) => row.stage)).filter(
      (s) => !s.is_won && !s.is_lost,
    );
    return stages.map((stage) => ({
      name: stage.name,
      count: rows.get(stage.id)?.count ?? 0,
      value: Number(rows.get(stage.id)?.total_value ?? 0),
    }));
  }, [deals]);

  /** The last six months (UTC, as the platform buckets them). */
  const wonLostByMonth = useMemo(
    () =>
      (deals?.won_lost_by_month ?? []).map((m) => {
        const [year, month] = m.month.split("-").map(Number);
        return {
          key: m.month,
          label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
            month: "short",
            timeZone: "UTC",
          }),
          won: m.won_count,
          lost: m.lost_count,
          wonValue: Number(m.won_value),
          lostValue: Number(m.lost_value),
        };
      }),
    [deals],
  );

  const peopleCount = overview?.persons?.count ?? 0;
  const isLoading = overviewLoading || activitiesLoading || lookups.isLoading;

  return {
    lookups,
    stats,
    upcoming,
    inquiriesThisMonth: inquiries?.count ?? 0,
    recentPeople,
    recentDeals,
    stageBreakdown,
    wonLostByMonth,
    peopleCount,
    isLoading,
    isEmptyOrg: !isLoading && !!overview && peopleCount === 0 && recentDeals.length === 0,
  };
}
