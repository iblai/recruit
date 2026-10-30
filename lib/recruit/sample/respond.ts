/**
 * The sample's answers to recruit's CRM reads (`lib/crm/api.ts` routes here on
 * the community organization): the request in, the response body out — or
 * `NOT_FOUND` for an unknown record or route, or `undefined` for anything that
 * is not a read, which the seam turns into the upgrade dialog. Filters, search,
 * ordering and paging follow the platform's list parameters.
 */
import { CRM_APP } from "../../crm/app";
import type { Deal, Paginated, PipelineStage } from "../../crm/types";
import { buildSample, type Sample, type SampleVisitor } from "./data";

export const NOT_FOUND = Symbol("sample-not-found");

type Params = Record<string, unknown> | undefined;
type Row = Record<string, unknown>;

let cached: { key: string; sample: Sample } | null = null;

/** The day's sample for the visitor, built once per day. */
export function sampleOf(now: Date, visitor: SampleVisitor): Sample {
  const key = `${now.toISOString().slice(0, 10)}|${visitor.id}|${visitor.username}|${visitor.name ?? ""}`;
  if (cached?.key !== key) cached = { key, sample: buildSample(now, visitor) };
  return cached.sample;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const has = (params: Params, name: string) => params?.[name] !== undefined && params[name] !== "";

function paginate<T>(rows: T[], params: Params): Paginated<T> {
  const size = Math.max(1, Number(params?.page_size) || 20);
  const page = Math.max(1, Number(params?.page) || 1);
  return {
    count: rows.length,
    next_page: page * size < rows.length ? page + 1 : null,
    previous_page: page > 1 ? page - 1 : null,
    results: rows.slice((page - 1) * size, page * size),
  };
}

function order<T>(rows: T[], ordering: unknown, fallback: string): T[] {
  const key = str(ordering) || fallback;
  const desc = key.startsWith("-");
  const field = desc ? key.slice(1) : key;
  return [...rows].sort((a, b) => {
    const cmp = str((a as Row)[field]).localeCompare(str((b as Row)[field]), "en", {
      numeric: true,
    });
    return desc ? -cmp : cmp;
  });
}

interface Spec {
  equal: string[];
  ranges: string[];
  search: (row: Row) => string;
  name?: boolean;
}

function filter(rows: Row[], params: Params, spec: Spec): Row[] {
  const terms = str(params?.search).toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    for (const field of spec.equal) {
      if (has(params, field) && str(row[field]) !== str(params?.[field])) return false;
    }
    for (const field of spec.ranges) {
      const value = str(row[field]);
      const gte = str(params?.[`${field}__gte`]);
      const lte = str(params?.[`${field}__lte`]);
      if (gte && (!value || value.slice(0, gte.length) < gte)) return false;
      if (lte && (!value || value.slice(0, lte.length) > lte)) return false;
    }
    if (has(params, "tags")) {
      const wanted = str(params?.tags).split(",");
      const chips = (row.tags as { id: number; name: string }[] | undefined) ?? [];
      if (
        !wanted.every((w) =>
          chips.some((c) => str(c.id) === w || c.name.toLowerCase() === w.toLowerCase()),
        )
      )
        return false;
    }
    if (
      spec.name &&
      has(params, "name") &&
      !str(row.name).toLowerCase().includes(str(params?.name).toLowerCase())
    ) {
      return false;
    }
    const haystack = terms.length ? spec.search(row).toLowerCase() : "";
    return terms.every((t) => haystack.includes(t));
  });
}

const list = (rows: Row[], params: Params, spec: Spec, fallback: string) =>
  paginate(order(filter(rows, params, spec), params?.ordering, fallback), params);

