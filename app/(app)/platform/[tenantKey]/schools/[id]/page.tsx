"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { EmptyState } from "@/components/crm/empty-state";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { FieldRow, InlineSelect, InlineText } from "@/components/crm/inline-field";
import { OwnerSelect } from "@/components/crm/owner-select";
import { TagPicker } from "@/components/crm/tag-picker";
import { toastApiError } from "@/components/crm/people/crm-error";
import { DealsMiniTable } from "@/components/crm/people/deals-mini-table";
import { PeopleTable } from "@/components/crm/people/people-table";
import { PersonDialog } from "@/components/crm/people/person-dialog";
import { locationLabel } from "@/components/crm/organizations/organizations-table";
import { SCHOOL_TYPE_FIELD } from "@/components/crm/organizations/school-type";
import { useSession } from "@/hooks/use-session";
import {
  errorStatus,
  useAttachOrganizationTagMutation,
  useDeleteOrganizationMutation,
  useDetachOrganizationTagMutation,
  useGetOrganizationQuery,
  useListPersonsQuery,
  useUpdateOrganizationMutation,
} from "@/lib/crm/api";
import { formatDateTime, formatRelative } from "@/lib/crm/format";
import type { Address, OrganizationInput } from "@/lib/crm/types";
import { metaLabel, readMeta, withMeta } from "@/lib/recruit/fields";
import { VOCAB } from "@/lib/recruit/vocabulary";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

const ADDRESS_FIELDS: { key: keyof Address & string; label: string; placeholder: string }[] = [
  { key: "street", label: "Street", placeholder: "Add a street" },
  { key: "city", label: "City", placeholder: "Add a city" },
  { key: "state", label: "State / region", placeholder: "Add a state" },
  { key: "postal_code", label: "Postal code", placeholder: "Add a postal code" },
  { key: "country", label: "Country", placeholder: "Add a country" },
];

/**
 * School "show page" (a CRM organization): the school or partner, its type
 * and address, its prospects and their applications.
 */
