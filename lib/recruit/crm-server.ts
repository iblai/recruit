/**
 * Server-side CRM client — the same `/dm/api/crm/…` resources the browser
 * slice (`lib/crm/api.ts`) uses, acting with the credential it is given
 * (`Api-Token …` or `Token …`). Used where there is no browser: the Chief of
 * Staff's MCP tools and the CLI scripts.
 *
 * Relative imports on purpose: vitest resolves no `@/` alias for lib files.
 */
import { platformFetch, PlatformError } from "../iblai/platform";
import type {
  Activity,
  ActivityInput,
  ActivityListParams,
  CrmMember,
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
  WebForm,
  WebFormInput,
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
  constructor(
    public readonly org: string,
    private readonly authorization: string,
  ) {}

  private get<T>(path: string) {
    return platformFetch<T>(`/dm/api/crm${path}`, this.authorization);
  }
  private send<T>(method: string, path: string, body?: unknown) {
    return platformFetch<T>(`/dm/api/crm${path}`, this.authorization, { method, body });
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
  /** The person with this primary email, ignoring case. */
  async findPersonByEmail(email: string): Promise<Person | undefined> {
    const needle = email.trim().toLowerCase();
    if (!needle) return undefined;
    const data = await this.listPersons({ primary_email: needle, page_size: 5 });
    // A platform without the filter ignores it and returns its first rows.
    return data.results.find((p) => p.primary_email?.toLowerCase() === needle);
  }
  /** RFC 7386 merge into a record's metadata: `null` removes a key. */
  patchMetadata<T = Person>(
    host: "persons" | "organizations" | "deals",
    id: string | number,
    patch: Record<string, unknown>,
  ) {
    return this.send<T>("PATCH", `/${host}/${encodeURIComponent(String(id))}/metadata/`, patch);
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
    const existing = await this.listOrganizations({ name__iexact: clean, page_size: 5 });
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
    const first = async (params: object, ok: (p: Pipeline) => boolean = () => true) =>
      (
        await this.get<Paginated<Pipeline>>(`/pipelines/${qs({ ...params, page_size: 5 })}`)
      ).results.find(ok);
    return (
      (code ? await first({ code }, (p) => p.code === code) : undefined) ??
      (await first({ is_default: true }, (p) => !!p.is_default)) ??
      (await first({}))
    );
  }

  // ----------------------------------------------------------- lead sources
  listLeadSources() {
    return this.all<LeadSource>("/lead-sources/", {}, 2);
  }
  async findOrCreateLeadSource(code: string, name?: string): Promise<LeadSource> {
    const found = await this.get<Paginated<LeadSource>>(
      `/lead-sources/${qs({ code, page_size: 5 })}`,
    );
    const hit = found.results.find((s) => s.code === code);
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
    const clean = name.trim();
    const found = await this.get<Paginated<Tag>>(
      `/tags/${qs({ name__iexact: clean, page_size: 5 })}`,
    );
    const hit = found.results.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (hit) return hit;
    return this.send<Tag>("POST", "/tags/", { name: clean, color });
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
  /** The organization's members (for counselor assignment); emails only when the key may see them. */
  listMembers(query?: string) {
    return this.all<CrmMember>("/members/", query ? { query } : {}, 5);
  }

  // -------------------------------------------------------------- web forms
  listWebForms() {
    return this.all<WebForm>("/web-forms/", {}, 2);
  }
  createWebForm(body: WebFormInput) {
    return this.send<WebForm>("POST", "/web-forms/", body);
  }
  async countWebFormSubmissions(slug: string): Promise<number> {
    const data = await this.get<Paginated<unknown>>(
      `/web-forms/${encodeURIComponent(slug)}/submissions/?page_size=1`,
    );
    return data.count;
  }
}
