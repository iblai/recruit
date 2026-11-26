"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  useCreatePeriodicAgentMutation,
  useDeletePeriodicAgentMutation,
  useGetPeriodicAgentsQuery,
} from "@iblai/iblai-js/data-layer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/crm/simple-select";
import { useSession } from "@/hooks/use-session";
import { CHANNELS, PLATFORMS } from "@/lib/recruit/found";
import {
  FIND_PREFIX,
  dailyAt,
  findingPrompt,
  findingTitle,
  localTime,
  localWeekday,
  rightAway,
  weeklyAt,
  type Crontab,
  type SavedSearch,
} from "@/lib/recruit/schedule";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

const BLANK: SavedSearch = {
  program: "",
  area: "",
  classYear: "",
  channels: [...PLATFORMS],
  where: "",
  every: "week",
};

/** The scheduler's task names are unique (200 characters at most): the time makes each one its own. */
const taskName = (title: string) => `${title.slice(0, 170)} ${new Date().toISOString()}`;

interface Task {
  id: number;
  title: string;
  prompt?: string;
  one_off: boolean;
  task?: { crontab?: Partial<Crontab> | null } | null;
}

/**
 * Settings → Schedule: searches for students on social channels that the
 * Chief of Staff runs on its own clock, each one a platform task. Every run
 * ends in a shortlist a person reviews under Needs you.
 */
export function SavedSearches({ agentId, basis }: { agentId: string; basis: boolean }) {
  const t = useTranslations("recruit.settings");
  const locale = useLocale();
  const { tenantKey, username, isAdmin } = useSession();
  // The generated argument types leave out `userId`; the platform's path needs it.
  const identity = { org: tenantKey, userId: username } as { org: string; userId: string };
  // ponytail: one page of the agent's tasks; Run now's spent one-offs count against it.
  const tasks = useGetPeriodicAgentsQuery(
    { ...identity, mentorId: agentId, pageSize: 100 },
    { skip: !tenantKey || !username || !agentId },
  );
  const [create] = useCreatePeriodicAgentMutation();
  const [remove] = useDeletePeriodicAgentMutation();
  const [form, setForm] = useState<SavedSearch>(BLANK);
  const [busy, setBusy] = useState(false);
  const searches = ((tasks.data?.results ?? []) as unknown as Task[]).filter(
    (task) => task.title.startsWith(FIND_PREFIX) && !task.one_off,
  );
  const can = isAdmin && basis && !busy;
  const valid =
    !!form.program.trim() &&
    !!form.area.trim() &&
    form.channels.length > 0 &&
    (!form.classYear || /^(19|20)\d\d$/.test(form.classYear));

  const schedule = (
    title: string,
    prompt: string,
    when: ReturnType<typeof dailyAt>,
    once: boolean,
  ) =>
    create({
      ...identity,
      requestBody: {
        mentor: agentId,
        title,
        prompt,
        task: {
          name: taskName(title),
          crontab: when.crontab,
          enabled: true,
          one_off: once,
          start_time: when.start_time,
        },
      } as never,
    }).unwrap();

  // data-layer 1.38.1 answers the platform's 204 with no data, which RTK reports as a failure: whether the task is gone decides.
  const drop = async (id: number) => {
    await remove({ id, ...identity } as never)
      .unwrap()
      .catch(() => undefined);
    const { data } = await tasks.refetch();
    if (((data?.results ?? []) as unknown as Task[]).some((t) => t.id === id))
      throw new Error("The search is still there.");
  };

  const act = async (work: () => Promise<unknown>, done: string, failed: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
    } catch {
      toast.error(failed);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(
      async () => {
        const s = {
          ...form,
          program: form.program.trim(),
          area: form.area.trim(),
          where: form.where?.trim(),
        };
        await schedule(
          findingTitle(s),
          findingPrompt(s),
          s.every === "day" ? dailyAt(7) : weeklyAt(7, 1),
          false,
        );
        setForm(BLANK);
      },
      t("searchSaved"),
      t("searchFailed"),
    );

  const when = (task: Task) => {
    const crontab = task.task?.crontab ?? undefined;
    const time = localTime(crontab, locale);
    const day = crontab?.day_of_week === "*" ? "" : localWeekday(crontab, locale);
    return day ? t("searchWeekly", { day, time }) : t("searchDaily", { time });
  };

  return (
    <section data-testid="saved-searches" className={`${CARD} grid max-w-2xl gap-3`}>
      <h2 className="text-sm font-semibold text-gray-900">{t("searchesTitle")}</h2>
      <p className="text-sm text-gray-600">{t("searchesBody")}</p>
      {basis ? null : <p className="text-xs text-gray-600">{t("searchesNeedBasis")}</p>}
      {searches.length ? (
        <ul className="divide-y divide-gray-100 border-y border-gray-100">
          {searches.map((task) => (
            <li
              key={task.id}
              data-testid="saved-search"
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="break-words text-gray-900">
                  {task.title.slice(FIND_PREFIX.length)}
                </div>
                <div className="text-xs text-gray-600">{when(task)}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can}
                  onClick={() =>
                    act(
                      () => schedule(`${task.title} (now)`, task.prompt ?? "", rightAway(), true),
                      t("searchStarted"),
                      t("searchFailed"),
                    )
                  }
                >
                  {t("searchRunNow")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!isAdmin || busy}
                  onClick={() => act(() => drop(task.id), t("searchDeleted"), t("searchFailed"))}
                >
                  {t("searchDelete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="search-program">{t("searchProgram")}</Label>
          <Input
            id="search-program"
            maxLength={120}
            value={form.program}
            onChange={(e) => setForm({ ...form, program: e.target.value })}
            disabled={!can}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="search-area">{t("searchArea")}</Label>
          <Input
            id="search-area"
            maxLength={80}
            placeholder={t("searchAreaExample")}
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            disabled={!can}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="search-year">{t("searchClassYear")}</Label>
          <Input
            id="search-year"
            inputMode="numeric"
            maxLength={4}
            value={form.classYear}
            onChange={(e) => setForm({ ...form, classYear: e.target.value.trim() })}
            disabled={!can}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t("searchEvery")}</Label>
          <SimpleSelect
            aria-label={t("searchEvery")}
            value={form.every}
            onChange={(v) => setForm({ ...form, every: v === "day" ? "day" : "week" })}
            options={[
              { value: "week", label: t("searchEveryWeek") },
              { value: "day", label: t("searchEveryDay") },
            ]}
            disabled={!can}
          />
        </div>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-gray-900">{t("searchChannels")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox
                checked={form.channels.includes(p)}
                disabled={!can}
                onCheckedChange={(on) =>
                  setForm({
                    ...form,
                    channels: on ? [...form.channels, p] : form.channels.filter((c) => c !== p),
                  })
                }
              />
              {CHANNELS[p].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="search-where">{t("searchWhere")}</Label>
        <Textarea
          id="search-where"
          maxLength={300}
          rows={2}
          value={form.where}
          onChange={(e) => setForm({ ...form, where: e.target.value })}
          disabled={!can}
        />
        <p className="text-muted-foreground text-xs">{t("searchWhereHint")}</p>
      </div>
      <div>
        <Button size="sm" className="ibl-button-primary" disabled={!can || !valid} onClick={save}>
          {t("searchSave")}
        </Button>
      </div>
    </section>
  );
}
