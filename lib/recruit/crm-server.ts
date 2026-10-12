/**
 * Server-side CRM client — the same `/dm/api/crm/…` resources the browser
 * slice (`lib/crm/api.ts`) uses, but signed with the organization's Platform
 * API Token. Used where there is no signed-in user: the public landing-page
 * submission route, the Chief of Staff's MCP tools, and the CLI scripts.
 *
 * Relative imports on purpose: vitest resolves no `@/` alias for lib files.
 */
import { platformFetch, PlatformError } from "../iblai/platform";
import type {
  Activity,
  ActivityInput,
  ActivityListParams,
  Deal,
  DealInput,
  DealListParams,
  LeadSource,
  Organization,
  OrganizationInput,
  OrganizationListParams,
  Paginated,
  Person,
  PersonInput,
  PersonListParams,
  Pipeline,
  PipelineStage,
  PipelineStageInput,
  Tag,
} from "../crm/types";

function qs(params?: object): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** A client bound to one organization. */
export class CrmServer {
  constructor(public readonly org: string) {}

  private get<T>(path: string) {
    return platformFetch<T>(`/dm/api/crm${path}`, { org: this.org });
  }
  private send<T>(method: string, path: string, body?: unknown) {
    return platformFetch<T>(`/dm/api/crm${path}`, { org: this.org, method, body });
  }

