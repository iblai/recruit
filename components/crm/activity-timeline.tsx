"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Check, CalendarClock, Circle, MapPin, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ActivityIcon } from "@/components/crm/activity-icon";
import { InfoTip } from "@/components/crm/info-tip";
import { ActivityTypeBadge } from "@/components/crm/badges";
import { SimpleSelect } from "@/components/crm/simple-select";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { OwnerName } from "@/components/crm/owner-select";
import { useSession } from "@/hooks/use-session";
import {
  errorMessage,
  useCreateActivityMutation,
  useDeleteActivityMutation,
  useListActivitiesQuery,
  useMarkActivityDoneMutation,
  useUpdateActivityMutation,
} from "@/lib/crm/api";
import { formatDateTime, formatRelative, scheduleLabel } from "@/lib/crm/format";
import { ACTIVITY_TYPES, type Activity, type ActivityType } from "@/lib/crm/types";
import { ACTIVITY_LABELS } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

/**
 * The activity timeline of a prospect or an application: quick-log composer
 * on top, then open work (scheduled, overdue) and the history (done, notes,
 * the auto-recorded "Stage changed" entries) below. Works for both hosts —
 * pass `person` (UUID) and/or `deal` (id).
 */
export function ActivityTimeline({
  person,
  deal,
  showDealLinks = true,
  className,
}: {
  person?: string;
  deal?: number;
  showDealLinks?: boolean;
  className?: string;
}) {
  const { data, isLoading } = useListActivitiesQuery(
    { person: deal ? undefined : person, deal, page_size: 100 },
    { skip: !person && !deal },
  );

  const { open, done } = useMemo(() => {
    const rows = [...(data?.results ?? [])];
    const open = rows
      .filter((a) => !a.is_done)
      .sort((a, b) => {
        const as = a.schedule_from ? new Date(a.schedule_from).getTime() : Infinity;
        const bs = b.schedule_from ? new Date(b.schedule_from).getTime() : Infinity;
        return as - bs;
      });
    const done = rows
      .filter((a) => a.is_done)
      .sort(
        (a, b) =>
          new Date(b.done_at ?? b.updated_at).getTime() -
          new Date(a.done_at ?? a.updated_at).getTime(),
      );
    return { open, done };
  }, [data]);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <ActivityComposer person={person} deal={deal} />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {!isLoading && open.length === 0 && done.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm">
          No activity yet. Log a call, schedule a visit, or leave a note above.
        </p>
      ) : null}

      {open.length ? (
        <section>
          <h3 className="text-muted-foreground mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            Open · {open.length}
            <InfoTip label="About open activities">
              Not done yet — tick the circle to complete one
            </InfoTip>
          </h3>
          <ul className="space-y-2">
            {open.map((a) => (
              <ActivityRow key={a.id} activity={a} showDealLink={showDealLinks && !deal} />
            ))}
          </ul>
        </section>
      ) : null}

      {done.length ? (
        <section>
          <h3 className="text-muted-foreground mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
            History · {done.length}
            <InfoTip label="About the history">
              Everything already done, newest first — notes land here too
            </InfoTip>
          </h3>
          <ul className="relative space-y-2 before:absolute before:top-3 before:bottom-3 before:left-[15px] before:w-px before:bg-gray-200">
            {done.map((a) => (
              <ActivityRow key={a.id} activity={a} showDealLink={showDealLinks && !deal} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** One activity — renders an `<li>`; wrap a list of them in a `<ul>`. */
export function ActivityRow({
  activity,
  showDealLink,
  showPersonLink,
}: {
  activity: Activity;
  showDealLink?: boolean;
  showPersonLink?: boolean;
}) {
  const { href } = useSession();
  const [markDone, { isLoading: marking }] = useMarkActivityDoneMutation();
  const [update] = useUpdateActivityMutation();
  const [remove, { isLoading: removing }] = useDeleteActivityMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const schedule = scheduleLabel(activity.schedule_from, !!activity.is_done);

  const toggleDone = async () => {
    try {
      if (activity.is_done) await update({ id: activity.id, body: { is_done: false } }).unwrap();
      else await markDone(activity.id).unwrap();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <li
      className={cn(
        "relative flex gap-3 rounded-lg border border-[var(--border-color,#e5e7eb)] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]",
        activity.is_done && "bg-gray-50/60",
      )}
    >
      <ActivityIcon type={activity.type} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-sm font-medium text-gray-900",
              activity.is_done && "text-gray-500 line-through decoration-gray-300",
            )}
          >
            {activity.title}
          </span>
          <ActivityTypeBadge type={activity.type} />
          {activity.is_done ? (
            <span className="text-muted-foreground text-[11px]">
              done {formatRelative(activity.done_at ?? activity.updated_at)}
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                schedule.tone === "overdue" && "text-rose-600",
                schedule.tone === "today" && "text-[#0058cc]",
                schedule.tone === "soon" && "text-amber-600",
                schedule.tone === "muted" && "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3" /> {schedule.label}
            </span>
          )}
        </div>
        {activity.comment ? (
          <p className="mt-1 text-sm whitespace-pre-wrap text-gray-600">{activity.comment}</p>
        ) : null}
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {activity.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {activity.location}
            </span>
          ) : null}
          <span>
            <OwnerName ownerId={activity.owner} />
          </span>
          <span title={formatDateTime(activity.created_at)}>
            logged {formatRelative(activity.created_at)}
          </span>
          {showDealLink && activity.deal ? (
            <Link
              href={href(`/applications/${activity.deal}`)}
              className="text-[#0058cc] hover:underline"
            >
              Application #{activity.deal}
            </Link>
          ) : null}
          {showPersonLink && activity.person ? (
            <Link
              href={href(`/prospects/${activity.person}`)}
              className="text-[#0058cc] hover:underline"
            >
              View prospect
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void toggleDone()}
                disabled={marking}
                aria-label={activity.is_done ? "Mark as not done" : "Mark as done"}
                className={
                  activity.is_done ? "text-emerald-600" : "text-gray-400 hover:text-emerald-600"
                }
              />
            }
          >
            {activity.is_done ? <Check /> : <Circle />}
          </TooltipTrigger>
          <TooltipContent>{activity.is_done ? "Mark not done" : "Mark done"}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}
                />
              }
            >
              <MoreHorizontal />
            </TooltipTrigger>
            <TooltipContent>More actions for this activity</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this activity?"
        description={`“${activity.title}” will be removed from the timeline.`}
        confirmLabel="Delete"
        destructive
        loading={removing}
        onConfirm={async () => {
          try {
            await remove(activity.id).unwrap();
            setConfirmDelete(false);
            toast.success("Activity deleted");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </li>
  );
}

/** Quick-log composer: type · title · optional note, schedule and location. */
export function ActivityComposer({
  person,
  deal,
  onCreated,
  defaultType = "note",
}: {
  person?: string;
  deal?: number;
  onCreated?: (activity: Activity) => void;
  defaultType?: ActivityType;
}) {
  const { userId } = useSession();
  const [create, { isLoading }] = useCreateActivityMutation();
  const [type, setType] = useState<ActivityType>(defaultType);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [scheduleFrom, setScheduleFrom] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    try {
      const scheduled = scheduleFrom ? new Date(scheduleFrom).toISOString() : null;
      const created = await create({
        title: title.trim(),
        type,
        comment: comment.trim() || undefined,
        person: person ?? undefined,
        deal: deal ?? undefined,
        owner: userId ?? undefined,
        schedule_from: scheduled,
        location: location.trim() || undefined,
        reminder_at: reminder && scheduled ? scheduled : undefined,
        is_done: type === "note",
      }).unwrap();
      setTitle("");
      setComment("");
      setScheduleFrom("");
      setLocation("");
      setReminder(false);
      setExpanded(false);
      onCreated?.(created);
      toast.success(type === "note" ? "Note added" : "Activity logged");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex w-32" />}>
            <SimpleSelect
              value={type}
              onChange={(v) => setType(v as ActivityType)}
              options={ACTIVITY_TYPES}
              size="sm"
              className="w-32"
              aria-label="Activity type"
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Notes are logged as done; calls, visits, meetings and tasks can be scheduled
          </TooltipContent>
        </Tooltip>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={
            type === "note" ? "Write a note…" : `Log a ${ACTIVITY_LABELS[type].toLowerCase()}…`
          }
          className="h-8 min-w-40 flex-1 text-sm"
          aria-label="Activity title"
        />
        <Button
          size="sm"
          className="ibl-button-primary"
          disabled={!title.trim() || isLoading}
          onClick={() => void submit()}
        >
          <Plus data-icon="inline-start" /> Add
        </Button>
      </div>
      {expanded ? (
        <div className="mt-3 grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Details, outcome, next steps…"
              rows={2}
              className="text-sm"
              aria-label="Details"
            />
          </div>
          <div className="grid gap-1.5">
            <Label
              htmlFor="activity-schedule"
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              When
              <InfoTip label="About the when field">
                Leave empty to log it now; set a time to schedule it
              </InfoTip>
            </Label>
            <Input
              id="activity-schedule"
              type="datetime-local"
              value={scheduleFrom}
              onChange={(e) => setScheduleFrom(e.target.value)}
              className="h-8 text-sm"
              min={format(new Date(2000, 0, 1), "yyyy-MM-dd'T'HH:mm")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="activity-location">Location / link</Label>
            <Input
              id="activity-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Zoom, admissions office, phone, campus…"
              className="h-8 text-sm"
            />
          </div>
          <label
            className="text-muted-foreground flex items-center gap-2 text-xs sm:col-span-2"
            title={
              scheduleFrom
                ? "A reminder is sent to the counselor at the scheduled time"
                : "Set a time under “When” first"
            }
          >
            <input
              type="checkbox"
              checked={reminder}
              disabled={!scheduleFrom}
              onChange={(e) => setReminder(e.target.checked)}
              className="size-3.5 accent-[#0058cc]"
            />
            Remind the counselor at the scheduled time
            {!scheduleFrom ? (
              <span className="text-muted-foreground/70">— needs a time</span>
            ) : null}
          </label>
        </div>
      ) : null}
    </div>
  );
}
