"use client";

import { useMemo } from "react";
import { useDealLookups } from "@/components/crm/deals/use-lookups";
import { useListActivitiesQuery, useListAllDealsQuery } from "@/lib/crm/api";
import { dealValue, sortStages, toDate, weightedValue } from "@/lib/crm/format";
import type { Deal } from "@/lib/crm/types";
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

/** The currency most of the tuition is in — the dashboard totals one currency. */
function dominantCurrency(deals: Deal[]) {
  const tally = new Map<string, number>();
  for (const d of deals) {
    const c = d.currency || config.defaultCurrency();
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  let best = config.defaultCurrency();
  let bestN = 0;
  for (const [c, n] of tally) if (n > bestN) [best, bestN] = [c, n];
  return best;
}

/**
 * Everything the Funnel dashboard shows, derived from three cached queries:
 * every application (deal), the first page of prospects (persons), and the
 * open activities.
 */
export function useDashboardData() {
  const lookups = useDealLookups();
  const { data: deals, isLoading: dealsLoading } = useListAllDealsQuery();
  const { data: activities, isLoading: activitiesLoading } = useListActivitiesQuery({
    is_done: false,
    page_size: 100,
  });

  const rows = useMemo(() => deals ?? [], [deals]);
  const openDeals = useMemo(() => rows.filter((d) => d.status === "open"), [rows]);

  const stats = useMemo(() => {
    const currency = dominantCurrency(rows.length ? rows : []);
    const pipelineValue = openDeals.reduce((sum, d) => sum + dealValue(d), 0);
    const weighted = openDeals.reduce(
      (sum, d) => sum + weightedValue(d, lookups.stageById.get(d.stage)),
      0,
    );
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const wonThisMonth = rows.filter((d) => {
      if (d.status !== "won") return false;
      const closed = toDate(d.closed_at);
      return !!closed && closed >= monthStart;
    });
    return {
      currency,
      openCount: openDeals.length,
      pipelineValue,
      weighted,
      wonCount: wonThisMonth.length,
      wonValue: wonThisMonth.reduce((sum, d) => sum + dealValue(d), 0),
    };
  }, [rows, openDeals, lookups.stageById]);

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

  /** Prospects created since the first of this month — the month's inquiries. */
  const inquiriesThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return lookups.persons.filter((p) => {
      const created = toDate(p.created_at);
      return !!created && created >= monthStart;
    }).length;
  }, [lookups.persons]);

  const recentPeople = useMemo(
    () =>
      [...lookups.persons]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [lookups.persons],
  );

  const recentDeals = useMemo(
    () =>
      [...rows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [rows],
  );

  const stageBreakdown = useMemo(() => {
    const pipeline = lookups.defaultPipeline;
    const stages = sortStages(pipeline?.stages ?? []).filter((s) => !s.is_won && !s.is_lost);
    return stages.map((stage) => {
      const inStage = openDeals.filter((d) => d.stage === stage.id);
      return {
        name: stage.name,
        count: inStage.length,
        value: inStage.reduce((sum, d) => sum + dealValue(d), 0),
      };
    });
  }, [lookups.defaultPipeline, openDeals]);

  const wonLostByMonth = useMemo(() => {
    const now = new Date();
    const buckets: {
      key: string;
      label: string;
      won: number;
      lost: number;
      wonValue: number;
      lostValue: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: "short" }),
        won: 0,
        lost: 0,
        wonValue: 0,
        lostValue: 0,
      });
    }
    const index = new Map(buckets.map((b) => [b.key, b]));
    for (const deal of rows) {
      if (deal.status === "open") continue;
      const closed = toDate(deal.closed_at);
      if (!closed) continue;
      const bucket = index.get(`${closed.getFullYear()}-${closed.getMonth()}`);
      if (!bucket) continue;
      if (deal.status === "won") {
        bucket.won += 1;
        bucket.wonValue += dealValue(deal);
      } else {
        bucket.lost += 1;
        bucket.lostValue += dealValue(deal);
      }
    }
    return buckets;
  }, [rows]);

  return {
    lookups,
    deals: rows,
    openDeals,
    stats,
    upcoming,
    inquiriesThisMonth,
    recentPeople,
    recentDeals,
    stageBreakdown,
    wonLostByMonth,
    peopleCount: lookups.personCount,
    isLoading: dealsLoading || activitiesLoading || lookups.isLoading,
    isEmptyOrg:
      !dealsLoading && !lookups.isLoading && rows.length === 0 && lookups.personCount === 0,
  };
}
