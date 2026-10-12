"use client";

import Link from "next/link";
import {
  CalendarClock,
  CalendarPlus,
  ChartColumn,
  ClipboardList,
  Gauge,
  GraduationCap,
  Inbox,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { StatCard } from "@/components/crm/stat-card";
import { Panel } from "@/components/crm/dashboard/panel";
import { DealsByStageChart } from "@/components/crm/dashboard/deals-by-stage-chart";
import { WonLostChart } from "@/components/crm/dashboard/won-lost-chart";
import { UpNextList } from "@/components/crm/dashboard/up-next-list";
import { RecentDealsList, RecentPeopleList } from "@/components/crm/dashboard/recent-lists";
import { OnboardingCard } from "@/components/crm/dashboard/onboarding-card";
import { useDashboardData } from "@/components/crm/dashboard/use-dashboard-data";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { useSession } from "@/hooks/use-session";
import { formatCompactCurrency, formatCurrency, pluralize } from "@/lib/crm/format";
import { VOCAB } from "@/lib/recruit/vocabulary";

/** The Funnel dashboard: the numbers behind this cycle's recruitment funnel. */
export default function FunnelDashboardPage() {
  const { href } = useSession();
  useBreadcrumbs([{ label: VOCAB.funnel.one, href: href("/dashboard") }]);
  const data = useDashboardData();
  const { stats } = data;

  return (
    <>
      <PageHeader
        icon={<ChartColumn />}
        title={VOCAB.funnel.one}
        description="How this cycle is going — inquiries, open applications and enrollments"
        actions={
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={href("/prospects?new=1")} />}
                  />
                }
              >
                <UserPlus data-icon="inline-start" /> New prospect
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Add a student or contact — applications and activities hang off prospects
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={href("/activities?new=1")} />}
                  />
                }
              >
                <CalendarPlus data-icon="inline-start" /> Log activity
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Record a call, visit or note, or schedule a task or meeting
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    className="ibl-button-primary"
                    render={<Link href={href("/applications?new=1")} />}
                  />
                }
              >
                <ClipboardList data-icon="inline-start" /> New application
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Open an application for a prospect; it starts in the first stage
              </TooltipContent>
            </Tooltip>
          </>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
          {data.isEmptyOrg ? (
            <OnboardingCard />
          ) : (
            <>
              {/* ------------------------------------------------- stats */}
              {data.isLoading && data.deals.length === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <StatCard
                    label="Open applications"
                    labelText="open applications"
                    value={stats.openCount}
                    hint="across every funnel"
                    info="Applications that are neither enrolled nor withdrawn yet."
                    icon={<ClipboardList />}
                    tone="brand"
                  />
                  <StatCard
                    label="Inquiries this month"
                    labelText="inquiries this month"
                    value={data.inquiriesThisMonth}
                    hint={`${pluralize(data.peopleCount, "prospect")} on record`}
                    info="Prospects added since the first of this month — landing-page submissions, fairs, referrals."
                    icon={<Inbox />}
                  />
                  <StatCard
                    label={VOCAB.value}
                    labelText="estimated net tuition in the funnel"
                    value={formatCompactCurrency(stats.pipelineValue, stats.currency)}
                    hint={
                      stats.pipelineValue > 0
                        ? `${formatCurrency(stats.pipelineValue, stats.currency)} in funnel`
                        : "add estimates on applications"
                    }
                    info="Sum of the estimated net tuition of every open application. Est. net tuition is optional, so this only counts what has been filled in."
                    icon={<Wallet />}
                    tone="brand"
                  />
                  <StatCard
                    label="Weighted yield"
                    labelText="weighted yield"
                    value={formatCompactCurrency(stats.weighted, stats.currency)}
                    hint="by stage probability"
                    info="Each open application's estimated net tuition multiplied by its stage's likelihood of enrolling."
                    icon={<Gauge />}
                  />
                  <StatCard
                    label="Enrolled this month"
                    labelText="applications enrolled this month"
                    value={stats.wonCount}
                    hint={
                      stats.wonValue > 0
                        ? formatCurrency(stats.wonValue, stats.currency)
                        : "since the 1st"
                    }
                    info="Applications marked enrolled since the first of this month."
                    icon={<GraduationCap />}
                    tone="success"
                  />
                  <StatCard
                    label="Due today"
                    labelText="activities due today"
                    value={data.upcoming.dueToday}
                    hint={
                      data.upcoming.overdue > 0
                        ? `${pluralize(data.upcoming.overdue, "overdue item")}`
                        : "nothing overdue"
                    }
                    info="Open activities scheduled for today; overdue counts what is past due."
                    icon={<CalendarClock />}
                    tone={data.upcoming.overdue > 0 ? "warning" : "default"}
                  />
                </div>
              )}

              {/* ------------------------------------------------ charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                  title="Applications by stage"
                  titleText="applications by stage"
                  info="Open applications in the default funnel, by stage."
                  description={data.lookups.defaultPipeline?.name ?? "Default funnel"}
                  href={href("/applications")}
                  linkLabel="Open board"
                >
                  <DealsByStageChart data={data.stageBreakdown} currency={stats.currency} />
                </Panel>
                <Panel
                  title="Enrolled vs withdrawn"
                  titleText="enrolled versus withdrawn applications"
                  info="Applications closed in the last 6 months, by the date they were enrolled or withdrawn."
                  description="Last 6 months"
                >
                  <WonLostChart data={data.wonLostByMonth} currency={stats.currency} />
                </Panel>
              </div>

              {/* ------------------------------------------------- lists */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Panel
                  title="Up next"
                  titleText="up next"
                  info="The soonest open activities scheduled across the team."
                  description="Open, scheduled work"
                  href={href("/activities")}
                >
                  <UpNextList activities={data.upcoming.list.slice(0, 6)} />
                </Panel>
                <div className="grid min-w-0 gap-4">
                  <Panel title="New prospects" href={href("/prospects")}>
                    <RecentPeopleList people={data.recentPeople} />
                  </Panel>
                  <Panel title="Recent applications" href={href("/applications")}>
                    <RecentDealsList
                      deals={data.recentDeals}
                      personName={data.lookups.personName}
                    />
                  </Panel>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
