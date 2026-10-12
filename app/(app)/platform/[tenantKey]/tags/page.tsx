"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/empty-state";
import { PaginationBar } from "@/components/crm/pagination-bar";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { InlineText } from "@/components/crm/inline-field";
import { TagChip } from "@/components/crm/tag-chip";
import { TagColorPicker, nextTagColor } from "@/components/crm/tags/tag-color-picker";
import { TagDialog } from "@/components/crm/tags/tag-dialog";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { useSession } from "@/hooks/use-session";
import {
  errorMessage,
  errorStatus,
  useDeleteTagMutation,
  useListTagsQuery,
  useUpdateTagMutation,
} from "@/lib/crm/api";
import { formatDate } from "@/lib/crm/format";
import type { Tag } from "@/lib/crm/types";

const PAGE_SIZE = 100;

function saveError(err: unknown) {
  toast.error(
    errorStatus(err) === 403 ? "You don't have permission to do that" : errorMessage(err),
  );
}

export default function TagsPage() {
  const { href } = useSession();
  useBreadcrumbs([{ label: "Tags", href: href("/tags") }]);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useListTagsQuery({
    page,
    page_size: PAGE_SIZE,
    name: query || undefined,
  });

  const tags = useMemo(() => data?.results ?? [], [data]);

  return (
    <>
      <PageHeader
        icon={<TagIcon />}
        title="Tags"
        count={data?.count ?? null}
        description="One shared vocabulary for prospects, schools and applications"
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  className="ibl-button-primary"
                  onClick={() => setCreating(true)}
                />
              }
            >
              <Plus data-icon="inline-start" /> New tag
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Create a label you can attach to prospects, schools and applications
            </TooltipContent>
          </Tooltip>
        }
        toolbar={
          <div className="relative w-full max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags…"
              className="h-8 pl-8 text-sm"
              aria-label="Search tags"
            />
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex-1 p-4 md:p-6">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <EmptyState
              icon={<TagIcon />}
              title={query ? "No tags match that search" : "No tags yet"}
              description={
                query
                  ? "Try a different name, or create the tag you were looking for."
                  : "Tags group prospects, schools and applications — “Legacy”, “Honors”, “Needs FAFSA”."
              }
              action={
                <Button className="ibl-button-primary" onClick={() => setCreating(true)}>
                  <Plus data-icon="inline-start" /> New tag
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {tags.map((tag) => (
                <TagCard key={tag.id} tag={tag} />
              ))}
            </div>
          )}
        </div>
        <PaginationBar
          data={data}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          label="tags"
        />
      </div>

      <TagDialog
        open={creating}
        onOpenChange={setCreating}
        defaultColor={nextTagColor(data?.count ?? 0)}
      />
    </>
  );
}

function TagCard({ tag }: { tag: Tag }) {
  const [update] = useUpdateTagMutation();
  const [remove, { isLoading: removing }] = useDeleteTagMutation();
  const [confirm, setConfirm] = useState(false);
  const color = tag.color || "#888888";

  const patch = async (body: { name?: string; color?: string }) => {
    try {
      await update({ id: tag.id, body }).unwrap();
    } catch (err) {
      saveError(err);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
      <div className="flex items-start gap-2.5">
        <TagColorPicker
          color={color}
          onChange={(c) => void patch({ color: c })}
          label={`Change the color of ${tag.name}`}
        />
        <div className="min-w-0 flex-1">
          <InlineText
            value={tag.name}
            onSave={(v) => (v.trim() ? patch({ name: v.trim() }) : undefined)}
            placeholder="Untitled tag"
            className="text-sm font-medium text-gray-900"
          />
          <p className="text-muted-foreground mt-0.5 px-1.5 text-[11px]">
            Created {formatDate(tag.created_at)}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-gray-400 hover:text-rose-600"
                onClick={() => setConfirm(true)}
                aria-label={`Delete tag ${tag.name}`}
              />
            }
          >
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent>
            Removes the tag from every prospect, school and application
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <TagChip tag={{ id: tag.id, name: tag.name, color }} />
        <span className="text-muted-foreground font-mono text-[11px] uppercase">{color}</span>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${tag.name}”?`}
        description="This removes the tag from every prospect, school and application it is attached to. The records themselves are kept."
        confirmLabel="Delete tag"
        destructive
        loading={removing}
        onConfirm={async () => {
          try {
            await remove(tag.id).unwrap();
            setConfirm(false);
            toast.success("Tag deleted");
          } catch (err) {
            saveError(err);
          }
        }}
      />
    </div>
  );
}
