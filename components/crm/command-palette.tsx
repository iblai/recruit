"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck2,
  ChartColumn,
  ClipboardList,
  Home,
  LayoutTemplate,
  Plus,
  School,
  Settings,
  Tag,
  Users,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { useSession } from "@/hooks/use-session";
import { useSearchQuery } from "@/lib/crm/api";
import { dealValue, formatCurrency } from "@/lib/crm/format";

const PaletteContext = createContext<{ open: () => void; close: () => void }>({
  open: () => {},
  close: () => {},
});

export function useCommandPalette() {
  return useContext(PaletteContext);
}

/**
 * ⌘K search across prospects, schools and applications (the CRM's `/search/`)
 * plus quick navigation and "New …" actions.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PaletteContext.Provider value={{ open, close }}>
      {children}
      <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
    </PaletteContext.Provider>
  );
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { href } = useSession();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // `currentData`: never the previous query's matches while this one loads.
  const { currentData: found } = useSearchQuery(
    { q: debounced, limit: 6 },
    { skip: !open || !debounced },
  );
  const matchedPeople = found?.persons ?? [];
  const matchedOrgs = found?.organizations ?? [];
  const matchedDeals = found?.deals ?? [];

  const go = (path: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href(path));
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search prospects, schools and applications, or jump to a page."
      className="max-w-xl"
    >
      <Command shouldFilter={false} className="rounded-xl">
        <CommandInput
          autoFocus
          placeholder="Search prospects, schools, applications…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>No results.</CommandEmpty>
          {matchedPeople.length ? (
            <CommandGroup heading="Prospects">
              {matchedPeople.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`person-${p.id}-${p.name}`}
                  onSelect={() => go(`/prospects/${p.id}`)}
                >
                  <EntityAvatar name={p.name} seed={p.id} size="sm" />
                  <span className="truncate">{p.name}</span>
                  {p.primary_email ? (
                    <span className="text-muted-foreground ml-auto truncate text-xs">
                      {p.primary_email}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {matchedOrgs.length ? (
            <CommandGroup heading="Schools">
              {matchedOrgs.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`org-${o.id}-${o.name}`}
                  onSelect={() => go(`/schools/${o.id}`)}
                >
                  <EntityAvatar name={o.name} seed={o.id} kind="organization" size="sm" />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {matchedDeals.length ? (
            <CommandGroup heading="Applications">
              {matchedDeals.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`deal-${d.id}-${d.title}`}
                  onSelect={() => go(`/applications/${d.id}`)}
                >
                  <ClipboardList className="size-4 text-[#0058cc]" />
                  <span className="truncate">{d.title}</span>
                  {dealValue(d) > 0 ? (
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatCurrency(d.lead_value, d.currency)}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandSeparator />
          <CommandGroup heading="Create">
            <CommandItem value="new prospect" onSelect={() => go("/prospects?new=1")}>
              <Plus className="size-4" /> New prospect
            </CommandItem>
            <CommandItem value="new school" onSelect={() => go("/schools?new=1")}>
              <Plus className="size-4" /> New school
            </CommandItem>
            <CommandItem value="new application" onSelect={() => go("/applications?new=1")}>
              <Plus className="size-4" /> New application
            </CommandItem>
            <CommandItem value="new activity" onSelect={() => go("/activities?new=1")}>
              <Plus className="size-4" /> New activity
            </CommandItem>
            <CommandItem value="new landing page" onSelect={() => go("/landing-pages?new=1")}>
              <Plus className="size-4" /> New landing page
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Go to">
            <CommandItem value="go home" onSelect={() => go("")}>
              <Home className="size-4" /> Home
            </CommandItem>
            <CommandItem value="go funnel dashboard" onSelect={() => go("/dashboard")}>
              <ChartColumn className="size-4" /> Funnel
            </CommandItem>
            <CommandItem value="go prospects" onSelect={() => go("/prospects")}>
              <Users className="size-4" /> Prospects
            </CommandItem>
            <CommandItem value="go schools" onSelect={() => go("/schools")}>
              <School className="size-4" /> Schools
            </CommandItem>
            <CommandItem value="go applications" onSelect={() => go("/applications")}>
              <ClipboardList className="size-4" /> Applications
            </CommandItem>
            <CommandItem value="go activities" onSelect={() => go("/activities")}>
              <CalendarCheck2 className="size-4" /> Activities
            </CommandItem>
            <CommandItem value="go landing pages" onSelect={() => go("/landing-pages")}>
              <LayoutTemplate className="size-4" /> Landing pages
            </CommandItem>
            <CommandItem value="go tags" onSelect={() => go("/tags")}>
              <Tag className="size-4" /> Tags
            </CommandItem>
            <CommandItem value="go settings" onSelect={() => go("/settings")}>
              <Settings className="size-4" /> Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 px-3 py-2 text-[11px]">
          <span>
            <kbd className="rounded border border-gray-200 bg-white px-1 font-sans">↑</kbd>
            <kbd className="ml-0.5 rounded border border-gray-200 bg-white px-1 font-sans">
              ↓
            </kbd>{" "}
            to navigate
          </span>
          <span>
            <kbd className="rounded border border-gray-200 bg-white px-1 font-sans">↵</kbd> to open
          </span>
          <span>
            <kbd className="rounded border border-gray-200 bg-white px-1 font-sans">esc</kbd> to
            close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
