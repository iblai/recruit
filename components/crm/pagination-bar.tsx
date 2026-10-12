"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Paginated } from "@/lib/crm/types";

/** Page-number pagination for the CRM's `{count, next_page, previous_page}` envelope. */
export function PaginationBar({
  data,
  page,
  pageSize,
  onPageChange,
  label = "items",
}: {
  data?: Paginated<unknown>;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (!data) return null;
  const start = data.count === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, data.count);
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-3 border-t border-gray-100 bg-white px-4 py-2 text-xs md:px-6">
      <span>{data.count === 0 ? `No ${label}` : `${start}–${end} of ${data.count} ${label}`}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!data.previous_page}
          onClick={() => data.previous_page && onPageChange(data.previous_page)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span className="px-1 tabular-nums">Page {page}</span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!data.next_page}
          onClick={() => data.next_page && onPageChange(data.next_page)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
