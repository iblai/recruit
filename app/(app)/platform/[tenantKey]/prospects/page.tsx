"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { InfoTip } from "@/components/crm/info-tip";
import { EmptyState } from "@/components/crm/empty-state";
import { PaginationBar } from "@/components/crm/pagination-bar";
import { SimpleSelect } from "@/components/crm/simple-select";
import { OwnerSelect } from "@/components/crm/owner-select";
import { PeopleTable } from "@/components/crm/people/people-table";
import { PersonDialog } from "@/components/crm/people/person-dialog";
import { useListOrganizationsQuery, useListPersonsQuery, useListTagsQuery } from "@/lib/crm/api";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/crm/types";
import { LIFECYCLE_LABELS, VOCAB } from "@/lib/recruit/vocabulary";

const PAGE_SIZE = 50;

/**
 * Prospects — every student, applicant and school contact in the
 * organization (CRM persons). The CRM API has no free-text person search, so
 * the toolbar filters on the server (stage, counselor, tag) and the search box
 * narrows the loaded page on the client.
 */
export default function PeoplePage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [owner, setOwner] = useState<number | null>(null);
  const [tag, setTag] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // `?new=1` (sidebar / command palette / deep link) opens the create dialog.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    setCreateOpen(true);
    params.delete("new");
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [router]);

  const hasServerFilter = Boolean(lifecycle || owner || tag);

  useEffect(() => {
    setPage(1);
  }, [lifecycle, owner, tag]);

  const { data, isLoading, isFetching } = useListPersonsQuery({
    page,
    page_size: PAGE_SIZE,
    lifecycle_stage: (lifecycle || undefined) as LifecycleStage | undefined,
    owner: owner ?? undefined,
    tags: tag || undefined,
  });

  const { data: orgs } = useListOrganizationsQuery({ page_size: 100 });
  const { data: tags } = useListTagsQuery();

  const orgNames = useMemo(
    () => new Map((orgs?.results ?? []).map((o) => [o.id, o.name] as const)),
    [orgs],
  );

  const rows = useMemo(() => data?.results ?? [], [data]);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter((p) =>
      [p.name, p.primary_email, p.job_title].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, q]);

  const clearFilters = () => {
    setSearch("");
    setLifecycle("");
    setOwner(null);
    setTag("");
  };

  const showEmptyState = !isLoading && rows.length === 0;
  const noMatches = !isLoading && rows.length > 0 && filtered.length === 0;

  return (
    <>
      <PageHeader
        icon={<Users strokeWidth={1.75} />}
        title={VOCAB.prospect.many}
        count={data?.count ?? null}
        description="The students and families you are recruiting, plus your contacts at partner schools"
        actions={
          <Tooltip>
            <TooltipTrigger
              render={<Button className="ibl-button-primary" onClick={() => setCreateOpen(true)} />}
            >
              <Plus data-icon="inline-start" strokeWidth={1.75} /> New {VOCAB.prospect.lower}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Add a {VOCAB.prospect.lower} — {VOCAB.application.lowerMany} and activities hang off
              them
            </TooltipContent>
          </Tooltip>
        }
        toolbar={
          <>
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <Search
                strokeWidth={1.75}
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this page by name, email, program…"
                className="h-8 pl-8 text-sm"
                aria-label={`Search ${VOCAB.prospect.lowerMany}`}
              />
            </div>
            <span className="flex items-center gap-1">
              <SimpleSelect
                value={lifecycle}
                onChange={setLifecycle}
                options={LIFECYCLE_STAGES}
                allowEmpty
                emptyLabel="All stages"
                placeholder="All stages"
                size="sm"
                className="w-40"
                aria-label="Filter by stage"
              />
              <InfoTip label="About stages">
                How far along a {VOCAB.prospect.lower} is: {LIFECYCLE_LABELS.lead} →{" "}
                {LIFECYCLE_LABELS.qualified} → {LIFECYCLE_LABELS.opportunity} →{" "}
                {LIFECYCLE_LABELS.customer} · {LIFECYCLE_LABELS.churned}
              </InfoTip>
            </span>
            <div className="w-44">
              <OwnerSelect
                value={owner}
                onChange={setOwner}
                size="sm"
                emptyLabel={`Any ${VOCAB.counselor.lower}`}
              />
            </div>
            <SimpleSelect
              value={tag}
              onChange={setTag}
              options={(tags?.results ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
              allowEmpty
              emptyLabel="All tags"
              placeholder="All tags"
              size="sm"
              className="w-40"
              aria-label="Filter by tag"
            />
            {search || hasServerFilter ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
            {q && !noMatches ? (
              <span className="text-muted-foreground text-xs">
                {filtered.length} of {rows.length} on this page
              </span>
            ) : null}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
        {showEmptyState ? (
          hasServerFilter ? (
            <EmptyState
              icon={<Users strokeWidth={1.75} />}
              title={`No ${VOCAB.prospect.lowerMany} match these filters`}
              description={`Try a different stage, ${VOCAB.counselor.lower} or tag.`}
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users strokeWidth={1.75} />}
              title={`No ${VOCAB.prospect.lowerMany} yet`}
              description={`${VOCAB.prospect.many} are the students and families you are recruiting — ${VOCAB.application.lowerMany} and activities hang off them. Start with the one you are talking to today.`}
              action={
                <Button className="ibl-button-primary" onClick={() => setCreateOpen(true)}>
                  <Plus data-icon="inline-start" strokeWidth={1.75} /> Add your first{" "}
                  {VOCAB.prospect.lower}
                </Button>
              }
            />
          )
        ) : noMatches ? (
          <EmptyState
            icon={<Search strokeWidth={1.75} />}
            title={`Nothing on this page matches “${search.trim()}”`}
            description={`Search only looks at the ${VOCAB.prospect.lowerMany} loaded on this page. Try another page or clear the search.`}
            action={
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="min-h-0 flex-1 overflow-auto">
              <PeopleTable
                persons={filtered}
                isLoading={isLoading}
                orgNames={orgNames}
                skeletonRows={10}
              />
            </div>
            <PaginationBar
              data={data}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              label={VOCAB.prospect.lowerMany}
            />
            {isFetching && !isLoading ? (
              <output className="sr-only">Loading {VOCAB.prospect.lowerMany}</output>
            ) : null}
          </div>
        )}
      </div>

      <PersonDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
