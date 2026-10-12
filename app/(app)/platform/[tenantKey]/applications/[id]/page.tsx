"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CircleX,
  ClipboardList,
  GraduationCap,
  RotateCcw,
  School,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DealStatusBadge } from "@/components/crm/badges";
import { EmptyState } from "@/components/crm/empty-state";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { FieldRow, InlineSelect, InlineText } from "@/components/crm/inline-field";
import { OwnerSelect } from "@/components/crm/owner-select";
import { TagPicker } from "@/components/crm/tag-picker";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { isOverdue, programLine } from "@/components/crm/deals/deal-card";
import { StageStepper } from "@/components/crm/deals/stage-stepper";
import { LostDialog } from "@/components/crm/deals/lost-dialog";
import { openStages, useDealLookups } from "@/components/crm/deals/use-lookups";
import { useSession } from "@/hooks/use-session";
import {
  errorMessage,
  errorStatus,
  useAttachDealTagMutation,
  useDeleteDealMutation,
  useDetachDealTagMutation,
  useGetDealQuery,
  useMarkDealLostMutation,
  useMarkDealWonMutation,
  useMoveDealStageMutation,
  useUpdateDealMutation,
} from "@/lib/crm/api";
import {
  dealValue,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelative,
} from "@/lib/crm/format";
import type { DealInput, PipelineStage } from "@/lib/crm/types";
import { APPLICATION_FIELDS, readMeta, withMeta, type MetaField } from "@/lib/recruit/fields";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "INR",
  "BRL",
  "MXN",
  "SGD",
  "ZAR",
];

