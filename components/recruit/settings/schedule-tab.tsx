"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  useCreatePeriodicAgentMutation,
  useGetPeriodicAgentsQuery,
} from "@iblai/iblai-js/data-layer";
import { AgentTasksTab } from "@iblai/iblai-js/web-containers/next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentFrame } from "@/components/recruit/agent-frame";
import { SavedSearches } from "@/components/recruit/settings/saved-searches";
import { useSession } from "@/hooks/use-session";
import { OUTREACH_PROMPT, OUTREACH_TASK, dailyAt, localTime } from "@/lib/recruit/schedule";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/**
 * Settings → Schedule: what the Chief of Staff does on its own clock. The list
 * is the platform's own; the one button adds the daily outreach run.
 */
export function ScheduleTab() {
  const t = useTranslations("recruit.settings");
  const { tenantKey, username, isAdmin } = useSession();
  const { agentId, isLoading, settings, update, refetch } = useRecruitSettings();
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState("");
  useEffect(() => setDrafts(String(settings.dailyDrafts ?? 50)), [settings.dailyDrafts]);
  const limit = Number(drafts);
  const validLimit = Number.isInteger(limit) && limit >= 1 && limit <= 500;
  const saveLimit = () =>
    update({ dailyDrafts: limit })
      .then(() => refetch())
      .then(() => toast.success(t("mailSaved")))
      .catch(() => toast.error(t("mailFailed")));
  const [create] = useCreatePeriodicAgentMutation();
  // The generated argument type leaves out `userId`; the platform's path needs it.
  const identity = { org: tenantKey, userId: username } as { org: string; userId: string };
  const tasks = useGetPeriodicAgentsQuery(
    { ...identity, mentorId: agentId, title: OUTREACH_TASK, pageSize: 5 },
    { skip: !tenantKey || !username || !agentId },
  );
  const outreach = tasks.data?.results?.find((task) => task.title === OUTREACH_TASK);

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!agentId) return <p className="text-sm text-gray-600">{t("needsAgent")}</p>;

  const add = async () => {
    setBusy(true);
    try {
      const { crontab, start_time } = dailyAt(8);
      await create({
        ...identity,
        requestBody: {
          mentor: agentId,
          title: OUTREACH_TASK,
          prompt: OUTREACH_PROMPT,
          task: { name: OUTREACH_TASK, crontab, enabled: true, one_off: false, start_time },
        } as never,
      }).unwrap();
      toast.success(t("outreachAdded"));
    } catch {
      toast.error(t("outreachFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <section className={`${CARD} grid max-w-2xl gap-2`}>
        <h2 className="text-sm font-semibold text-gray-900">{t("outreachTitle")}</h2>
        <p className="text-sm text-gray-600">{t("outreachBody")}</p>
        {outreach ? (
          <p data-testid="outreach-on" className="text-xs text-gray-600">
            {t("outreachOn", { time: localTime(outreach.task?.crontab) })}
          </p>
        ) : (
          <div>
            <Button
              size="sm"
              className="ibl-button-primary"
              disabled={busy || tasks.isLoading || !isAdmin}
              onClick={add}
            >
              {t("outreachAdd")}
            </Button>
          </div>
        )}
        <div className="grid gap-1.5 border-t border-gray-100 pt-3">
          <Label htmlFor="daily-drafts">{t("dailyDrafts")}</Label>
          <div className="flex gap-2">
            <Input
              id="daily-drafts"
              type="number"
              min={1}
              max={500}
              value={drafts}
              onChange={(e) => setDrafts(e.target.value)}
              disabled={!isAdmin}
              className="h-9 w-24"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={!isAdmin || !validLimit || limit === (settings.dailyDrafts ?? 50)}
              onClick={saveLimit}
            >
              {t("mailSave")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("dailyDraftsHint")}</p>
        </div>
      </section>
      <SavedSearches agentId={agentId} basis={(settings.foundBasis ?? "").trim().length >= 10} />
      {/* The platform's task list fills a frame of its own height. */}
      <div className="h-[36rem] overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white">
        <AgentFrame agentId={agentId}>
          <AgentTasksTab />
        </AgentFrame>
      </div>
    </div>
  );
}
