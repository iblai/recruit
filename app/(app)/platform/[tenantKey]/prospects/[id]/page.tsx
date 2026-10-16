"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Link2, Merge, MoreHorizontal, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LifecycleBadge } from "@/components/crm/badges";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { EmptyState } from "@/components/crm/empty-state";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { FieldRow, InlineSelect, InlineText } from "@/components/crm/inline-field";
import { OwnerSelect } from "@/components/crm/owner-select";
import { TagPicker } from "@/components/crm/tag-picker";
import { toastApiError } from "@/components/crm/people/crm-error";
import { DealsMiniTable } from "@/components/crm/people/deals-mini-table";
import { PersonInviteDialog } from "@/components/crm/people/person-invite-dialog";
import { PersonLinkUserDialog } from "@/components/crm/people/person-link-user-dialog";
import { PersonMergeDialog } from "@/components/crm/people/person-merge-dialog";
import { useSession } from "@/hooks/use-session";
import {
  errorStatus,
  useAttachPersonTagMutation,
  useDeletePersonMutation,
  useDetachPersonTagMutation,
  useGetPersonQuery,
  useListOrganizationsQuery,
  usePatchMetadataMutation,
  useUpdatePersonMutation,
} from "@/lib/crm/api";
import { formatDateTime, formatRelative } from "@/lib/crm/format";
import { LIFECYCLE_STAGES, type LifecycleStage, type PersonInput } from "@/lib/crm/types";
import { metaPatch, PROSPECT_FIELDS, readMeta, type MetaField } from "@/lib/recruit/fields";
import { LIFECYCLE_LABELS, VOCAB } from "@/lib/recruit/vocabulary";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

const STAGE_HINT = `How far along this ${VOCAB.prospect.lower} is: ${LIFECYCLE_LABELS.lead} → ${LIFECYCLE_LABELS.qualified} → ${LIFECYCLE_LABELS.opportunity} → ${LIFECYCLE_LABELS.customer} · ${LIFECYCLE_LABELS.churned}.`;

const YES_NO = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/** `<input type>` for a free-text recruitment field. */
function inputType(field: MetaField): "text" | "email" | "number" | "date" {
  switch (field.type) {
    case "email":
    case "number":
    case "date":
      return field.type;
    default:
      return "text";
  }
}

