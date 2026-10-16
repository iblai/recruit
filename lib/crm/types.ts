/**
 * ibl.ai CRM resource types — mirrors the Platform-scoped REST API at
 * `/dm/api/crm/` (see the `iblai-api-crm` skill and `@iblai/iblai-api`
 * `CrmService`). Person and Organization ids are UUID strings; everything
 * else is an integer.
 */

import { ACTIVITY_LABELS, LIFECYCLE_LABELS, STATUS_LABELS } from "@/lib/recruit/vocabulary";

export type LifecycleStage = "lead" | "qualified" | "opportunity" | "customer" | "churned";
export type DealStatus = "open" | "won" | "lost";
export type ActivityType = "call" | "meeting" | "email" | "note" | "task" | "lunch" | "deadline";

/**
 * Option lists for pickers. The values are the CRM API's enum names; the
 * labels come from the recruitment vocabulary so the whole UI speaks
 * admissions (Inquiry, Visit, Enrolled…) while the wire format stays sales.
 */
export const LIFECYCLE_STAGES: { value: LifecycleStage; label: string }[] = (
  ["lead", "qualified", "opportunity", "customer", "churned"] as LifecycleStage[]
).map((value) => ({ value, label: LIFECYCLE_LABELS[value] }));

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = (
  ["call", "meeting", "email", "note", "task", "lunch", "deadline"] as ActivityType[]
).map((value) => ({ value, label: ACTIVITY_LABELS[value] }));