  /** Walk every page of a list (max `maxPages` × 100 rows). */
  private async all<T>(path: string, params: object = {}, maxPages = 20): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    for (let i = 0; i < maxPages; i++) {
      const data = await this.get<Paginated<T>>(
        `${path}${qs({ ...params, page, page_size: 100 })}`,
      );
      out.push(...data.results);
      if (!data.next_page) break;
      page = data.next_page;
    }
    return out;
  }

  // ---------------------------------------------------------------- persons
  listPersons(params?: PersonListParams) {
    return this.get<Paginated<Person>>(`/persons/${qs(params)}`);
  }
  allPersons(params?: Omit<PersonListParams, "page" | "page_size">, maxPages = 10) {
    return this.all<Person>("/persons/", params ?? {}, maxPages);
  }
  getPerson(id: string) {
    return this.get<Person>(`/persons/${encodeURIComponent(id)}/`);
  }
  createPerson(body: PersonInput) {
    return this.send<Person>("POST", "/persons/", body);
  }
  updatePerson(id: string, body: PersonInput) {
    return this.send<Person>("PATCH", `/persons/${encodeURIComponent(id)}/`, body);
  }
  mergePersons(primary_id: string, duplicate_ids: string[]) {
    return this.send<{ primary_id: string }>("POST", "/persons/merge/", {
      primary_id,
      duplicate_ids,
    });
  }
  /** Find a person by primary email (the API has no email filter — scans recent pages). */
  async findPersonByEmail(email: string, maxPages = 5): Promise<Person | undefined> {
    const needle = email.trim().toLowerCase();
    if (!needle) return undefined;
    let page = 1;
    for (let i = 0; i < maxPages; i++) {
      const data = await this.listPersons({ page, page_size: 100 });
      const hit = data.results.find(
        (p) =>
          p.primary_email?.toLowerCase() === needle ||
          (p.emails ?? []).some((e) => e.toLowerCase() === needle),
      );
      if (hit) return hit;
      if (!data.next_page) break;
      page = data.next_page;
    }
    return undefined;
  }

  // ---------------------------------------------------------- organizations
  listOrganizations(params?: OrganizationListParams) {
    return this.get<Paginated<Organization>>(`/organizations/${qs(params)}`);
  }
  allOrganizations(maxPages = 10) {
    return this.all<Organization>("/organizations/", {}, maxPages);
  }
  createOrganization(body: OrganizationInput) {
    return this.send<Organization>("POST", "/organizations/", body);
  }
  /** Find a school by (case-insensitive) name, or create it. */
  async findOrCreateOrganization(
    name: string,
    extra: OrganizationInput = {},
  ): Promise<Organization> {
    const clean = name.trim();
    const existing = await this.listOrganizations({ name: clean, page_size: 50 });
    const hit = existing.results.find((o) => o.name.trim().toLowerCase() === clean.toLowerCase());
    if (hit) return hit;
    return this.createOrganization({ name: clean, ...extra });
  }

  // -------------------------------------------------------------- pipelines
  listPipelines() {
    return this.all<Pipeline>("/pipelines/", {}, 2);
  }
  createPipeline(body: { name: string; code: string; is_default?: boolean; rotten_days?: number }) {
    return this.send<Pipeline>("POST", "/pipelines/", body);
  }
  createStage(pipelineId: number, body: PipelineStageInput) {
    return this.send<PipelineStage>("POST", `/pipelines/${pipelineId}/stages/`, body);
  }
  updateStage(pipelineId: number, stageId: number, body: PipelineStageInput) {
    return this.send<PipelineStage>("PATCH", `/pipelines/${pipelineId}/stages/${stageId}/`, body);
  }
  /** The pipeline with `code`, else the default, else the first. */
  async resolvePipeline(code?: string): Promise<Pipeline | undefined> {
    const all = await this.listPipelines();
    return (
      (code ? all.find((p) => p.code === code) : undefined) ??
      all.find((p) => p.is_default) ??
      all[0]
    );
  }

  // ----------------------------------------------------------- lead sources
  listLeadSources() {
    return this.all<LeadSource>("/lead-sources/", {}, 2);
  }
  async findOrCreateLeadSource(code: string, name?: string): Promise<LeadSource> {
    const all = await this.listLeadSources();
    const hit = all.find((s) => s.code === code);
    if (hit) return hit;
    return this.send<LeadSource>("POST", "/lead-sources/", {
      code,
      name: name ?? code.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }

  // ------------------------------------------------------------------ deals
  listDeals(params?: DealListParams) {
    return this.get<Paginated<Deal>>(`/deals/${qs(params)}`);
  }
  allDeals(params?: Omit<DealListParams, "page" | "page_size">, maxPages = 20) {
    return this.all<Deal>("/deals/", params ?? {}, maxPages);
  }
  getDeal(id: number) {
    return this.get<Deal>(`/deals/${id}/`);
  }
  createDeal(body: DealInput) {
    return this.send<Deal>("POST", "/deals/", body);
  }
  updateDeal(id: number, body: DealInput) {
    return this.send<Deal>("PATCH", `/deals/${id}/`, body);
  }
  moveDealStage(id: number, stage: { stage_code?: string; stage_id?: number }) {
    return this.send<Deal>("POST", `/deals/${id}/move-stage/`, stage);
  }
  markDealWon(id: number, stage_code?: string) {
    return this.send<Deal>("POST", `/deals/${id}/won/`, stage_code ? { stage_code } : {});
  }
  markDealLost(id: number, lost_reason: string, stage_code?: string) {
    return this.send<Deal>("POST", `/deals/${id}/lost/`, {
      lost_reason,
      ...(stage_code && { stage_code }),
    });
  }

  // ------------------------------------------------------------- activities
  listActivities(params?: ActivityListParams) {
    return this.get<Paginated<Activity>>(`/activities/${qs(params)}`);
  }
  allActivities(params?: Omit<ActivityListParams, "page" | "page_size">, maxPages = 5) {
    return this.all<Activity>("/activities/", params ?? {}, maxPages);
  }
  createActivity(body: ActivityInput) {
    return this.send<Activity>("POST", "/activities/", body);
  }
  markActivityDone(id: number) {
    return this.send<Activity>("POST", `/activities/${id}/done/`, {});
  }

  // ------------------------------------------------------------------- tags
  listTags() {
    return this.all<Tag>("/tags/", {}, 2);
  }
  async findOrCreateTag(name: string, color = "#0058cc"): Promise<Tag> {
    const all = await this.listTags();
    const hit = all.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (hit) return hit;
    return this.send<Tag>("POST", "/tags/", { name: name.trim(), color });
  }
  /** Attach a tag; an existing assignment (409) is success. */
  async attachTag(host: "persons" | "organizations" | "deals", id: string | number, tagId: number) {
    try {
      await this.send("POST", `/${host}/${id}/tags/`, { tag_id: tagId });
    } catch (e) {
      if (!(e instanceof PlatformError && e.status === 409)) throw e;
    }
  }

  // ------------------------------------------------------------------- team
  /** The organization's members (for counselor assignment). */
  async listMembers(
    query?: string,
  ): Promise<
    { id: number; username: string; name?: string; email?: string; is_admin?: boolean }[]
  > {
    const q = new URLSearchParams({
      platform_key: this.org,
      platform_org: this.org,
      page: "1",
      page_size: "200",
      ...(query ? { query } : {}),
    });
    const data = await platformFetch<{ results?: unknown }>(
      `/dm/api/core/platform/users/?${q.toString()}`,
      { org: this.org },
    );
    const results = data?.results;
    const rows: Array<Record<string, unknown>> = Array.isArray(results)
      ? (results as Array<Record<string, unknown>>)
      : Array.isArray((results as { data?: unknown[] } | undefined)?.data)
        ? (results as { data: Array<Record<string, unknown>> }).data
        : [];
    return rows
      .map((r) => ({
        id: Number(r.user_id ?? r.id),
        username: String(r.username ?? ""),
        name: typeof r.name === "string" && r.name ? r.name : undefined,
        email: typeof r.email === "string" ? r.email : undefined,
        is_admin: typeof r.is_admin === "boolean" ? r.is_admin : undefined,
      }))
      .filter((m) => Number.isFinite(m.id));
  }
}