export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const router = useRouter();
  const { href } = useSession();

  const { data: organization, isLoading, error } = useGetOrganizationQuery(id, { skip: !id });
  const [updateOrganization] = useUpdateOrganizationMutation();
  const [deleteOrganization, { isLoading: deleting }] = useDeleteOrganizationMutation();
  const [attachTag] = useAttachOrganizationTagMutation();
  const [detachTag] = useDetachOrganizationTagMutation();

  const { data: people, isLoading: loadingPeople } = useListPersonsQuery(
    { organization: id, page_size: 50 },
    { skip: !id },
  );

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useBreadcrumbs([
    { label: VOCAB.school.many, href: href("/schools") },
    { label: organization?.name ?? VOCAB.school.one },
  ]);

  const save = async (body: OrganizationInput) => {
    try {
      await updateOrganization({ id, body }).unwrap();
    } catch (err) {
      toastApiError(err, "Could not save this change");
    }
  };

  /** Address is one JSON column — merge the edited part back into the whole. */
  const saveAddressField = async (key: string, value: string) => {
    const next: Address = { ...organization?.address };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    await save({ address: next });
  };

  /** `school_type` lives in `metadata`; the API replaces it whole on PATCH. */
  const saveSchoolType = (value: string) =>
    save({ metadata: withMeta(organization?.metadata, SCHOOL_TYPE_FIELD, value) });

  if (errorStatus(error) === 404) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
        <EmptyState
          icon={<Building2 />}
          title={`This ${VOCAB.school.lower} no longer exists`}
          description="It may have been deleted by someone else on your team."
          action={
            <Button variant="outline" onClick={() => router.push(href("/schools"))}>
              <ArrowLeft data-icon="inline-start" /> Back to {VOCAB.school.many}
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading || !organization) {
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

  const location = locationLabel(organization.address);
  const schoolType = metaLabel(SCHOOL_TYPE_FIELD, organization.metadata);
  const peopleRows = people?.results ?? [];
  const prospectCount = people?.count ?? peopleRows.length;
  const prospectCountLabel = `${prospectCount} ${
    prospectCount === 1 ? VOCAB.prospect.lower : VOCAB.prospect.lowerMany
  }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
        {/* ------------------------------------------------------ header */}
        <div className={`${CARD} flex flex-wrap items-start justify-between gap-4 p-4 md:p-5`}>
          <div className="flex min-w-0 items-center gap-4">
            <EntityAvatar
              name={organization.name}
              seed={organization.id}
              kind="organization"
              size="xl"
            />
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">
                <InlineText
                  value={organization.name}
                  onSave={(v) => (v.trim() ? save({ name: v.trim() }) : undefined)}
                  placeholder={`Unnamed ${VOCAB.school.lower}`}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {[schoolType, location, prospectCountLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button className="ibl-button-primary" onClick={() => setAddPersonOpen(true)} />
                }
              >
                <Plus data-icon="inline-start" /> Add {VOCAB.prospect.lower}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Create a {VOCAB.prospect.lower} or contact already attached to this{" "}
                {VOCAB.school.lower}
              </TooltipContent>
            </Tooltip>
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
                <TooltipContent side="bottom">Delete this {VOCAB.school.lower}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete {VOCAB.school.lower}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ------------------------------------------- fields + related */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <section className={`${CARD} p-4`}>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Details
            </h2>
            <dl className="divide-y divide-gray-100">
              <FieldRow label={SCHOOL_TYPE_FIELD.label} hint={SCHOOL_TYPE_FIELD.hint}>
                <InlineSelect
                  value={readMeta(organization.metadata, SCHOOL_TYPE_FIELD.key)}
                  options={SCHOOL_TYPE_FIELD.options ?? []}
                  onSave={saveSchoolType}
                  allowEmpty
                  emptyLabel="Not set"
                  placeholder="Not set"
                />
              </FieldRow>
              {ADDRESS_FIELDS.map((field) => (
                <FieldRow key={field.key} label={field.label}>
                  <InlineText
                    value={
                      typeof organization.address?.[field.key] === "string"
                        ? (organization.address[field.key] as string)
                        : ""
                    }
                    onSave={(v) => saveAddressField(field.key, v)}
                    placeholder={field.placeholder}
                  />
                </FieldRow>
              ))}
              <FieldRow
                label={VOCAB.counselor.one}
                hint={`The admissions counselor who covers this ${VOCAB.school.lower}.`}
              >
                <OwnerSelect
                  value={organization.owner}
                  onChange={(owner) => void save({ owner })}
                  size="sm"
                  className="h-8 border-transparent bg-transparent shadow-none hover:bg-gray-50"
                />
              </FieldRow>
              <FieldRow label="Tags" hint="Shared labels; manage them under Tags.">
                <TagPicker
                  tags={organization.tags ?? []}
                  onAttach={(tag_id) => attachTag({ id: organization.id, tag_id }).unwrap()}
                  onDetach={(tag_id) => detachTag({ id: organization.id, tag_id }).unwrap()}
                  compact
                />
              </FieldRow>
              <FieldRow label="Created">
                <span
                  className="text-muted-foreground"
                  title={formatDateTime(organization.created_at)}
                >
                  {formatRelative(organization.created_at)}
                </span>
              </FieldRow>
              <FieldRow label="Updated">
                <span
                  className="text-muted-foreground"
                  title={formatDateTime(organization.updated_at)}
                >
                  {formatRelative(organization.updated_at)}
                </span>
              </FieldRow>
            </dl>
          </section>

          <section className="min-w-0">
            <Tabs defaultValue="people">
              <TabsList variant="line">
                <TabsTrigger value="people">{VOCAB.prospect.many}</TabsTrigger>
                <TabsTrigger value="deals">{VOCAB.application.many}</TabsTrigger>
              </TabsList>

              <TabsContent value="people" className="pt-4">
                {!loadingPeople && peopleRows.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title={`No ${VOCAB.prospect.lowerMany} from here yet`}
                    description={`Add the students you are recruiting from ${organization.name}, and the counselors you work with there.`}
                    action={
                      <Button className="ibl-button-primary" onClick={() => setAddPersonOpen(true)}>
                        <Plus data-icon="inline-start" /> Add {VOCAB.prospect.lower}
                      </Button>
                    }
                  />
                ) : (
                  <div className={`${CARD} overflow-hidden`}>
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2">
                      <span className="text-muted-foreground text-xs font-medium">
                        {prospectCountLabel}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setAddPersonOpen(true)}>
                        <Plus data-icon="inline-start" /> Add {VOCAB.prospect.lower}
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <PeopleTable
                        persons={peopleRows}
                        isLoading={loadingPeople}
                        columns={["job_title", "graduation_year", "owner"]}
                        skeletonRows={4}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="deals" className="pt-4">
                <DealsMiniTable
                  organization={organization.id}
                  emptyDescription={`No ${VOCAB.prospect.lower} from ${organization.name} has started an ${VOCAB.application.lower} yet.`}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>

      <PersonDialog
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        defaultOrganization={organization.id}
        navigateOnCreate={false}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${organization.name}?`}
        description={`The ${VOCAB.school.lower} is removed. Its ${VOCAB.prospect.lowerMany} and ${VOCAB.application.lowerMany} stay — they simply lose their ${VOCAB.school.lower}.`}
        confirmLabel={`Delete ${VOCAB.school.lower}`}
        destructive
        loading={deleting}
        onConfirm={async () => {
          try {
            await deleteOrganization(organization.id).unwrap();
            setConfirmDelete(false);
            toast.success(`${organization.name} deleted`);
            router.push(href("/schools"));
          } catch (err) {
            toastApiError(err, `Could not delete this ${VOCAB.school.lower}`);
          }
        }}
      />
    </div>
  );
}