/** Split a comma-separated field back into the API's string array. */
function toList(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Prospect "show page" (a CRM person): the record, its contact details, the
 * recruitment fields kept in `metadata`, its timeline and its applications.
 */
export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const router = useRouter();
  const { href } = useSession();

  const { data: person, isLoading, error } = useGetPersonQuery(id, { skip: !id });
  const { data: orgs } = useListOrganizationsQuery({ page_size: 100 });
  const [updatePerson] = useUpdatePersonMutation();
  const [patchMetadata] = usePatchMetadataMutation();
  const [deletePerson, { isLoading: deleting }] = useDeletePersonMutation();
  const [attachTag] = useAttachPersonTagMutation();
  const [detachTag] = useDetachPersonTagMutation();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useBreadcrumbs([
    { label: VOCAB.prospect.many, href: href("/prospects") },
    { label: person?.name ?? VOCAB.prospect.one },
  ]);

  const orgOptions = useMemo(
    () => (orgs?.results ?? []).map((o) => ({ value: o.id, label: o.name })),
    [orgs],
  );
  const orgName = person?.organization_name ?? undefined;

  const save = async (body: PersonInput) => {
    try {
      await updatePerson({ id, body }).unwrap();
    } catch (err) {
      toastApiError(err, "Could not save this change");
    }
  };

  /** Recruitment fields live in `metadata`, merged one key at a time. */
  const saveMeta = async (field: MetaField, value: string) => {
    try {
      await patchMetadata({ kind: "persons", id, patch: metaPatch(field, value) }).unwrap();
    } catch (err) {
      toastApiError(err, "Could not save this change");
    }
  };

  if (errorStatus(error) === 404) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
        <EmptyState
          icon={<Users />}
          title={`This ${VOCAB.prospect.lower} no longer exists`}
          description={`The record may have been deleted or merged into another ${VOCAB.prospect.lower}.`}
          action={
            <Button variant="outline" onClick={() => router.push(href("/prospects"))}>
              <ArrowLeft data-icon="inline-start" /> Back to {VOCAB.prospect.many}
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading || !person) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  const canInvite = Boolean(person.primary_email) && !person.platform_user;
  const inviteHint = person.platform_user
    ? "Already linked to a platform user"
    : "Add a primary email first";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
        {/* ------------------------------------------------------ header */}
        <div className={`${CARD} flex flex-wrap items-start justify-between gap-4 p-4 md:p-5`}>
          <div className="flex min-w-0 items-center gap-4">
            <EntityAvatar name={person.name} seed={person.id} kind="person" size="xl" />
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">
                <InlineText
                  value={person.name}
                  onSave={(v) => (v.trim() ? save({ name: v.trim() }) : undefined)}
                  placeholder={`Unnamed ${VOCAB.prospect.lower}`}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <InlineSelect
                  value={person.lifecycle_stage ?? "lead"}
                  options={LIFECYCLE_STAGES}
                  onSave={(v) => save({ lifecycle_stage: (v || "lead") as LifecycleStage })}
                  renderValue={(v) => <LifecycleBadge stage={v as LifecycleStage} />}
                />
                {person.platform_user ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex cursor-default items-center gap-1 rounded-full bg-[#eef6fc] px-2 py-0.5 text-[11px] font-medium text-[#0058cc] ring-1 ring-[#0058cc]/20 ring-inset" />
                      }
                    >
                      <Link2 className="size-3" /> Linked to platform user #{person.platform_user}
                    </TooltipTrigger>
                    <TooltipContent>
                      This {VOCAB.prospect.lower} can sign in to the platform
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {!person.active ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex cursor-default items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset" />
                      }
                    >
                      Inactive
                    </TooltipTrigger>
                    <TooltipContent>
                      Archived — kept for history, no longer being recruited
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canInvite ? (
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="outline" onClick={() => setInviteOpen(true)} />}
                >
                  <UserPlus data-icon="inline-start" /> Invite to platform
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Emails an ibl.ai invitation; the {VOCAB.prospect.lower} becomes a platform user
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="outline" nativeButton={false} disabled />}
                  aria-label={`Invite to platform — ${inviteHint}`}
                >
                  <UserPlus data-icon="inline-start" /> Invite to platform
                </TooltipTrigger>
                <TooltipContent>{inviteHint}</TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={<Button variant="outline" size="icon" aria-label="More actions" />}
                    />
                  }
                >
                  <MoreHorizontal />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Link to a user, merge duplicates, delete
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setLinkOpen(true)}>
                  <Link2 /> Link to user
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMergeOpen(true)}>
                  <Merge /> Merge duplicates
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete {VOCAB.prospect.lower}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ------------------------------------------- fields + activity */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <section className={`${CARD} p-4`}>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Details
            </h2>
            <dl className="divide-y divide-gray-100">
              <FieldRow label="Email">
                <InlineText
                  value={person.primary_email}
                  type="email"
                  onSave={(v) => save({ primary_email: v.trim() })}
                  placeholder="Add an email"
                  render={(v) => (
                    <a
                      href={`mailto:${v}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#0058cc] hover:underline"
                    >
                      {v}
                    </a>
                  )}
                />
              </FieldRow>
              <FieldRow label="Other emails" hint="Comma-separated.">
                <InlineText
                  value={(person.emails ?? []).join(", ")}
                  onSave={(v) => save({ emails: toList(v) })}
                  placeholder="Add emails, comma separated"
                />
              </FieldRow>
              <FieldRow label="Phones" hint="Comma-separated.">
                <InlineText
                  value={(person.contact_numbers ?? []).join(", ")}
                  onSave={(v) => save({ contact_numbers: toList(v) })}
                  placeholder="Add phone numbers"
                />
              </FieldRow>
              <FieldRow
                label={VOCAB.intendedProgram}
                hint="The major, degree or certificate they are interested in. For school contacts, use this for their role, e.g. Counselor."
              >
                <InlineText
                  value={person.job_title}
                  onSave={(v) => save({ job_title: v.trim() })}
                  placeholder="Add a program"
                />
              </FieldRow>
              <FieldRow
                label={VOCAB.school.one}
                hint="Their current high school, college or partner organization."
              >
                <div className="min-w-0">
                  <InlineSelect
                    value={person.organization ?? ""}
                    options={orgOptions}
                    onSave={(v) => save({ organization: v || null })}
                    allowEmpty
                    emptyLabel={`No ${VOCAB.school.lower}`}
                    placeholder={`No ${VOCAB.school.lower}`}
                  />
                  {person.organization ? (
                    <Link
                      href={href(`/schools/${person.organization}`)}
                      className="mt-0.5 ml-1.5 inline-block text-xs text-[#0058cc] hover:underline"
                    >
                      Open {orgName ?? VOCAB.school.lower}
                    </Link>
                  ) : null}
                </div>
              </FieldRow>
              <FieldRow
                label={VOCAB.counselor.one}
                hint={`The admissions counselor who owns this ${VOCAB.prospect.lower}.`}
              >
                <OwnerSelect
                  value={person.owner}
                  onChange={(owner) => void save({ owner })}
                  size="sm"
                  className="h-8 border-transparent bg-transparent shadow-none hover:bg-gray-50"
                />
              </FieldRow>
              <FieldRow label="Stage" hint={STAGE_HINT}>
                <InlineSelect
                  value={person.lifecycle_stage ?? "lead"}
                  options={LIFECYCLE_STAGES}
                  onSave={(v) => save({ lifecycle_stage: (v || "lead") as LifecycleStage })}
                />
              </FieldRow>
              <FieldRow
                label="External id"
                hint="Id from your SIS, Common App or another system — unique per organization."
              >
                <InlineText
                  value={person.unique_id}
                  onSave={(v) => save({ unique_id: v.trim() })}
                  placeholder="Add an external id"
                />
              </FieldRow>
              <FieldRow label="Tags" hint="Shared labels; manage them under Tags.">
                <TagPicker
                  tags={person.tags ?? []}
                  onAttach={(tag_id) => attachTag({ id: person.id, tag_id }).unwrap()}
                  onDetach={(tag_id) => detachTag({ id: person.id, tag_id }).unwrap()}
                  compact
                />
              </FieldRow>
              <FieldRow label="Created">
                <span className="text-muted-foreground" title={formatDateTime(person.created_at)}>
                  {formatRelative(person.created_at)}
                </span>
              </FieldRow>
              <FieldRow label="Updated">
                <span className="text-muted-foreground" title={formatDateTime(person.updated_at)}>
                  {formatRelative(person.updated_at)}
                </span>
              </FieldRow>
            </dl>

            <h2 className="text-muted-foreground mt-5 mb-2 text-xs font-semibold tracking-wide uppercase">
              Recruitment
            </h2>
            <dl className="divide-y divide-gray-100">
              {PROSPECT_FIELDS.map((field) => (
                <FieldRow key={field.key} label={field.label} hint={field.hint}>
                  {field.type === "boolean" ? (
                    <InlineSelect
                      value={readMeta(person.metadata, field.key)}
                      options={YES_NO}
                      onSave={(v) => saveMeta(field, v)}
                      allowEmpty
                      emptyLabel="Not recorded"
                      placeholder="Not recorded"
                    />
                  ) : field.type === "select" ? (
                    <InlineSelect
                      value={readMeta(person.metadata, field.key)}
                      options={field.options ?? []}
                      onSave={(v) => saveMeta(field, v)}
                      allowEmpty
                      emptyLabel="Not set"
                      placeholder="Not set"
                    />
                  ) : (
                    <InlineText
                      value={readMeta(person.metadata, field.key)}
                      type={inputType(field)}
                      onSave={(v) => saveMeta(field, v)}
                      placeholder={
                        field.placeholder
                          ? `e.g. ${field.placeholder}`
                          : `Add ${field.label.toLowerCase()}`
                      }
                    />
                  )}
                </FieldRow>
              ))}
            </dl>
          </section>

          <section className="min-w-0">
            <Tabs defaultValue="timeline">
              <TabsList variant="line">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="deals">{VOCAB.application.many}</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline" className="pt-4">
                <ActivityTimeline person={person.id} />
              </TabsContent>
              <TabsContent value="deals" className="pt-4">
                <DealsMiniTable
                  person={person.id}
                  emptyDescription={`${person.name} has not started an ${VOCAB.application.lower} yet.`}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>

      <PersonInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} person={person} />
      <PersonLinkUserDialog open={linkOpen} onOpenChange={setLinkOpen} person={person} />
      <PersonMergeDialog open={mergeOpen} onOpenChange={setMergeOpen} person={person} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${person.name}?`}
        description={`The ${VOCAB.prospect.lower}, their activities and their tag assignments are removed. ${VOCAB.application.many} stay, but lose their ${VOCAB.prospect.lower}.`}
        confirmLabel={`Delete ${VOCAB.prospect.lower}`}
        destructive
        loading={deleting}
        onConfirm={async () => {
          try {
            await deletePerson(person.id).unwrap();
            setConfirmDelete(false);
            toast.success(`${person.name} deleted`);
            router.push(href("/prospects"));
          } catch (err) {
            toastApiError(err, `Could not delete this ${VOCAB.prospect.lower}`);
          }
        }}
      />
    </div>
  );
}
