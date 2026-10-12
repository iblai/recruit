"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/empty-state";
import { PaginationBar } from "@/components/crm/pagination-bar";
import { SimpleSelect } from "@/components/crm/simple-select";
import { OwnerSelect } from "@/components/crm/owner-select";
import { OrganizationDialog } from "@/components/crm/organizations/organization-dialog";
import { OrganizationsTable } from "@/components/crm/organizations/organizations-table";
import { useListOrganizationsQuery, useListTagsQuery } from "@/lib/crm/api";
import { VOCAB } from "@/lib/recruit/vocabulary";

const PAGE_SIZE = 50;

/**
 * Schools & partners — the high schools, colleges, CBOs, agencies and
 * employers your prospects come from (CRM organizations). Unlike Prospects,
 * the API filters organizations by name, so the search box queries the server
 * (debounced) instead of the loaded page.
 */
export default function OrganizationsPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [owner, setOwner] = useState<number | null>(null);
  const [tag, setTag] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    setCreateOpen(true);
    params.delete("new");
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [router]);

  // 300ms debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, owner, tag]);

  const { data, isLoading } = useListOrganizationsQuery({
    page,
    page_size: PAGE_SIZE,
    name: debounced || undefined,
    owner: owner ?? undefined,
    tags: tag || undefined,
  });
  const { data: tags } = useListTagsQuery();

  const rows = data?.results ?? [];
  const hasFilter = Boolean(debounced || owner || tag);

  const clearFilters = () => {
    setSearch("");
    setOwner(null);
    setTag("");
  };

  return (
    <>
      <PageHeader
        icon={<Building2 strokeWidth={1.75} />}
        title={VOCAB.school.many}
        count={data?.count ?? null}
        description="High schools, community colleges, community organizations, agencies and employers your prospects come from"
        actions={
          <Tooltip>
            <TooltipTrigger
              render={<Button className="ibl-button-primary" onClick={() => setCreateOpen(true)} />}
            >
              <Plus data-icon="inline-start" strokeWidth={1.75} /> New {VOCAB.school.lower}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Add a {VOCAB.school.lower} or partner, then attach its {VOCAB.prospect.lowerMany} and
              contacts
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
                placeholder={`Search ${VOCAB.school.lowerMany} by name…`}
                className="h-8 pl-8 text-sm"
                aria-label={`Search ${VOCAB.school.lowerMany}`}
              />
            </div>
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
            {hasFilter ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
        {!isLoading && rows.length === 0 ? (
          hasFilter ? (
            <EmptyState
              icon={<Building2 strokeWidth={1.75} />}
              title={`No ${VOCAB.school.lowerMany} match these filters`}
              description={`Try a different name, ${VOCAB.counselor.lower} or tag.`}
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Building2 strokeWidth={1.75} />}
              title={`No ${VOCAB.school.lowerMany} yet`}
              description="Add the high schools, colleges and community partners you recruit from. Prospects link to them, so you can see who is coming from where."
              action={
                <Button className="ibl-button-primary" onClick={() => setCreateOpen(true)}>
                  <Plus data-icon="inline-start" strokeWidth={1.75} /> Add your first{" "}
                  {VOCAB.school.lower}
                </Button>
              }
            />
          )
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="min-h-0 flex-1 overflow-auto">
              <OrganizationsTable organizations={rows} isLoading={isLoading} skeletonRows={10} />
            </div>
            <PaginationBar
              data={data}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              label={VOCAB.school.lowerMany}
            />
          </div>
        )}
      </div>

      <OrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
