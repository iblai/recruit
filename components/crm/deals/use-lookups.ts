"use client";

import { useMemo } from "react";
import {
  useListLeadSourcesQuery,
  useListOrganizationsQuery,
  useListPersonsQuery,
  useListPipelinesQuery,
} from "@/lib/crm/api";
import { sortStages } from "@/lib/crm/format";
import type { LeadSource, Organization, Person, Pipeline, PipelineStage } from "@/lib/crm/types";

/**
 * The reference data every application surface needs: the first prospects and
 * schools (for pickers), the funnels with their stages, and the sources. All
 * of it is small and heavily cached by RTK Query, so each surface may call
 * this freely. Names of a record's prospect and school come with the record.
 */
export function useDealLookups(options?: { skip?: boolean }) {
  const skip = options?.skip;
  const { data: persons, isLoading: personsLoading } = useListPersonsQuery(
    { page_size: 100 },
    { skip },
  );
  const { data: organizations, isLoading: orgsLoading } = useListOrganizationsQuery(
    { page_size: 100 },
    { skip },
  );
  const { data: pipelines, isLoading: pipelinesLoading } = useListPipelinesQuery(
    { page_size: 100 },
    { skip },
  );
  const { data: sources, isLoading: sourcesLoading } = useListLeadSourcesQuery(undefined, { skip });

  const personById = useMemo(
    () => new Map<string, Person>((persons?.results ?? []).map((p) => [p.id, p])),
    [persons],
  );
  const organizationById = useMemo(
    () => new Map<string, Organization>((organizations?.results ?? []).map((o) => [o.id, o])),
    [organizations],
  );
  const pipelineById = useMemo(
    () => new Map<number, Pipeline>((pipelines?.results ?? []).map((p) => [p.id, p])),
    [pipelines],
  );
  const stageById = useMemo(() => {
    const map = new Map<number, PipelineStage>();
    for (const p of pipelines?.results ?? []) for (const s of p.stages ?? []) map.set(s.id, s);
    return map;
  }, [pipelines]);
  const sourceById = useMemo(
    () => new Map<number, LeadSource>((sources?.results ?? []).map((s) => [s.id, s])),
    [sources],
  );

  const defaultPipeline = useMemo(() => {
    const rows = pipelines?.results ?? [];
    return rows.find((p) => p.is_default) ?? rows[0];
  }, [pipelines]);

  return {
    persons: persons?.results ?? [],
    personCount: persons?.count ?? 0,
    organizations: organizations?.results ?? [],
    pipelines: pipelines?.results ?? [],
    sources: sources?.results ?? [],
    personById,
    organizationById,
    pipelineById,
    stageById,
    sourceById,
    defaultPipeline,
    /** `known`: the name the record carries (`person_name`). */
    personName: (id?: string | null, known?: string | null) =>
      id ? known || personById.get(id)?.name || "Unknown prospect" : "—",
    organizationName: (id?: string | null, known?: string | null) =>
      id ? known || organizationById.get(id)?.name || "" : "",
    stageName: (id?: number | null) => (id ? (stageById.get(id)?.name ?? `Stage #${id}`) : "—"),
    sourceName: (id?: number | null) => (id ? (sourceById.get(id)?.name ?? `Source #${id}`) : ""),
    isLoading: personsLoading || orgsLoading || pipelinesLoading || sourcesLoading,
  };
}

/** Stages of a funnel, in board order. */
export function pipelineStages(pipeline?: Pipeline) {
  return sortStages(pipeline?.stages ?? []);
}

/** The stages an application can be created in / reopened into. */
export function openStages(pipeline?: Pipeline) {
  return pipelineStages(pipeline).filter((s) => !s.is_won && !s.is_lost);
}
