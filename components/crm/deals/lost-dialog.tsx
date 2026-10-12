"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

const SUGGESTIONS = [
  "Enrolled elsewhere",
  "Cost / financial aid",
  "Denied admission",
  "Incomplete application",
  "Changed plans",
  "Deferred a year",
];

/** Withdrawing an application always asks why — the API requires a reason. */
export function LostDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  title = "Mark this application withdrawn?",
  description = "The application closes and moves to the withdrawn stage. The reason stays on the record so the team can learn from it.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
  loading?: boolean;
  title?: string;
  description?: string;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="lost-reason">Reason</Label>
          <Textarea
            id="lost-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why did they withdraw or get denied?"
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="outline" size="xs" onClick={() => setReason(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || loading}
            onClick={() => void onConfirm(reason.trim())}
          >
            {loading ? <Spinner data-icon="inline-start" /> : null}
            Mark withdrawn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
