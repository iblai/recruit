"use client";

import { useEffect, useState } from "react";
import { useSearchQuery } from "@/lib/crm/api";
import type { CrmSearch } from "@/lib/crm/types";

export type FoundPerson = NonNullable<CrmSearch["persons"]>[number];

/**
 * A prospect picker's rows: what the CRM's `/search/` matches for the typed
 * text (debounced), else `first` — the page the picker already holds.
 */
export function usePersonSearch(first: FoundPerson[], skip = false) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // `currentData`: never the previous text's matches while this one loads.
  const { currentData } = useSearchQuery({ q: debounced, limit: 25 }, { skip: skip || !debounced });
  const rows = debounced ? (currentData?.persons ?? []) : first;
  return { query, setQuery, rows };
}
