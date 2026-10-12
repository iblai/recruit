"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { TagChip } from "@/components/crm/tag-chip";
import { TagColorSwatches, isValidHex } from "@/components/crm/tags/tag-color-picker";
import { errorMessage, errorStatus, useCreateTagMutation } from "@/lib/crm/api";
import type { Tag } from "@/lib/crm/types";

/** Create a tag: a name (unique per organization) and a colour. */
export function TagDialog({
  open,
  onOpenChange,
  defaultColor = "#0058cc",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultColor?: string;
  onCreated?: (tag: Tag) => void;
}) {
  const [create, { isLoading }] = useCreateTagMutation();
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultColor);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setColor(defaultColor);
    setTouched(false);
  }, [open, defaultColor]);

  const nameMissing = !name.trim();
  const colorInvalid = !isValidHex(color);

  const submit = async () => {
    setTouched(true);
    if (nameMissing || colorInvalid) return;
    try {
      const tag = await create({ name: name.trim(), color }).unwrap();
      toast.success(`Tag “${tag.name}” created`);
      onCreated?.(tag);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        errorStatus(err) === 403 ? "You don't have permission to do that" : errorMessage(err),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>New tag</DialogTitle>
          <DialogDescription>
            Tags are shared across prospects, schools and applications.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-4 pb-4">
          <div className="grid gap-1.5">
            <Label htmlFor="tag-name" className="text-muted-foreground text-xs">
              Name
            </Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Legacy, Honors, First-gen…"
              className="h-8 text-sm"
              aria-invalid={touched && nameMissing}
            />
            {touched && nameMissing ? (
              <p className="text-[11px] text-rose-600">A name is required.</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground text-xs">Color</Label>
            <TagColorSwatches color={color} onChange={setColor} />
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-[#fafbfc] px-3 py-2.5">
            <span className="text-muted-foreground text-[11px]">Preview</span>
            <TagChip tag={{ name: name.trim() || "Tag name", color }} />
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-xl">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button className="ibl-button-primary" onClick={() => void submit()} disabled={isLoading}>
            {isLoading ? <Spinner data-icon="inline-start" /> : null}
            Create tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
