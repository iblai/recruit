"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { toastApiError } from "@/components/crm/people/crm-error";
import { useListPersonsQuery, useMergePersonsMutation } from "@/lib/crm/api";
import { pluralize } from "@/lib/crm/format";
import type { Person } from "@/lib/crm/types";

/**
 * Fold duplicate records into this prospect: their applications, activities
 * and tags move over and the duplicates are removed. Irreversible, so the final step
 * is a confirmation.
 */
export function PersonMergeDialog({
  open,
  onOpenChange,
  person,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person;
}) {
  const { data, isLoading } = useListPersonsQuery({ page_size: 100 }, { skip: !open });
  const [merge, { isLoading: merging }] = useMergePersonsMutation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected([]);
    setConfirm(false);
  }, [open]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.results ?? [])
      .filter((p) => p.id !== person.id)
      .filter((p) =>
        q ? [p.name, p.primary_email, p.job_title].some((v) => v?.toLowerCase().includes(q)) : true,
      );
  }, [data, person.id, query]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const runMerge = async () => {
    try {
      await merge({ primary_id: person.id, duplicate_ids: selected }).unwrap();
      setConfirm(false);
      onOpenChange(false);
      toast.success(`Merged ${pluralize(selected.length, "record")} into ${person.name}`);
    } catch (err) {
      setConfirm(false);
      toastApiError(err, "Could not merge these prospects");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge duplicates into {person.name}</DialogTitle>
            <DialogDescription>
              Pick the duplicate records — the same student inquiring twice, say. Their
              applications, activities and tags move onto {person.name}, and the duplicates are
              deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prospects…"
              className="pl-8"
              aria-label="Search prospects to merge"
            />
          </div>

          <div className="max-h-72 min-h-40 overflow-auto rounded-lg border border-[var(--border-color,#e5e7eb)]">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-md" />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                {query.trim() ? "No matching prospects." : "There is no one else to merge yet."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {candidates.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={() => toggle(p.id)}
                        aria-label={`Merge ${p.name}`}
                      />
                      <EntityAvatar name={p.name} seed={p.id} kind="person" size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {p.name}
                        </span>
                        {p.primary_email ? (
                          <span className="text-muted-foreground block truncate text-xs">
                            {p.primary_email}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={selected.length === 0 || merging}
              onClick={() => setConfirm(true)}
            >
              Merge {selected.length ? pluralize(selected.length, "record") : "records"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Merge these records?"
        description={`${pluralize(selected.length, "duplicate")} will be folded into ${person.name} and then deleted. This cannot be undone.`}
        confirmLabel="Merge and delete duplicates"
        destructive
        loading={merging}
        onConfirm={runMerge}
      />
    </>
  );
}
