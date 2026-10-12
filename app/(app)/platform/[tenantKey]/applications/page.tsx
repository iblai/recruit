"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Kanban, Plus, Search, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/empty-state";
import { PaginationBar } from "@/components/crm/pagination-bar";
import { SimpleSelect } from "@/components/crm/simple-select";
import { OwnerFilter } from "@/components/crm/deals/owner-filter";
import { DealBoard } from "@/components/crm/deals/deal-board";
import { DealsTable } from "@/components/crm/deals/deals-table";
import { DealDialog } from "@/components/crm/deals/deal-dialog";
import { useDealLookups } from "@/components/crm/deals/use-lookups";
import { useListAllDealsQuery, useListDealsQuery, useListTagsQuery } from "@/lib/crm/api";
import type { DealStatus } from "@/lib/crm/types";
import { STATUS_LABELS } from "@/lib/recruit/vocabulary";

type View = "kanban" | "table";
const VIEW_KEY = "crm.deals.view";
const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "won", label: STATUS_LABELS.won },
  { value: "lost", label: STATUS_LABELS.lost },
  { value: "", label: "All statuses" },
];

export default function DealsPage() {
  return (
    <Suspense fallback={<PageHeader icon={<ClipboardList />} title="Applications" />}>
      <DealsPageContent />
    </Suspense>
  );
}

function DealsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<View>("kanban");
  const [hydrated, setHydrated] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [status, setStatus] = useState<DealStatus | "">("open");
  const [owner, setOwner] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [tagId, setTagId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [seed, setSeed] = useState<{ person?: string; organization?: string }>({});

  const lookups = useDealLookups();
  const { data: tags } = useListTagsQuery();

  // Remember the view the user picked.
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === "kanban" || stored === "table") setView(stored);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(VIEW_KEY, view);
  }, [view, hydrated]);

  // `?new=1&person=…&organization=…` opens the create dialog prefilled.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setSeed({
      person: searchParams.get("person") ?? undefined,
      organization: searchParams.get("organization") ?? undefined,
    });
    setNewOpen(true);
    router.replace(window.location.pathname);
  }, [searchParams, router]);

  // Default to the organization's default funnel.
  useEffect(() => {
    if (!pipelineId && lookups.defaultPipeline) setPipelineId(String(lookups.defaultPipeline.id));
  }, [lookups.defaultPipeline, pipelineId]);

  const pipeline = lookups.pipelineById.get(Number(pipelineId));

  const filters = useMemo(
    () => ({
      pipeline: pipelineId ? Number(pipelineId) : undefined,
      owner: owner ?? undefined,
      source: sourceId ? Number(sourceId) : undefined,
      tags: tagId || undefined,
    }),
    [pipelineId, owner, sourceId, tagId],
  );

  const { data: boardDeals, isLoading: boardLoading } = useListAllDealsQuery(filters, {
    skip: view !== "kanban" || !pipelineId,
  });
  const { data: tableDeals, isLoading: tableLoading } = useListDealsQuery(
    { ...filters, status: status || undefined, page, page_size: PAGE_SIZE },
    { skip: view !== "table" },
  );

  useEffect(() => {
    setPage(1);
  }, [pipelineId, status, owner, sourceId, tagId]);

  const q = search.trim().toLowerCase();
  const matches = (title: string) => !q || title.toLowerCase().includes(q);
  const visibleBoardDeals = useMemo(
    () => (boardDeals ?? []).filter((d) => matches(d.title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardDeals, q],
  );
  const visibleTableDeals = useMemo(
    () => (tableDeals?.results ?? []).filter((d) => matches(d.title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableDeals, q],
  );

  const count = view === "kanban" ? visibleBoardDeals.length : (tableDeals?.count ?? null);
  const filtersActive = !!(
    owner ||
    sourceId ||
    tagId ||
    q ||
    (view === "table" && status !== "open")
  );
  const clearFilters = () => {
    setOwner(null);
    setSourceId("");
    setTagId("");
    setSearch("");
    setStatus("open");
  };

  // The board waits on both the funnels and the applications before it can say
  // "no applications" — otherwise the empty state flashes on every load.
  const boardBusy = boardLoading || lookups.isLoading || !pipelineId;
  const isEmpty =
    view === "kanban"
      ? !boardBusy && visibleBoardDeals.length === 0 && !filtersActive
      : !tableLoading && (tableDeals?.count ?? 0) === 0 && !filtersActive;

  return (
    <>
      <PageHeader
        icon={<ClipboardList />}
        title="Applications"
        count={count}
        description="Every prospect's application, moving through the stages of your funnel"
        actions={
          <>
            <ToggleGroup
              value={[view]}
              onValueChange={(v) => {
                const next = v[0];
                if (next === "kanban" || next === "table") setView(next);
              }}
              spacing={0}
              className="rounded-lg border border-[var(--border-color,#e5e7eb)] bg-white p-0.5"
              aria-label="Applications view"
            >
              <Tooltip>
                <TooltipTrigger
                  render={<ToggleGroupItem value="kanban" size="sm" aria-label="Kanban view" />}
                >
                  <Kanban />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Board — drag applications between stages
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<ToggleGroupItem value="table" size="sm" aria-label="Table view" />}
                >
                  <Table2 />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Table — filter and page through applications
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    className="ibl-button-primary"
                    onClick={() => {
                      setSeed({});
                      setNewOpen(true);
                    }}
                  />
                }
              >
                <Plus data-icon="inline-start" /> New application
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Open an application for a prospect; it starts in the first stage
              </TooltipContent>
            </Tooltip>
          </>
        }
        toolbar={
          <>
            <SimpleSelect
              value={pipelineId}
              onChange={setPipelineId}
              options={lookups.pipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              placeholder="Funnel"
              size="sm"
              className="w-44"
              aria-label="Funnel"
            />
            {view === "table" ? (
              <SimpleSelect
                value={status}
                onChange={(v) => setStatus(v as DealStatus | "")}
                options={STATUS_OPTIONS}
                size="sm"
                className="w-36"
                aria-label="Status"
              />
            ) : null}
            <OwnerFilter value={owner} onChange={setOwner} className="w-44" />
            <SimpleSelect
              value={sourceId}
              onChange={setSourceId}
              options={lookups.sources.map((s) => ({ value: String(s.id), label: s.name }))}
              allowEmpty
              emptyLabel="Any source"
              placeholder="Any source"
              size="sm"
              className="w-40"
              aria-label="Source"
            />
            <SimpleSelect
              value={tagId}
              onChange={setTagId}
              options={(tags?.results ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
              allowEmpty
              emptyLabel="Any tag"
              placeholder="Any tag"
              size="sm"
              className="w-36"
              aria-label="Tag"
            />
            <div className="relative ml-auto w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search applications…"
                className="h-8 pl-7 text-sm"
                aria-label="Search applications by title"
              />
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X data-icon="inline-start" /> Clear
              </Button>
            ) : null}
          </>
        }
      />

      {isEmpty ? (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <EmptyState
            icon={<ClipboardList />}
            title="No applications yet"
            description="Open an application for a prospect — it starts in the first stage of the funnel, and you move it along the board as they progress toward enrolling."
            action={
              <Button
                className="ibl-button-primary"
                onClick={() => {
                  setSeed({});
                  setNewOpen(true);
                }}
              >
                <Plus data-icon="inline-start" /> New application
              </Button>
            }
          />
        </div>
      ) : view === "kanban" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <DealBoard
            pipeline={pipeline}
            deals={visibleBoardDeals}
            isLoading={boardBusy}
            personName={lookups.personName}
            organizationName={lookups.organizationName}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <DealsTable
              deals={visibleTableDeals}
              isLoading={tableLoading}
              stageById={lookups.stageById}
              personName={lookups.personName}
              organizationName={lookups.organizationName}
            />
            {!tableLoading && visibleTableDeals.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                No applications match these filters.
              </p>
            ) : null}
          </div>
          <PaginationBar
            data={tableDeals}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            label="applications"
          />
        </div>
      )}

      <DealDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultPerson={seed.person}
        defaultOrganization={seed.organization}
        defaultPipeline={pipelineId ? Number(pipelineId) : undefined}
      />
    </>
  );
}
