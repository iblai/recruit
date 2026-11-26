"use client";

import { Gauge } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useGetLlmUsageMetricsQuery,
  useGetTranscriptsMessagesQuery,
} from "@iblai/iblai-js/data-layer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { PageHeader } from "@/components/crm/page-header";
import { useSession } from "@/hooks/use-session";
import {
  useGetOverviewQuery,
  useListActivitiesQuery,
  useListDealsQuery,
  useListPersonsQuery,
} from "@/lib/crm/api";
import {
  chatter,
  lastDays,
  lostFrom,
  medianSeconds,
  outsideOfficeHours,
  reached,
  STAGE_CHANGED,
  windows,
} from "@/lib/recruit/scoreboard";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

/**
 * The numbers an enrollment leader takes to the cabinet, from what the platform
 * records. A figure it cannot back reads "Not recorded", never an estimate.
 */
export default function ScoreboardPage() {
  const t = useTranslations("recruit.scoreboard");
  const { tenantKey, href } = useSession();
  const { settings } = useRecruitSettings();
  useBreadcrumbs([{ label: t("title"), href: href("/scoreboard") }]);
  const agent = settings.studentAgentId ?? "";
  const scope = { platform_key: tenantKey, mentor_unique_id: agent };

  // ponytail: office hours are read off the latest hundred; a dated count when the platform offers one by hour.
  const talks = useGetTranscriptsMessagesQuery({ ...scope, page: 1, limit: 100 }, { skip: !agent });
  const overview = useGetOverviewQuery();
  const stages = overview.data?.deals?.by_stage ?? [];
  const [now, ago] = useState(() => windows(new Date()))[0];

  /** Each figure the platform can count in a window, for one window. */
  function useWindow(w: { start_date: string; end_date: string }) {
    const latency = useGetLlmUsageMetricsQuery(
      { ...scope, date_filter: "custom", ...w, measures: ["latency"], aggregation: "p50" },
      { skip: !agent },
    );
    const booked = useListDealsQuery({
      metadata__has_key: "event",
      created_at__gte: `${w.start_date}T00:00:00`,
      created_at__lte: `${w.end_date}T23:59:59.999`,
      page_size: 1,
    });
    // ponytail: the latest hundred stage moves per window; a dated count when the platform offers one.
    const notes = useListActivitiesQuery({
      type: "note",
      search: STAGE_CHANGED,
      ...w,
      ordering: "-created_at",
      page_size: 100,
    });
    const moved = notes.data?.results ?? [];
    const from = (n: number | null) => (notes.data ? n : null);
    return {
      seconds: medianSeconds(latency.data?.data),
      booked: booked.data?.count ?? null,
      applications: from(reached(moved, stages, "applied")),
      deposits: from(reached(moved, stages, "deposited")),
      melt: from(lostFrom(moved, stages, "deposited")),
      partial: notes.data && notes.data.count > moved.length ? moved.length : null,
    };
  }
  const cur = useWindow(now);
  const old = useWindow(ago);

  // Where students are talking: the shortlists and kept students of the last 90 days.
  const [quarter] = useState(() => lastDays(new Date(), 90));
  const lists = useListActivitiesQuery({
    metadata__has_key: "shortlist",
    ...quarter,
    ordering: "-created_at",
    page_size: 100,
  });
  const keptPeople = useListPersonsQuery({
    metadata__has_key: "found",
    created_at__gte: `${quarter.start_date}T00:00:00`,
    page_size: 100,
  });
  const where =
    lists.data && keptPeople.data ? chatter(lists.data.results, keptPeople.data.results) : null;
  // ponytail: the latest hundred of each; a dated count when the platform offers one.
  const wherePartial =
    (lists.data?.count ?? 0) > (lists.data?.results.length ?? 0) ||
    (keptPeople.data?.count ?? 0) > (keptPeople.data?.results.length ?? 0);

  const latest = talks.data?.results ?? [];
  const count = (n: number | null | undefined) => (typeof n === "number" ? String(n) : null);
  const lastYear = (n: number | string | null) => (n === null ? undefined : t("lastYear", { n }));
  const movesNote = (key: "applications" | "deposits" | "melt") =>
    [
      lastYear(old.partial === null ? old[key] : null),
      cur.partial === null ? t("movesNote") : t("partialMoves", { n: cur.partial }),
    ]
      .filter(Boolean)
      .join(" · ");

  const tiles = [
    {
      id: "reply-time",
      label: t("replyTime"),
      value: cur.seconds === null ? null : t("seconds", { n: cur.seconds }),
      note: [
        t("period"),
        t("replyNote"),
        lastYear(old.seconds === null ? null : t("seconds", { n: old.seconds })),
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      id: "conversations",
      label: t("conversations"),
      value: count(talks.data?.summary?.total_conversations),
    },
    {
      id: "after-hours",
      label: t("afterHours"),
      value: talks.data ? String(outsideOfficeHours(latest.map((c) => c.created_at))) : null,
      note: `${t("partial", { n: latest.length })} ${t("afterHoursNote")}`,
    },
    {
      id: "applications",
      label: t("applications"),
      value: count(cur.applications),
      note: movesNote("applications"),
    },
    { id: "booked", label: t("booked"), value: count(cur.booked), note: lastYear(old.booked) },
    // The funnel has no aid stage, and its aid field records a request, not a finished form.
    { id: "aid", label: t("aid"), value: null },
    {
      id: "deposits",
      label: t("deposits"),
      value: count(cur.deposits),
      note: movesNote("deposits"),
    },
    { id: "melt", label: t("melt"), value: count(cur.melt), note: movesNote("melt") },
  ];

  return (
    <>
      <PageHeader icon={<Gauge />} title={t("title")} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <div
              key={tile.id}
              data-testid={`score-${tile.id}`}
              className="rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4"
            >
              <dt className="text-xs font-medium text-gray-500">{tile.label}</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
                {tile.value ?? (
                  <span className="text-sm font-normal text-gray-500">{t("notRecorded")}</span>
                )}
              </dd>
              {tile.note ? <p className="mt-1 text-[11px] text-gray-500">{tile.note}</p> : null}
            </div>
          ))}
        </dl>
        <section
          data-testid="where-students"
          className="mt-3 rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4"
        >
          <h2 className="text-xs font-medium text-gray-500">{t("whereTitle")}</h2>
          <p className="mt-1 text-[11px] text-gray-500">
            {[t("whereNote"), wherePartial ? t("wherePartial") : null].filter(Boolean).join(" · ")}
          </p>
          {!where ? null : where.channels.every((c) => !c.proposed) && !where.places.length ? (
            <p className="mt-3 text-sm text-gray-500">{t("whereNone")}</p>
          ) : (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <Table data-testid="where-channels">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("whereChannel")}</TableHead>
                    <TableHead className="text-right">{t("whereProposed")}</TableHead>
                    <TableHead className="text-right">{t("whereKept")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {where.channels.map((c) => (
                    <TableRow key={c.platform}>
                      <TableCell>{c.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.proposed}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.kept}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Table data-testid="where-places">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("wherePlace")}</TableHead>
                    <TableHead className="text-right">{t("whereProposed")}</TableHead>
                    <TableHead className="text-right">{t("whereKept")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {where.places.map((p) => (
                    <TableRow key={p.label}>
                      <TableCell className="break-words whitespace-normal">{p.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.proposed}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.kept}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
