/**
 * RTK Query slice for the ibl.ai CRM API (`/dm/api/crm/…`).
 *
 * Every request carries the signed-in user's DM session token
 * (`Authorization: Token <dm_token>`), exactly like the OS talks to the Data
 * Manager. The Platform (organization) is inferred from the token — there is
 * no `?platform_key=` — so switching organizations re-authenticates and this
 * slice's cache is reset by the org-scoped `tenantKey` we thread through
 * `providesTags`/`invalidatesTags` and by a full `resetApiState` on switch.
 */
import { createApi, fetchBaseQuery, type FetchArgs } from "@reduxjs/toolkit/query/react";
import config from "@/lib/iblai/config";
import { LOCAL_STORAGE_KEYS } from "@/lib/iblai/auth-utils";
import type {
  Activity,
  ActivityInput,
  ActivityListParams,
  CrmApiError,
  Deal,
  DealInput,
  DealListParams,
  LeadSource,
  LeadSourceInput,
  LeadSourceListParams,
  Organization,
  OrganizationInput,
  OrganizationListParams,
  Paginated,
  Person,
  PersonInput,
  PersonInviteRequest,
  PersonInviteResponse,
  PersonListParams,
  PersonMergeRequest,
  PersonMergeResponse,
  Pipeline,
  PipelineInput,
  PipelineListParams,
  PipelineStage,
  PipelineStageInput,
  Tag,
  TagAttachResponse,
  TagInput,
  TagListParams,
} from "./types";

export const CRM_TAG_TYPES = [
  "Person",
  "Organization",
  "Pipeline",
  "LeadSource",
  "Deal",
  "Activity",
  "Tag",
] as const;

type TagType = (typeof CRM_TAG_TYPES)[number];

const LIST = "LIST";

function listTags<T extends { id: string | number }>(type: TagType, results?: T[]) {
  return [{ type, id: LIST }, ...(results ?? []).map((r) => ({ type, id: r.id }))];
}