const SPECS = {
  persons: {
    equal: ["lifecycle_stage", "active", "owner", "organization"],
    ranges: ["created_at"],
    search: (r: Row) =>
      `${str(r.name)} ${str(r.primary_email)} ${str(r.job_title)} ${str(r.organization_name)}`,
  },
  organizations: {
    equal: ["owner"],
    ranges: ["created_at"],
    search: (r: Row) => `${str(r.name)} ${str((r.address as Row | undefined)?.city)}`,
    name: true,
  },
  deals: {
    equal: ["status", "pipeline", "stage", "owner", "source", "person", "organization"],
    ranges: ["expected_close_date", "created_at"],
    search: (r: Row) => `${str(r.title)} ${str(r.person_name)} ${str(r.organization_name)}`,
  },
  activities: {
    equal: ["type", "is_done", "owner", "deal", "person"],
    ranges: ["schedule_from"],
    search: (r: Row) => `${str(r.title)} ${str(r.comment)} ${str(r.location)}`,
  },
  tags: { equal: [], ranges: ["created_at"], search: (r: Row) => str(r.name), name: true },
  pipelines: { equal: ["code"], ranges: [], search: (r: Row) => str(r.name), name: true },
  sources: { equal: [], ranges: [], search: (r: Row) => str(r.name) },
} satisfies Record<string, Spec>;

const money = (n: number) => n.toFixed(2);
const valueOf = (d: Deal) => Number(d.lead_value ?? 0);

function stageTotals(stage: PipelineStage, deals: Deal[]) {
  const total = deals.reduce((n, d) => n + valueOf(d), 0);
  return {
    stage,
    count: deals.length,
    total_value: money(total),
    weighted_value: money((total * (stage.probability ?? 0)) / 100),
  };
}

function overview(s: Sample, params: Params, now: Date) {
  const deals = has(params, "pipeline")
    ? s.applications.filter((d) => str(d.pipeline) === str(params?.pipeline))
    : s.applications;
  const open = deals.filter((d) => d.status === "open");
  const stageOf = (d: Deal) => s.pipeline.stages.find((st) => st.id === d.stage)!;
  const month = (iso: string) => iso.slice(0, 7);
  const closedIn = (status: Deal["status"], key: string) =>
    deals.filter((d) => d.status === status && d.closed_at && month(d.closed_at) === key);
  const sum = (ds: Deal[]) => money(ds.reduce((n, d) => n + valueOf(d), 0));
  const thisMonth = month(now.toISOString());
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1))
      .toISOString()
      .slice(0, 7),
  );
  const today = now.toISOString().slice(0, 10);
  const pending = s.activities.filter((a) => !a.is_done);
  return {
    app: CRM_APP,
    persons: { count: s.prospects.length },
    organizations: { count: s.schools.length },
    deals: {
      pipeline: s.pipeline,
      currency: "USD",
      open_count: open.length,
      pipeline_value: sum(open),
      weighted_value: money(
        open.reduce((n, d) => n + (valueOf(d) * (stageOf(d).probability ?? 0)) / 100, 0),
      ),
      won_this_month_count: closedIn("won", thisMonth).length,
      won_this_month_value: sum(closedIn("won", thisMonth)),
      lost_this_month_count: closedIn("lost", thisMonth).length,
      lost_this_month_value: sum(closedIn("lost", thisMonth)),
      by_stage: s.pipeline.stages.map((stage) =>
        stageTotals(
          stage,
          deals.filter((d) => d.stage === stage.id),
        ),
      ),
      won_lost_by_month: months.map((key) => ({
        month: key,
        won_count: closedIn("won", key).length,
        won_value: sum(closedIn("won", key)),
        lost_count: closedIn("lost", key).length,
        lost_value: sum(closedIn("lost", key)),
      })),
    },
    activities: {
      open_count: pending.length,
      due_today: pending.filter((a) => str(a.schedule_from).slice(0, 10) === today).length,
      overdue: pending.filter((a) => str(a.schedule_from).slice(0, 10) < today).length,
    },
  };
}

