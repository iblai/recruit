"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronsUpDown, ClipboardList, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { InfoTip } from "@/components/crm/info-tip";
import { SimpleSelect } from "@/components/crm/simple-select";
import { OwnerSelect } from "@/components/crm/owner-select";
import { useSession } from "@/hooks/use-session";
import {
  errorMessage,
  errorStatus,
  useCreateActivityMutation,
  useListDealsQuery,
  useListPersonsQuery,
  useUpdateActivityMutation,
} from "@/lib/crm/api";
import { ACTIVITY_TYPES, type Activity, type ActivityType } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

const LOCAL_PATTERN = "yyyy-MM-dd'T'HH:mm";

/** ISO timestamp → the value a `datetime-local` input expects (local time). */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, LOCAL_PATTERN);
}

/** `datetime-local` value → ISO timestamp (or null when empty / invalid). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface DraftState {
  type: ActivityType;
  title: string;
  person: string;
  deal: string;
  scheduleFrom: string;
  scheduleTo: string;
  location: string;
  comment: string;
  reminder: boolean;
  owner: number | null;
  isDone: boolean;
}

function draftFrom(activity: Activity | undefined, userId: number | null): DraftState {
  return {
    type: activity?.type ?? "task",
    title: activity?.title ?? "",
    person: activity?.person ?? "",
    deal: activity?.deal ? String(activity.deal) : "",
    scheduleFrom: toLocalInput(activity?.schedule_from),
    scheduleTo: toLocalInput(activity?.schedule_to),
    location: activity?.location ?? "",
    comment: activity?.comment ?? "",
    reminder: !!activity?.reminder_at,
    owner: activity ? (activity.owner ?? null) : userId,
    isDone: !!activity?.is_done,
  };
}

/**
 * Create or edit an activity. The API requires an activity to hang off a
 * prospect (person) or an application (deal), so at least one of the two must
 * be picked — the form says so rather than letting the request fail.
 */