/** Strip undefined / empty params so the URL only carries real filters. */
function cleanParams<T extends object>(params?: T) {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v as string | number | boolean;
  }
  return out;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${config.dmUrl()}/api/crm`,
  prepareHeaders: (headers) => {
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LOCAL_STORAGE_KEYS.DM_TOKEN)
        : null;
    if (token) headers.set("Authorization", `Token ${token}`);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return headers;
  },
});

/** Normalize errors to `{ status, detail }` so the UI can toast them. */
const baseQuery: typeof rawBaseQuery = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  if (result.error) {
    const data = result.error.data as unknown;
    let detail = "Something went wrong";
    if (typeof data === "string" && data.trim()) detail = data;
    else if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (typeof d.detail === "string") detail = d.detail;
      else if (typeof d.message === "string") detail = d.message;
      else if (typeof d.error === "string") detail = d.error;
      else {
        // DRF field errors: { field: ["msg"] }
        const first = Object.entries(d)[0];
        if (first) {
          const [field, msgs] = first;
          const msg = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
          detail = `${field}: ${msg}`;
        }
      }
    } else if (result.error.status === "FETCH_ERROR") {
      detail = "Network error — check your connection.";
    }
    const status = result.error.status;
    if (status === 401 && typeof window !== "undefined") {
      // Session expired: the SDK's 401 handler signs the user in again.
      import("@/lib/iblai/auth-utils").then(({ redirectToAuthSpa }) =>
        redirectToAuthSpa(undefined, undefined, true),
      );
    }
    const normalized: CrmApiError = { status, detail, data };
    return { error: normalized as unknown as typeof result.error };
  }
  return result;
};

export const crmApi = createApi({
  reducerPath: "crmApi",
  baseQuery,
  tagTypes: CRM_TAG_TYPES,
  keepUnusedDataFor: 60,
  endpoints: (builder) => ({
    // ------------------------------------------------------------- Persons
    listPersons: builder.query<Paginated<Person>, PersonListParams | void>({
      query: (params) => ({ url: "/persons/", params: cleanParams(params ?? undefined) }),
      providesTags: (res) => listTags("Person", res?.results),
    }),
    getPerson: builder.query<Person, string>({
      query: (id) => `/persons/${id}/`,
      providesTags: (_r, _e, id) => [{ type: "Person", id }],
    }),
    createPerson: builder.mutation<Person, PersonInput>({
      query: (body) => ({ url: "/persons/", method: "POST", body }),
      invalidatesTags: [{ type: "Person", id: LIST }],
    }),
    updatePerson: builder.mutation<Person, { id: string; body: PersonInput }>({
      query: ({ id, body }) => ({ url: `/persons/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Person", id },
        { type: "Person", id: LIST },
      ],
    }),
    deletePerson: builder.mutation<void, string>({
      query: (id) => ({ url: `/persons/${id}/`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Person", id: LIST },
        { type: "Deal", id: LIST },
      ],
    }),
    invitePerson: builder.mutation<
      PersonInviteResponse,
      { id: string; body?: PersonInviteRequest }
    >({
      query: ({ id, body }) => ({
        url: `/persons/${id}/invite/`,
        method: "POST",
        body: body ?? {},
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Person", id }],
    }),
    linkPersonUser: builder.mutation<Person, { id: string; user_id: number }>({
      query: ({ id, user_id }) => ({
        url: `/persons/${id}/link-user/`,
        method: "POST",
        body: { user_id },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Person", id },
        { type: "Person", id: LIST },
      ],
    }),
    mergePersons: builder.mutation<PersonMergeResponse, PersonMergeRequest>({
      query: (body) => ({ url: "/persons/merge/", method: "POST", body }),
      invalidatesTags: [
        { type: "Person", id: LIST },
        { type: "Deal", id: LIST },
        { type: "Activity", id: LIST },
      ],
    }),
    attachPersonTag: builder.mutation<TagAttachResponse, { id: string; tag_id: number }>({
      query: ({ id, tag_id }) => ({
        url: `/persons/${id}/tags/`,
        method: "POST",
        body: { tag_id },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Person", id },
        { type: "Person", id: LIST },
      ],
    }),
    detachPersonTag: builder.mutation<void, { id: string; tag_id: number }>({
      query: ({ id, tag_id }) => ({ url: `/persons/${id}/tags/${tag_id}/`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Person", id },
        { type: "Person", id: LIST },
      ],
    }),

    // ------------------------------------------------------- Organizations
    listOrganizations: builder.query<Paginated<Organization>, OrganizationListParams | void>({
      query: (params) => ({ url: "/organizations/", params: cleanParams(params ?? undefined) }),
      providesTags: (res) => listTags("Organization", res?.results),
    }),
    getOrganization: builder.query<Organization, string>({
      query: (id) => `/organizations/${id}/`,
      providesTags: (_r, _e, id) => [{ type: "Organization", id }],
    }),
    createOrganization: builder.mutation<Organization, OrganizationInput>({
      query: (body) => ({ url: "/organizations/", method: "POST", body }),
      invalidatesTags: [{ type: "Organization", id: LIST }],
    }),
    updateOrganization: builder.mutation<Organization, { id: string; body: OrganizationInput }>({
      query: ({ id, body }) => ({ url: `/organizations/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Organization", id },
        { type: "Organization", id: LIST },
      ],
    }),
    deleteOrganization: builder.mutation<void, string>({
      query: (id) => ({ url: `/organizations/${id}/`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Organization", id: LIST },
        { type: "Person", id: LIST },
        { type: "Deal", id: LIST },
      ],
    }),
    attachOrganizationTag: builder.mutation<TagAttachResponse, { id: string; tag_id: number }>({
      query: ({ id, tag_id }) => ({
        url: `/organizations/${id}/tags/`,
        method: "POST",
        body: { tag_id },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Organization", id },
        { type: "Organization", id: LIST },
      ],
    }),
    detachOrganizationTag: builder.mutation<void, { id: string; tag_id: number }>({
      query: ({ id, tag_id }) => ({
        url: `/organizations/${id}/tags/${tag_id}/`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Organization", id },
        { type: "Organization", id: LIST },
      ],
    }),

    // ----------------------------------------------------------- Pipelines
    listPipelines: builder.query<Paginated<Pipeline>, PipelineListParams | void>({
      query: (params) => ({ url: "/pipelines/", params: cleanParams(params ?? undefined) }),
      providesTags: (res) => listTags("Pipeline", res?.results),
    }),
    getPipeline: builder.query<Pipeline, number>({
      query: (id) => `/pipelines/${id}/`,
      providesTags: (_r, _e, id) => [{ type: "Pipeline", id }],
    }),
    createPipeline: builder.mutation<Pipeline, PipelineInput>({
      query: (body) => ({ url: "/pipelines/", method: "POST", body }),
      invalidatesTags: [{ type: "Pipeline", id: LIST }],
    }),
    updatePipeline: builder.mutation<Pipeline, { id: number; body: PipelineInput }>({
      query: ({ id, body }) => ({ url: `/pipelines/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Pipeline", id },
        { type: "Pipeline", id: LIST },
      ],
    }),
    deletePipeline: builder.mutation<void, number>({
      query: (id) => ({ url: `/pipelines/${id}/`, method: "DELETE" }),
      invalidatesTags: [{ type: "Pipeline", id: LIST }],
    }),
    listStages: builder.query<Paginated<PipelineStage>, { pipeline: number; page_size?: number }>({
      query: ({ pipeline, ...params }) => ({
        url: `/pipelines/${pipeline}/stages/`,
        params: cleanParams({ page_size: 100, ...params }),
      }),
      providesTags: (_r, _e, { pipeline }) => [{ type: "Pipeline", id: pipeline }],
    }),
    createStage: builder.mutation<PipelineStage, { pipeline: number; body: PipelineStageInput }>({
      query: ({ pipeline, body }) => ({
        url: `/pipelines/${pipeline}/stages/`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { pipeline }) => [
        { type: "Pipeline", id: pipeline },
        { type: "Pipeline", id: LIST },
      ],
    }),
    updateStage: builder.mutation<
      PipelineStage,
      { pipeline: number; id: number; body: PipelineStageInput }
    >({
      query: ({ pipeline, id, body }) => ({
        url: `/pipelines/${pipeline}/stages/${id}/`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, { pipeline }) => [
        { type: "Pipeline", id: pipeline },
        { type: "Pipeline", id: LIST },
      ],
    }),
    deleteStage: builder.mutation<void, { pipeline: number; id: number }>({
      query: ({ pipeline, id }) => ({
        url: `/pipelines/${pipeline}/stages/${id}/`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { pipeline }) => [
        { type: "Pipeline", id: pipeline },
        { type: "Pipeline", id: LIST },
      ],
    }),

    // -------------------------------------------------------- Lead sources
    listLeadSources: builder.query<Paginated<LeadSource>, LeadSourceListParams | void>({
      query: (params) => ({
        url: "/lead-sources/",
        params: cleanParams({ page_size: 100, ...(params ?? {}) }),
      }),
      providesTags: (res) => listTags("LeadSource", res?.results),
    }),
    createLeadSource: builder.mutation<LeadSource, LeadSourceInput>({
      query: (body) => ({ url: "/lead-sources/", method: "POST", body }),
      invalidatesTags: [{ type: "LeadSource", id: LIST }],
    }),
    updateLeadSource: builder.mutation<LeadSource, { id: number; body: LeadSourceInput }>({
      query: ({ id, body }) => ({ url: `/lead-sources/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "LeadSource", id },
        { type: "LeadSource", id: LIST },
      ],
    }),
    deleteLeadSource: builder.mutation<void, number>({
      query: (id) => ({ url: `/lead-sources/${id}/`, method: "DELETE" }),
      invalidatesTags: [{ type: "LeadSource", id: LIST }],
    }),

    // --------------------------------------------------------------- Deals
    listDeals: builder.query<Paginated<Deal>, DealListParams | void>({
      query: (params) => ({ url: "/deals/", params: cleanParams(params ?? undefined) }),
      providesTags: (res) => listTags("Deal", res?.results),
    }),
    /** Every deal matching the filters — walks the pages (kanban, dashboard). */
    listAllDeals: builder.query<Deal[], Omit<DealListParams, "page" | "page_size"> | void>({
      async queryFn(params, _api, _extra, fetchWithBQ) {
        const all: Deal[] = [];
        let page = 1;
        for (let i = 0; i < 50; i++) {
          const res = await fetchWithBQ({
            url: "/deals/",
            params: cleanParams({ ...(params ?? {}), page, page_size: 100 }),
          } as FetchArgs);
          if (res.error) return { error: res.error };
          const data = res.data as Paginated<Deal>;
          all.push(...data.results);
          if (!data.next_page) break;
          page = data.next_page;
        }
        return { data: all };
      },
      providesTags: (res) => listTags("Deal", res),
    }),
    getDeal: builder.query<Deal, number>({
      query: (id) => `/deals/${id}/`,
      providesTags: (_r, _e, id) => [{ type: "Deal", id }],
    }),
    createDeal: builder.mutation<Deal, DealInput>({
      query: (body) => ({ url: "/deals/", method: "POST", body }),
      invalidatesTags: [
        { type: "Deal", id: LIST },
        { type: "Activity", id: LIST },
      ],
    }),
    updateDeal: builder.mutation<Deal, { id: number; body: DealInput }>({
      query: ({ id, body }) => ({ url: `/deals/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Deal", id },
        { type: "Deal", id: LIST },
      ],
    }),
    deleteDeal: builder.mutation<void, number>({
      query: (id) => ({ url: `/deals/${id}/`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Deal", id: LIST },
        { type: "Activity", id: LIST },
      ],
    }),
    moveDealStage: builder.mutation<Deal, { id: number; stage_id?: number; stage_code?: string }>({
      query: ({ id, ...body }) => ({ url: `/deals/${id}/move-stage/`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Deal", id },
        { type: "Deal", id: LIST },
        { type: "Activity", id: LIST },
      ],
    }),
    markDealWon: builder.mutation<Deal, { id: number; stage_code?: string }>({
      query: ({ id, ...body }) => ({ url: `/deals/${id}/won/`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Deal", id },
        { type: "Deal", id: LIST },
        { type: "Activity", id: LIST },
      ],
    }),
    markDealLost: builder.mutation<Deal, { id: number; lost_reason: string; stage_code?: string }>({
      query: ({ id, ...body }) => ({ url: `/deals/${id}/lost/`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Deal", id },
        { type: "Deal", id: LIST },
        { type: "Activity", id: LIST },
      ],
    }),
    attachDealTag: builder.mutation<TagAttachResponse, { id: number; tag_id: number }>({
      query: ({ id, tag_id }) => ({ url: `/deals/${id}/tags/`, method: "POST", body: { tag_id } }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Deal", id },
        { type: "Deal", id: LIST },
      ],
    }),
    detachDealTag: builder.mutation<void, { id: number; tag_id: number }>({
      query: ({ id, tag_id }) => ({ url: `/deals/${id}/tags/${tag_id}/`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Deal", id },
        { type: "Deal", id: LIST },
      ],
    }),

    // ---------------------------------------------------------- Activities
    listActivities: builder.query<Paginated<Activity>, ActivityListParams | void>({
      query: (params) => ({ url: "/activities/", params: cleanParams(params ?? undefined) }),
      providesTags: (res) => listTags("Activity", res?.results),
    }),
    getActivity: builder.query<Activity, number>({
      query: (id) => `/activities/${id}/`,
      providesTags: (_r, _e, id) => [{ type: "Activity", id }],
    }),
    createActivity: builder.mutation<Activity, ActivityInput>({
      query: (body) => ({ url: "/activities/", method: "POST", body }),
      invalidatesTags: [{ type: "Activity", id: LIST }],
    }),
    updateActivity: builder.mutation<Activity, { id: number; body: ActivityInput }>({
      query: ({ id, body }) => ({ url: `/activities/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Activity", id },
        { type: "Activity", id: LIST },
      ],
    }),
    deleteActivity: builder.mutation<void, number>({
      query: (id) => ({ url: `/activities/${id}/`, method: "DELETE" }),
      invalidatesTags: [{ type: "Activity", id: LIST }],
    }),
    markActivityDone: builder.mutation<Activity, number>({
      query: (id) => ({ url: `/activities/${id}/done/`, method: "POST", body: {} }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Activity", id },
        { type: "Activity", id: LIST },
      ],
    }),

    // ---------------------------------------------------------------- Tags
    listTags: builder.query<Paginated<Tag>, TagListParams | void>({
      query: (params) => ({
        url: "/tags/",
        params: cleanParams({ page_size: 100, ...(params ?? {}) }),
      }),
      providesTags: (res) => listTags("Tag", res?.results),
    }),
    createTag: builder.mutation<Tag, TagInput>({
      query: (body) => ({ url: "/tags/", method: "POST", body }),
      invalidatesTags: [{ type: "Tag", id: LIST }],
    }),
    updateTag: builder.mutation<Tag, { id: number; body: TagInput }>({
      query: ({ id, body }) => ({ url: `/tags/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Tag", id },
        { type: "Tag", id: LIST },
        { type: "Person", id: LIST },
        { type: "Organization", id: LIST },
        { type: "Deal", id: LIST },
      ],
    }),
    deleteTag: builder.mutation<void, number>({
      query: (id) => ({ url: `/tags/${id}/`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Tag", id: LIST },
        { type: "Person", id: LIST },
        { type: "Organization", id: LIST },
        { type: "Deal", id: LIST },
      ],
    }),
  }),
});

export const {
  useListPersonsQuery,
  useLazyListPersonsQuery,
  useGetPersonQuery,
  useCreatePersonMutation,
  useUpdatePersonMutation,
  useDeletePersonMutation,
  useInvitePersonMutation,
  useLinkPersonUserMutation,
  useMergePersonsMutation,
  useAttachPersonTagMutation,
  useDetachPersonTagMutation,
  useListOrganizationsQuery,
  useLazyListOrganizationsQuery,
  useGetOrganizationQuery,
  useCreateOrganizationMutation,
  useUpdateOrganizationMutation,
  useDeleteOrganizationMutation,
  useAttachOrganizationTagMutation,
  useDetachOrganizationTagMutation,
  useListPipelinesQuery,
  useGetPipelineQuery,
  useCreatePipelineMutation,
  useUpdatePipelineMutation,
  useDeletePipelineMutation,
  useListStagesQuery,
  useCreateStageMutation,
  useUpdateStageMutation,
  useDeleteStageMutation,
  useListLeadSourcesQuery,
  useCreateLeadSourceMutation,
  useUpdateLeadSourceMutation,
  useDeleteLeadSourceMutation,
  useListDealsQuery,
  useLazyListDealsQuery,
  useListAllDealsQuery,
  useGetDealQuery,
  useCreateDealMutation,
  useUpdateDealMutation,
  useDeleteDealMutation,
  useMoveDealStageMutation,
  useMarkDealWonMutation,
  useMarkDealLostMutation,
  useAttachDealTagMutation,
  useDetachDealTagMutation,
  useListActivitiesQuery,
  useGetActivityQuery,
  useCreateActivityMutation,
  useUpdateActivityMutation,
  useDeleteActivityMutation,
  useMarkActivityDoneMutation,
  useListTagsQuery,
  useCreateTagMutation,
  useUpdateTagMutation,
  useDeleteTagMutation,
} = crmApi;

/** Read the normalized error message off an RTK Query error. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as Partial<CrmApiError> & { error?: string; message?: string };
  if (typeof e.detail === "string") return e.detail;
  if (typeof e.error === "string") return e.error;
  if (typeof e.message === "string") return e.message;
  return fallback;
}

export function errorStatus(err: unknown): number | string | undefined {
  if (!err || typeof err !== "object") return undefined;
  return (err as Partial<CrmApiError>).status;
}