function search(s: Sample, params: Params) {
  const q = str(params?.q).trim().toLowerCase();
  const limit = Math.max(1, Number(params?.limit) || 5);
  const hit = (...fields: unknown[]) => fields.some((f) => str(f).toLowerCase().includes(q));
  return {
    q: str(params?.q),
    persons: s.prospects
      .filter((p) => hit(p.name, p.primary_email))
      .slice(0, limit)
      .map(({ id, name, primary_email, job_title, organization, lifecycle_stage, app }) => ({
        id,
        name,
        primary_email,
        job_title,
        organization,
        lifecycle_stage,
        app,
      })),
    organizations: s.schools
      .filter((o) => hit(o.name))
      .slice(0, limit)
      .map(({ id, name, app }) => ({ id, name, app })),
    deals: s.applications
      .filter((d) => hit(d.title))
      .slice(0, limit)
      .map(
        ({
          id,
          title,
          status,
          lead_value,
          currency,
          person,
          organization,
          pipeline,
          stage,
          app,
        }) => ({
          id,
          title,
          status,
          lead_value,
          currency,
          person,
          organization,
          pipeline,
          stage,
          app,
        }),
      ),
  };
}

const found = <T>(row: T | undefined): T | typeof NOT_FOUND => row ?? NOT_FOUND;

/** The sample's answer to a slice request (see the module comment). */
export function sampleResponse(
  method: string,
  url: string,
  params: Params,
  { now, visitor }: { now: Date; visitor: SampleVisitor },
): unknown {
  if (method.toUpperCase() !== "GET") return undefined;
  const s = sampleOf(now, visitor);
  const path = url.split("?")[0];
  const rows = <T>(r: T[]) => r as unknown as Row[];
  let m: RegExpMatchArray | null;

  if (path === "/persons/") return list(rows(s.prospects), params, SPECS.persons, "-created_at");
  if ((m = path.match(/^\/persons\/([^/]+)\/$/)))
    return found(s.prospects.find((p) => p.id === m![1]));
  if (path === "/organizations/") return list(rows(s.schools), params, SPECS.organizations, "name");
  if ((m = path.match(/^\/organizations\/([^/]+)\/$/)))
    return found(s.schools.find((o) => o.id === m![1]));
  if (path === "/pipelines/") return list(rows([s.pipeline]), params, SPECS.pipelines, "name");
  if ((m = path.match(/^\/pipelines\/(\d+)\/stages\/$/))) {
    return Number(m[1]) === s.pipeline.id ? paginate(s.pipeline.stages, params) : NOT_FOUND;
  }
  if ((m = path.match(/^\/pipelines\/(\d+)\/$/)))
    return Number(m[1]) === s.pipeline.id ? s.pipeline : NOT_FOUND;
  if (path === "/lead-sources/") return list(rows(s.sources), params, SPECS.sources, "name");
  if (path === "/deals/") return list(rows(s.applications), params, SPECS.deals, "-created_at");
  if ((m = path.match(/^\/deals\/(\d+)\/$/)))
    return found(s.applications.find((d) => d.id === Number(m![1])));
  if (path === "/activities/")
    return list(rows(s.activities), params, SPECS.activities, "schedule_from");
  if ((m = path.match(/^\/activities\/(\d+)\/$/)))
    return found(s.activities.find((a) => a.id === Number(m![1])));
  if (path === "/tags/") return list(rows(s.tags), params, SPECS.tags, "name");
  if (path === "/search/") return search(s, params);
  if (path === "/overview/") return overview(s, params, now);
  if (path === "/members/") return paginate(s.members, params);
  if (path === "/web-forms/") return paginate(s.forms, params);
  if ((m = path.match(/^\/web-forms\/([^/]+)\/submissions\/$/))) {
    return s.forms.some((f) => f.slug === decodeURIComponent(m![1]))
      ? paginate(s.submissions, params)
      : NOT_FOUND;
  }
  if ((m = path.match(/^\/web-forms\/([^/]+)\/$/)))
    return found(s.forms.find((f) => f.slug === decodeURIComponent(m![1])));
  return NOT_FOUND;
}
