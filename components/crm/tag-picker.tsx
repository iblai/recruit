"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TagChip } from "@/components/crm/tag-chip";
import { errorMessage, useCreateTagMutation, useListTagsQuery } from "@/lib/crm/api";
import type { TagChip as TagChipType } from "@/lib/crm/types";
import { cn } from "@/lib/utils";

const NEW_TAG_COLORS = [
  "#0058cc",
  "#00b0ef",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#0891b2",
  "#f59e0b",
];

/**
 * Tag chips for a record plus a picker to attach existing tags or create a
 * new one on the fly. Attach / detach are handed to the caller because each
 * host (person / organization / deal) has its own endpoint.
 */
export function TagPicker({
  tags,
  onAttach,
  onDetach,
  disabled,
  compact,
}: {
  tags: TagChipType[];
  onAttach: (tagId: number) => Promise<unknown> | void;
  onDetach: (tagId: number) => Promise<unknown> | void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data } = useListTagsQuery(undefined, { skip: !open });
  const [createTag, { isLoading: creating }] = useCreateTagMutation();

  const attached = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const all = data?.results ?? [];
  const q = query.trim().toLowerCase();
  const exact = all.some((t) => t.name.toLowerCase() === q);

  const toggle = async (tagId: number) => {
    try {
      if (attached.has(tagId)) await onDetach(tagId);
      else await onAttach(tagId);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const create = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const color = NEW_TAG_COLORS[all.length % NEW_TAG_COLORS.length];
      const tag = await createTag({ name, color }).unwrap();
      await onAttach(tag.id);
      setQuery("");
      toast.success(`Tag "${tag.name}" created`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} onRemove={disabled ? undefined : () => void toggle(t.id)} />
      ))}
      {!disabled ? (
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      size={compact ? "xs" : "sm"}
                      className={cn(
                        "text-muted-foreground rounded-full border-dashed",
                        compact && "h-6",
                      )}
                    />
                  }
                />
              }
            >
              {tags.length ? (
                <Plus data-icon="inline-start" />
              ) : (
                <TagIcon data-icon="inline-start" />
              )}
              {tags.length ? "Add" : "Add tag"}
            </TooltipTrigger>
            <TooltipContent>Attach an existing tag or create one</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-64 p-0" align="start">
            <Command shouldFilter>
              <CommandInput
                autoFocus
                placeholder="Find or create a tag…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>{q ? "No matching tag." : "No tags yet."}</CommandEmpty>
                <CommandGroup>
                  {all.map((t) => (
                    <CommandItem key={t.id} value={t.name} onSelect={() => void toggle(t.id)}>
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: t.color || "#888888" }}
                        aria-hidden
                      />
                      <span className="truncate">{t.name}</span>
                      {attached.has(t.id) ? (
                        <Check className="ml-auto size-4 text-[#0058cc]" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {q && !exact ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup forceMount>
                      <CommandItem
                        value={`create-${q}`}
                        onSelect={() => void create()}
                        disabled={creating}
                        forceMount
                      >
                        <Plus className="size-4" />
                        Create “{query.trim()}”
                      </CommandItem>
                    </CommandGroup>
                  </>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