export function ActivityDialog({
  open,
  onOpenChange,
  activity,
  defaultPerson,
  defaultDeal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing activity; omit to create one. */
  activity?: Activity;
  defaultPerson?: string;
  defaultDeal?: number;
  onSaved?: (activity: Activity) => void;
}) {
  const { userId } = useSession();
  const [create, { isLoading: creating }] = useCreateActivityMutation();
  const [update, { isLoading: updating }] = useUpdateActivityMutation();
  const saving = creating || updating;

  const [draft, setDraft] = useState<DraftState>(() => draftFrom(activity, userId));
  const [touched, setTouched] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = draftFrom(activity, userId);
    setDraft({
      ...base,
      person: base.person || defaultPerson || "",
      deal: base.deal || (defaultDeal ? String(defaultDeal) : ""),
    });
    setTouched(false);
  }, [open, activity, userId, defaultPerson, defaultDeal]);

  const { data: persons } = useListPersonsQuery({ page_size: 100 }, { skip: !open });
  const { data: deals } = useListDealsQuery({ page_size: 100, status: "open" }, { skip: !open });

  const personRows = useMemo(() => persons?.results ?? [], [persons]);
  const selectedPerson = personRows.find((p) => p.id === draft.person);
  const dealOptions = useMemo(
    () => (deals?.results ?? []).map((d) => ({ value: String(d.id), label: d.title })),
    [deals],
  );

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const titleMissing = !draft.title.trim();
  const linkMissing = !draft.person && !draft.deal;
  const invalid = titleMissing || linkMissing;

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    const scheduleFrom = fromLocalInput(draft.scheduleFrom);
    const body = {
      type: draft.type,
      title: draft.title.trim(),
      person: draft.person || null,
      deal: draft.deal ? Number(draft.deal) : null,
      schedule_from: scheduleFrom,
      schedule_to: fromLocalInput(draft.scheduleTo),
      location: draft.location.trim(),
      comment: draft.comment.trim(),
      reminder_at: draft.reminder && scheduleFrom ? scheduleFrom : null,
      owner: draft.owner,
      is_done: draft.isDone,
    };
    try {
      const saved = activity
        ? await update({ id: activity.id, body }).unwrap()
        : await create(body).unwrap();
      toast.success(activity ? "Activity updated" : "Activity created");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        errorStatus(err) === 403 ? "You don't have permission to do that" : errorMessage(err),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>{activity ? "Edit activity" : "New activity"}</DialogTitle>
          <DialogDescription>
            Calls, visits, meetings, tasks and notes always belong to a prospect or an application.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5 px-4 pb-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label
              htmlFor="activity-type"
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              Type
              <InfoTip label="About the type field">
                Notes are logged as done; calls, visits, meetings and tasks can be scheduled
              </InfoTip>
            </Label>
            <SimpleSelect
              value={draft.type}
              onChange={(v) => set("type", v as ActivityType)}
              options={ACTIVITY_TYPES}
              size="sm"
              aria-label="Activity type"
            />
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="activity-owner"
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              Counselor
              <InfoTip label="About the counselor field">
                Whose list this shows up on under “Mine”
              </InfoTip>
            </Label>
            <OwnerSelect value={draft.owner} onChange={(v) => set("owner", v)} size="sm" />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="activity-title" className="text-muted-foreground text-xs">
              Title
            </Label>
            <Input
              id="activity-title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Campus tour with the family…"
              className="h-8 text-sm"
              aria-invalid={touched && titleMissing}
            />
            {touched && titleMissing ? (
              <p className="text-xs text-rose-600">A title is required.</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-muted-foreground text-xs">Prospect</Label>
            <Popover open={personOpen} onOpenChange={setPersonOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-between font-normal"
                  />
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {selectedPerson ? (
                    <>
                      <EntityAvatar name={selectedPerson.name} seed={selectedPerson.id} size="xs" />
                      <span className="truncate">{selectedPerson.name}</span>
                    </>
                  ) : (
                    <>
                      <UserRound className="text-muted-foreground size-3.5" />
                      <span className="text-muted-foreground">Search prospects…</span>
                    </>
                  )}
                </span>
                <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command shouldFilter>
                  <CommandInput autoFocus placeholder="Search prospects…" />
                  <CommandList>
                    <CommandEmpty>No prospect found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none"
                        onSelect={() => {
                          set("person", "");
                          setPersonOpen(false);
                        }}
                      >
                        <span className="text-muted-foreground">No prospect</span>
                        {!draft.person ? <Check className="ml-auto size-4 text-[#0058cc]" /> : null}
                      </CommandItem>
                      {personRows.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${p.primary_email ?? ""}`}
                          onSelect={() => {
                            set("person", p.id);
                            setPersonOpen(false);
                          }}
                        >
                          <EntityAvatar name={p.name} seed={p.id} size="xs" />
                          <span className="min-w-0 truncate">{p.name}</span>
                          {p.primary_email ? (
                            <span className="text-muted-foreground truncate text-[11px]">
                              {p.primary_email}
                            </span>
                          ) : null}
                          {draft.person === p.id ? (
                            <Check className="ml-auto size-4 text-[#0058cc]" />
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-muted-foreground text-xs">
              <ClipboardList className="size-3" /> Application
            </Label>
            <SimpleSelect
              value={draft.deal}
              onChange={(v) => set("deal", v)}
              options={dealOptions}
              allowEmpty
              emptyLabel="No application"
              placeholder="No application"
              size="sm"
              aria-label="Application"
            />
          </div>

          {touched && linkMissing ? (
            <p className="-mt-1 text-xs text-rose-600 sm:col-span-2">
              Link the activity to a prospect or an application — at least one is needed.
            </p>
          ) : (
            <p className="text-muted-foreground -mt-1 text-[11px] sm:col-span-2">
              Pick a prospect, an application, or both.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label
              htmlFor="activity-from"
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              Starts
              <InfoTip label="About the start time">
                Leave empty for unscheduled work; a time is needed for reminders
              </InfoTip>
            </Label>
            <Input
              id="activity-from"
              type="datetime-local"
              value={draft.scheduleFrom}
              onChange={(e) => set("scheduleFrom", e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="activity-to" className="text-muted-foreground text-xs">
              Ends
            </Label>
            <Input
              id="activity-to"
              type="datetime-local"
              value={draft.scheduleTo}
              min={draft.scheduleFrom || undefined}
              onChange={(e) => set("scheduleTo", e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="activity-location" className="text-muted-foreground text-xs">
              Location / link
            </Label>
            <Input
              id="activity-location"
              value={draft.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Zoom, admissions office, phone, campus…"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="activity-comment" className="text-muted-foreground text-xs">
              Details
            </Label>
            <Textarea
              id="activity-comment"
              value={draft.comment}
              onChange={(e) => set("comment", e.target.value)}
              rows={3}
              placeholder="Agenda, outcome, next steps…"
              className="text-sm"
            />
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color,#e5e7eb)] px-3 py-2 sm:col-span-2",
              !draft.scheduleFrom && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Remind the counselor</p>
              <p className="text-muted-foreground text-[11px]">
                {draft.scheduleFrom
                  ? "A reminder is sent at the start time."
                  : "Set a start time to enable reminders."}
              </p>
            </div>
            <Switch
              checked={draft.reminder && !!draft.scheduleFrom}
              disabled={!draft.scheduleFrom}
              onCheckedChange={(checked) => set("reminder", checked)}
              aria-label="Remind the counselor"
            />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="activity-done"
              checked={draft.isDone}
              onCheckedChange={(checked) => set("isDone", checked === true)}
            />
            <Label htmlFor="activity-done" className="text-sm text-gray-700">
              Already done
            </Label>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-xl">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="ibl-button-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {activity ? "Save changes" : "Create activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