const YES_NO = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/** The inline editor for one `APPLICATION_FIELDS` entry. */
function MetaFieldEditor({
  field,
  metadata,
  onSave,
}: {
  field: MetaField;
  metadata: Record<string, unknown> | undefined;
  onSave: (field: MetaField, value: string) => Promise<unknown> | void;
}) {
  const raw = readMeta(metadata, field.key);
  if (field.type === "boolean") {
    return (
      <InlineSelect
        value={raw}
        options={YES_NO}
        onSave={(v) => onSave(field, v)}
        allowEmpty
        emptyLabel="Not set"
        placeholder="Not set"
      />
    );
  }
  if (field.type === "select") {
    return (
      <InlineSelect
        value={raw}
        options={field.options ?? []}
        onSave={(v) => onSave(field, v)}
        allowEmpty
        emptyLabel="Not set"
        placeholder="Not set"
      />
    );
  }
  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "email"
        ? "email"
        : field.type === "date"
          ? "date"
          : "text";
  return (
    <InlineText
      value={raw}
      type={inputType}
      onSave={(v) => onSave(field, v)}
      placeholder={field.placeholder ? `e.g. ${field.placeholder}` : "Not set"}
      render={field.type === "date" ? (v) => formatDate(v) : undefined}
    />
  );
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const dealId = Number(params?.id);
  const router = useRouter();
  const { href } = useSession();

  const {
    data: deal,
    isLoading,
    error,
  } = useGetDealQuery(dealId, { skip: !Number.isFinite(dealId) });
  const lookups = useDealLookups();
  const [updateDeal] = useUpdateDealMutation();
  const [moveStage, { isLoading: moving }] = useMoveDealStageMutation();
  const [markWon, { isLoading: winning }] = useMarkDealWonMutation();
  const [markLost, { isLoading: losing }] = useMarkDealLostMutation();
  const [removeDeal, { isLoading: removing }] = useDeleteDealMutation();
  const [attachTag] = useAttachDealTagMutation();
  const [detachTag] = useDetachDealTagMutation();

  const [pendingStage, setPendingStage] = useState<PipelineStage | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostStage, setLostStage] = useState<PipelineStage | null>(null);
  const [confirmWon, setConfirmWon] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useBreadcrumbs(
    useMemo(
      () => [
        { label: VOCAB.application.many, href: href("/applications") },
        { label: deal?.title ?? VOCAB.application.one },
      ],
      [href, deal?.title],
    ),
  );

  const pipeline = deal ? lookups.pipelineById.get(deal.pipeline) : undefined;
  const stage = deal ? lookups.stageById.get(deal.stage) : undefined;
  const person = deal ? lookups.personById.get(deal.person) : undefined;
  const organization = deal?.organization
    ? lookups.organizationById.get(deal.organization)
    : undefined;
  const firstOpenStage = openStages(pipeline)[0];

  const patch = async (body: DealInput) => {
    if (!deal) return;
    try {
      await updateDeal({ id: deal.id, body }).unwrap();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const saveMeta = (field: MetaField, value: string) =>
    deal ? patch({ metadata: withMeta(deal.metadata, field, value) }) : undefined;

  const doMove = async (stageId: number, message: string) => {
    if (!deal) return;
    try {
      await moveStage({ id: deal.id, stage_id: stageId }).unwrap();
      toast.success(message);
    } catch (err) {
      toast.error(errorMessage(err, "Could not move the application"));
    } finally {
      setPendingStage(null);
    }
  };

  if (!Number.isFinite(dealId) || errorStatus(error) === 404) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <EmptyState
          icon={<ClipboardList />}
          title="Application not found"
          description="This application may have been deleted, or it belongs to another organization."
          action={
            <Button variant="outline" onClick={() => router.push(href("/applications"))}>
              Back to applications
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading || !deal) {
    return (
      <div className="flex-1 space-y-4 overflow-auto p-4 md:p-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const closed = deal.status !== "open";
  const overdue = isOverdue(deal.expected_close_date, deal.status);
  const program = programLine(deal.metadata);
  const tuition = dealValue(deal);

  const onStageSelect = (target: PipelineStage) => {
    if (target.id === deal.stage) return;
    if (target.is_lost) {
      setLostStage(target);
      setLostOpen(true);
      return;
    }
    if (target.is_won || closed) {
      setPendingStage(target);
      return;
    }
    void doMove(target.id, `Moved to ${target.name}`);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
        {/* ------------------------------------------------------- header */}
        <section
          className={cn(
            "rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:p-5",
            deal.status === "won" && "border-emerald-200",
            deal.status === "lost" && "border-rose-200",
            deal.status === "open" && "border-[var(--border-color,#e5e7eb)]",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <EntityAvatar name={deal.title} seed={deal.id} kind="deal" size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 text-lg font-semibold text-gray-900">
                    <InlineText
                      value={deal.title}
                      onSave={(v) => patch({ title: v.trim() || deal.title })}
                      placeholder="Untitled application"
                    />
                  </div>
                  <DealStatusBadge status={deal.status} />
                </div>
                {program ? <p className="mt-0.5 text-sm text-gray-600">{program}</p> : null}
                {tuition > 0 ? (
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">
                    {formatCurrency(deal.lead_value, deal.currency)}
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                      {VOCAB.value.toLowerCase()}
                    </span>
                  </p>
                ) : null}
                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Link
                    href={href(`/prospects/${deal.person}`)}
                    className="inline-flex items-center gap-1 text-[#0058cc] hover:underline"
                  >
                    <User className="size-3" />
                    {person?.name ?? "Unknown prospect"}
                  </Link>
                  {deal.organization ? (
                    <Link
                      href={href(`/schools/${deal.organization}`)}
                      className="inline-flex items-center gap-1 text-[#0058cc] hover:underline"
                    >
                      <School className="size-3" />
                      {organization?.name ?? VOCAB.school.one}
                    </Link>
                  ) : null}
                  <span>{pipeline?.name ?? VOCAB.funnel.one}</span>
                  {deal.expected_close_date ? (
                    <span className={cn(overdue && "font-medium text-rose-600")}>
                      {overdue ? "Deadline passed · " : "Decide by "}
                      {formatDate(deal.expected_close_date)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {closed ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!firstOpenStage || moving}
                        onClick={() => firstOpenStage && setPendingStage(firstOpenStage)}
                      />
                    }
                  >
                    <RotateCcw data-icon="inline-start" /> Reopen
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Put the application back in {firstOpenStage?.name ?? "the first stage"} and
                    clear its decision date
                  </TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => setConfirmWon(true)}
                          disabled={winning}
                        />
                      }
                    >
                      <GraduationCap data-icon="inline-start" /> Mark enrolled
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      They committed — close the application as enrolled
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => {
                            setLostStage(null);
                            setLostOpen(true);
                          }}
                          disabled={losing}
                        />
                      }
                    >
                      <CircleX data-icon="inline-start" /> Mark withdrawn
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      They withdrew or were denied — you are asked for a reason
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete application"
                      className="text-gray-400 hover:text-rose-600"
                      onClick={() => setConfirmDelete(true)}
                    />
                  }
                >
                  <Trash2 />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Delete this application and its activity — this cannot be undone
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3">
            <StageStepper
              pipeline={pipeline}
              currentStageId={deal.stage}
              status={deal.status}
              onSelect={onStageSelect}
              disabled={moving || winning || losing}
            />
          </div>
        </section>

        {/* --------------------------------------------- fields + timeline */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <aside className="rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                {VOCAB.application.one}
              </h2>
              <dl className="divide-y divide-gray-100">
                {APPLICATION_FIELDS.map((field) => (
                  <FieldRow key={field.key} label={field.label} hint={field.hint}>
                    <MetaFieldEditor field={field} metadata={deal.metadata} onSave={saveMeta} />
                  </FieldRow>
                ))}
              </dl>
            </aside>

            <aside className="rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                Details
              </h2>
              <dl className="divide-y divide-gray-100">
                <FieldRow label={VOCAB.prospect.one}>
                  <Link
                    href={href(`/prospects/${deal.person}`)}
                    className="inline-flex min-w-0 items-center gap-1.5 text-[#0058cc] hover:underline"
                  >
                    <EntityAvatar name={person?.name ?? "?"} seed={deal.person} size="xs" />
                    <span className="truncate">{person?.name ?? "Unknown prospect"}</span>
                  </Link>
                </FieldRow>

                <FieldRow
                  label={VOCAB.school.one}
                  hint="The high school, college or partner this prospect comes from."
                >
                  <div className="space-y-1">
                    <InlineSelect
                      value={deal.organization ?? ""}
                      options={lookups.organizations.map((o) => ({ value: o.id, label: o.name }))}
                      onSave={(v) => patch({ organization: v || null })}
                      allowEmpty
                      emptyLabel="No school"
                      placeholder="No school"
                    />
                    {deal.organization ? (
                      <Link
                        href={href(`/schools/${deal.organization}`)}
                        className="ml-1.5 text-xs text-[#0058cc] hover:underline"
                      >
                        Open school
                      </Link>
                    ) : null}
                  </div>
                </FieldRow>

                <FieldRow label={VOCAB.funnel.one}>
                  <span className="text-gray-700">{pipeline?.name ?? `#${deal.pipeline}`}</span>
                </FieldRow>

                <FieldRow label="Stage" hint="Move the application with the stage pills above.">
                  <span className="text-gray-700">{stage?.name ?? `#${deal.stage}`}</span>
                </FieldRow>

                <FieldRow
                  label={VOCAB.counselor.one}
                  hint="Who shepherds this application; it shows on their board and lists."
                >
                  <OwnerSelect
                    value={deal.owner}
                    onChange={(o) => void patch({ owner: o })}
                    size="sm"
                    className="border-transparent bg-transparent shadow-none hover:bg-gray-50"
                  />
                </FieldRow>

                <FieldRow
                  label={VOCAB.source.one}
                  hint="How this prospect found you; the list is managed in Settings → Sources."
                >
                  <InlineSelect
                    value={deal.source ? String(deal.source) : ""}
                    options={lookups.sources.map((s) => ({ value: String(s.id), label: s.name }))}
                    onSave={(v) => patch({ source: v ? Number(v) : null })}
                    allowEmpty
                    emptyLabel="No source"
                    placeholder="No source"
                  />
                </FieldRow>

                <FieldRow
                  label={VOCAB.deadline}
                  hint="The date they must decide by. Turns red once it passes while the application is open."
                >
                  <InlineText
                    value={deal.expected_close_date ?? ""}
                    type="date"
                    onSave={(v) => patch({ expected_close_date: v || null })}
                    placeholder="No deadline"
                    render={(v) => (
                      <span className={cn(overdue && "font-medium text-rose-600")}>
                        {formatDate(v)}
                      </span>
                    )}
                  />
                </FieldRow>

                <FieldRow
                  label={VOCAB.value}
                  hint="Optional. Tuition after aid, per year; it feeds the funnel totals and the weighted yield."
                >
                  <InlineText
                    value={tuition > 0 ? (deal.lead_value ?? "") : ""}
                    type="number"
                    onSave={(v) => patch({ lead_value: v.trim() ? String(Number(v)) : "0" })}
                    placeholder="Not estimated"
                    render={(v) => formatCurrency(v, deal.currency)}
                  />
                </FieldRow>

                <FieldRow label="Currency">
                  <InlineSelect
                    value={deal.currency ?? "USD"}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onSave={(v) => patch({ currency: v })}
                  />
                </FieldRow>

                {closed ? (
                  <FieldRow label={deal.status === "won" ? "Enrolled on" : "Withdrawn on"}>
                    <span className="text-gray-700">{formatDateTime(deal.closed_at)}</span>
                  </FieldRow>
                ) : null}

                {deal.status === "lost" ? (
                  <FieldRow label="Why">
                    <span className="text-rose-700">{deal.lost_reason || "—"}</span>
                  </FieldRow>
                ) : null}

                <FieldRow label="Tags" hint="Shared labels; manage them under Tags.">
                  <TagPicker
                    tags={deal.tags ?? []}
                    onAttach={(tagId) => attachTag({ id: deal.id, tag_id: tagId }).unwrap()}
                    onDetach={(tagId) => detachTag({ id: deal.id, tag_id: tagId }).unwrap()}
                    compact
                  />
                </FieldRow>

                <FieldRow label="Notes">
                  <InlineText
                    value={deal.description ?? ""}
                    multiline
                    onSave={(v) => patch({ description: v })}
                    placeholder="Add a note for the team"
                  />
                </FieldRow>

                <FieldRow label="Created">
                  <span className="text-gray-600" title={formatDateTime(deal.created_at)}>
                    {formatRelative(deal.created_at)}
                  </span>
                </FieldRow>

                <FieldRow label="Updated">
                  <span className="text-gray-600" title={formatDateTime(deal.updated_at)}>
                    {formatRelative(deal.updated_at)}
                  </span>
                </FieldRow>
              </dl>
            </aside>
          </div>

          <section className="min-w-0">
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Activity
            </h2>
            <ActivityTimeline deal={deal.id} />
          </section>
        </div>
      </div>

      {/* ------------------------------------------------------- dialogs */}
      <ConfirmDialog
        open={!!pendingStage}
        onOpenChange={(o) => !o && setPendingStage(null)}
        title={
          closed && pendingStage && !pendingStage.is_won && !pendingStage.is_lost
            ? "Reopen this application?"
            : `Move to ${pendingStage?.name ?? "stage"}?`
        }
        description={
          closed && pendingStage && !pendingStage.is_won && !pendingStage.is_lost
            ? `The application reopens in “${pendingStage.name}” and its decision date is cleared.`
            : `“${deal.title}” moves to ${pendingStage?.name ?? "this stage"}${
                pendingStage?.is_won ? " and closes as enrolled" : ""
              }.`
        }
        confirmLabel="Move"
        loading={moving}
        onConfirm={() =>
          pendingStage
            ? doMove(
                pendingStage.id,
                closed && !pendingStage.is_won
                  ? "Application reopened"
                  : `Moved to ${pendingStage.name}`,
              )
            : undefined
        }
      />

      <ConfirmDialog
        open={confirmWon}
        onOpenChange={setConfirmWon}
        title="Mark this application enrolled?"
        description={
          tuition > 0
            ? `“${deal.title}” closes as enrolled at ${formatCurrency(deal.lead_value, deal.currency)} estimated net tuition.`
            : `“${deal.title}” closes as enrolled.`
        }
        confirmLabel="Mark enrolled"
        loading={winning}
        onConfirm={async () => {
          try {
            await markWon({ id: deal.id }).unwrap();
            setConfirmWon(false);
            toast.success("Enrolled 🎓");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />

      <LostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        loading={losing}
        onConfirm={async (reason) => {
          try {
            await markLost({
              id: deal.id,
              lost_reason: reason,
              stage_code: lostStage?.code,
            }).unwrap();
            setLostOpen(false);
            setLostStage(null);
            toast.success("Application marked withdrawn");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this application?"
        description={`“${deal.title}” and its activity will be permanently removed. The prospect stays.`}
        confirmLabel="Delete"
        destructive
        loading={removing}
        onConfirm={async () => {
          try {
            await removeDeal(deal.id).unwrap();
            toast.success("Application deleted");
            router.push(href("/applications"));
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
