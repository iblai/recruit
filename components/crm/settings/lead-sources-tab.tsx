"use client";

import { useEffect, useState } from "react";
import { Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/crm/empty-state";
import { InfoTip } from "@/components/crm/info-tip";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { InlineText } from "@/components/crm/inline-field";
import { slugify, toastSettingsError } from "@/components/crm/settings/utils";
import {
  useCreateLeadSourceMutation,
  useDeleteLeadSourceMutation,
  useListLeadSourcesQuery,
  useUpdateLeadSourceMutation,
} from "@/lib/crm/api";
import { formatDate } from "@/lib/crm/format";
import type { LeadSource } from "@/lib/crm/types";

export function LeadSourcesTab() {
  const { data, isLoading } = useListLeadSourcesQuery({ page_size: 100 });
  const [creating, setCreating] = useState(false);
  const sources = data?.results ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-1 text-sm">
          How prospects find you — college fairs, school visits, landing pages, referrals.
          <InfoTip label="About sources">
            Set on each application, then filtered on the board and the table
          </InfoTip>
        </p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="sm" className="ibl-button-primary" onClick={() => setCreating(true)} />
            }
          >
            <Plus data-icon="inline-start" /> New source
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Add a channel you can then pick on any application
          </TooltipContent>
        </Tooltip>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon={<Radio />}
          title="No sources yet"
          description="Add the channels your inquiries arrive through — fairs, visits, landing pages, referrals — so you can see which ones turn into enrollments."
          action={
            <Button className="ibl-button-primary" onClick={() => setCreating(true)}>
              <Plus data-icon="inline-start" /> New source
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#fafbfc]">
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <LeadSourceRow key={source.id} source={source} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LeadSourceDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function LeadSourceRow({ source }: { source: LeadSource }) {
  const [update] = useUpdateLeadSourceMutation();
  const [remove, { isLoading: removing }] = useDeleteLeadSourceMutation();
  const [confirm, setConfirm] = useState(false);

  return (
    <TableRow>
      <TableCell className="min-w-48 py-1.5 text-sm font-medium text-gray-900">
        <InlineText
          value={source.name}
          placeholder="Source"
          onSave={async (v) => {
            if (!v.trim()) return;
            try {
              await update({ id: source.id, body: { name: v.trim() } }).unwrap();
            } catch (err) {
              toastSettingsError(err);
            }
          }}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
          {source.code}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground py-1.5 text-xs">
        {formatDate(source.created_at)}
      </TableCell>
      <TableCell className="py-1.5 text-right">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-gray-400 hover:text-rose-600"
                onClick={() => setConfirm(true)}
                aria-label={`Delete source ${source.name}`}
              />
            }
          >
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent side="left">
            Applications keep their data but lose this source
          </TooltipContent>
        </Tooltip>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete “${source.name}”?`}
          description="Applications that point at this source lose it. The applications themselves are kept."
          confirmLabel="Delete"
          destructive
          loading={removing}
          onConfirm={async () => {
            try {
              await remove(source.id).unwrap();
              setConfirm(false);
              toast.success("Source deleted");
            } catch (err) {
              toastSettingsError(err);
            }
          }}
        />
      </TableCell>
    </TableRow>
  );
}

function LeadSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [create, { isLoading }] = useCreateLeadSourceMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCode("");
    setCodeTouched(false);
    setTouched(false);
  }, [open]);

  const invalid = !name.trim() || !code.trim();

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    try {
      const created = await create({ name: name.trim(), code: code.trim() }).unwrap();
      toast.success(`Source “${created.name}” created`);
      onOpenChange(false);
    } catch (err) {
      toastSettingsError(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>New source</DialogTitle>
          <DialogDescription>
            A channel prospects and applications come in through.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5 px-4 pb-4">
          <div className="grid gap-1.5">
            <Label htmlFor="source-name">Name</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!codeTouched) setCode(slugify(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="College fair"
              className="h-8 text-sm"
              aria-invalid={touched && !name.trim()}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="source-code">Code</Label>
            <Input
              id="source-code"
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(slugify(e.target.value));
              }}
              placeholder="college-fair"
              className="h-8 font-mono text-sm"
              aria-invalid={touched && !code.trim()}
            />
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-xl">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button className="ibl-button-primary" onClick={() => void submit()} disabled={isLoading}>
            {isLoading ? <Spinner data-icon="inline-start" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