export const DEAL_STATUSES: { value: DealStatus; label: string }[] = (
  ["open", "won", "lost"] as DealStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

export interface TagChip {
  id: number;
  name: string;
  color: string;
}

export interface Paginated<T> {
  count: number;
  next_page: number | null;
  previous_page: number | null;
  results: T[];
}

export interface Person {
  id: string;
  platform: number;
  name: string;
  primary_email?: string;
  emails?: string[];
  contact_numbers?: string[];
  job_title?: string;
  organization?: string | null;
  /** The organization's name (read-only). */
  organization_name?: string | null;
  owner?: number | null;
  platform_user: number | null;
  lifecycle_stage?: LifecycleStage;
  unique_id?: string;
  active: boolean;
  tags: TagChip[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PersonInput = Partial<
  Pick<
    Person,
    | "name"
    | "primary_email"
    | "emails"
    | "contact_numbers"
    | "job_title"
    | "organization"
    | "owner"
    | "lifecycle_stage"
    | "unique_id"
    | "metadata"
  >
>;

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  [k: string]: unknown;
}

export interface Organization {
  id: string;
  platform: number;
  name: string;
  address?: Address;
  owner?: number | null;
  tags: TagChip[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type OrganizationInput = Partial<
  Pick<Organization, "name" | "address" | "owner" | "metadata">
>;

export interface PipelineStage {
  id: number;
  pipeline: number;
  code: string;
  name: string;
  probability?: number;
  sort_order?: number;
  is_won?: boolean;
  is_lost?: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PipelineStageInput = Partial<
  Pick<
    PipelineStage,
    "code" | "name" | "probability" | "sort_order" | "is_won" | "is_lost" | "metadata"
  >
>;

export interface Pipeline {
  id: number;
  platform: number;
  name: string;
  code: string;
  is_default?: boolean;
  rotten_days?: number;
  stages: PipelineStage[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PipelineInput = Partial<
  Pick<Pipeline, "name" | "code" | "is_default" | "rotten_days" | "metadata">
>;

export interface LeadSource {
  id: number;
  platform: number;
  name: string;
  code: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type LeadSourceInput = Partial<Pick<LeadSource, "name" | "code" | "metadata">>;

export interface Deal {
  id: number;
  platform: number;
  title: string;
  description?: string;
  /** Decimal string, e.g. "1500.00". */
  lead_value?: string;
  currency?: string;
  status: DealStatus;
  lost_reason?: string;
  expected_close_date?: string | null;
  closed_at: string | null;
  person: string;
  /** The person's name (read-only). */
  person_name?: string;
  organization?: string | null;
  /** The organization's name (read-only). */
  organization_name?: string | null;
  pipeline: number;
  stage: number;
  source?: number | null;
  owner?: number | null;
  tags: TagChip[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type DealInput = Partial<
  Pick<
    Deal,
    | "title"
    | "description"
    | "lead_value"
    | "currency"
    | "lost_reason"
    | "expected_close_date"
    | "person"
    | "organization"
    | "pipeline"
    | "stage"
    | "source"
    | "owner"
    | "metadata"
  >
>;

export interface Activity {
  id: number;
  platform: number;
  title: string;
  type: ActivityType;
  location?: string;
  comment?: string;
  schedule_from?: string | null;
  schedule_to?: string | null;
  is_done?: boolean;
  done_at: string | null;
  deal?: number | null;
  person?: string | null;
  owner?: number | null;
  reminder_at?: string | null;
  reminder_sent: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ActivityInput = Partial<
  Pick<
    Activity,
    | "title"
    | "type"
    | "location"
    | "comment"
    | "schedule_from"
    | "schedule_to"
    | "is_done"
    | "deal"
    | "person"
    | "owner"
    | "reminder_at"
    | "metadata"
  >
>;

export interface Tag {
  id: number;
  platform: number;
  name: string;
  color?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type TagInput = Partial<Pick<Tag, "name" | "color" | "metadata">>;

export interface PersonInviteRequest {
  is_admin?: boolean;
  is_staff?: boolean;
  enrollment_config?: Record<string, unknown>;
  redirect_to?: string;
}

export interface PersonInviteResponse {
  person_id: string;
  invitation_id: number;
  invitation_email: string;
  platform_key: string;
  auto_accept: boolean;
  active: boolean;
  redirect_to: string | null;
  created: string | null;
}

export interface PersonMergeRequest {
  primary_id: string;
  duplicate_ids: string[];
}

export interface PersonMergeResponse {
  primary_id: string;
  merged_ids?: string[];
  [k: string]: unknown;
}

export interface TagAttachResponse {
  assignment_id: number;
  tag: TagChip;
}

/** Common list-filter query params. */
export interface ListParams {
  page?: number;
  page_size?: number;
  /** A field name, `-` first for descending (`-created_at`). */
  ordering?: string;
}

export interface PersonListParams extends ListParams {
  /** Exact email, ignoring case. */
  primary_email?: string;
  /** Name, email, job title or unique id contains every word. */
  search?: string;
  lifecycle_stage?: LifecycleStage;
  owner?: number;
  organization?: string;
  tags?: string;
  created_at__gte?: string;
  created_at__lte?: string;
  metadata__has_key?: string;
}

export interface OrganizationListParams extends ListParams {
  name?: string;
  /** Exact name, ignoring case. */
  name__iexact?: string;
  owner?: number;
  tags?: string;
}

export interface DealListParams extends ListParams {
  status?: DealStatus;
  pipeline?: number;
  stage?: number;
  owner?: number;
  source?: number;
  person?: string;
  organization?: string;
  tags?: string;
  expected_close_date__gte?: string;
  expected_close_date__lte?: string;
  created_at__gte?: string;
  created_at__lte?: string;
  metadata__has_key?: string;
}

export interface ActivityListParams extends ListParams {
  type?: ActivityType;
  is_done?: boolean;
  owner?: number;
  deal?: number;
  person?: string;
  schedule_from__gte?: string;
  schedule_from__lte?: string;
  metadata__has_key?: string;
}

export interface TagListParams extends ListParams {
  name?: string;
  /** Exact name, ignoring case. */
  name__iexact?: string;
  created_at__gte?: string;
  created_at__lte?: string;
}

export interface PipelineListParams extends ListParams {
  code?: string;
  name?: string;
  is_default?: boolean;
}

export interface LeadSourceListParams extends ListParams {
  code?: string;
  name?: string;
}

/** Shape of an API error as normalized by the CRM slice. */
export interface CrmApiError {
  status: number | string;
  detail: string;
  data?: unknown;
}

/** A platform member, as `/members/` lists them (for owner pickers). */
export interface PlatformMember {
  id: number;
  username: string;
  /** Null unless the caller may list the platform's users. */
  email?: string | null;
  name?: string;
  is_admin?: boolean;
}

/** `/members/` row: `id` is the user id `owner` takes. */
export interface CrmMember {
  id: number;
  username: string | null;
  name: string;
  email: string | null;
  is_admin: boolean;
}

export type WebFormFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "select"
  | "textarea"
  | "checkbox";

/** One question of a web form. `maps_to` names where its answer is written. */
export interface WebFormField {
  key: string;
  label: string;
  type: WebFormFieldType;
  required: boolean;
  placeholder: string;
  help: string;
  options: string[];
  maps_to: string[];
}

/** Where a submission lands; stored with every key present. */
export interface WebFormRouting {
  create_deal: boolean;
  pipeline_code: string;
  stage_code: string;
  lead_source_code: string;
  tags: string[];
  owner: number | null;
  lifecycle_stage: LifecycleStage;
  deal_title: string;
  deal_metadata: Record<string, string>;
}

export interface WebForm {
  id: number;
  platform: number;
  slug: string;
  name: string;
  is_published: boolean;
  fields: WebFormField[];
  routing: WebFormRouting;
  /** The app's page copy, served on the public read. */
  metadata: Record<string, unknown>;
  success_title: string;
  success_message: string;
  created_at: string;
  updated_at: string;
}

export type WebFormInput = Partial<
  Pick<
    WebForm,
    | "slug"
    | "name"
    | "is_published"
    | "fields"
    | "routing"
    | "metadata"
    | "success_title"
    | "success_message"
  >
>;

/** A published form as `GET /orgs/<org>/web-forms/<slug>/` serves it: no routing, no targets. */
export interface PublicWebForm {
  slug: string;
  name: string;
  metadata: Record<string, unknown>;
  fields: Omit<WebFormField, "maps_to">[];
  success_title: string;
  success_message: string;
}

export interface WebFormSubmission {
  id: string;
  person: string | null;
  deal: number | null;
  answers: Record<string, unknown>;
  utm: Record<string, string>;
  page_url: string;
  created_at: string;
}

/** `GET /search/?q=`: one bucket per resource the caller may list. */
export interface CrmSearch {
  q: string;
  persons?: Pick<
    Person,
    "id" | "name" | "primary_email" | "job_title" | "organization" | "lifecycle_stage"
  >[];
  organizations?: Pick<Organization, "id" | "name">[];
  deals?: Pick<
    Deal,
    | "id"
    | "title"
    | "status"
    | "lead_value"
    | "currency"
    | "person"
    | "organization"
    | "pipeline"
    | "stage"
  >[];
}

export interface CrmOverviewStage {
  stage: PipelineStage;
  count: number;
  /** Decimal strings. */
  total_value: string;
  weighted_value: string;
}

export interface CrmOverviewMonth {
  /** `YYYY-MM`, UTC. */
  month: string;
  won_count: number;
  won_value: string;
  lost_count: number;
  lost_value: string;
}

/** `GET /overview/`: the sections the caller may list. Money is decimal strings. */
export interface CrmOverview {
  persons?: { count: number };
  organizations?: { count: number };
  deals?: {
    pipeline: Pipeline | null;
    currency: string | null;
    open_count: number;
    pipeline_value: string;
    weighted_value: string;
    won_this_month_count: number;
    won_this_month_value: string;
    lost_this_month_count: number;
    lost_this_month_value: string;
    by_stage: CrmOverviewStage[];
    won_lost_by_month: CrmOverviewMonth[];
  };
  activities?: { open_count: number; due_today: number; overdue: number };
}
