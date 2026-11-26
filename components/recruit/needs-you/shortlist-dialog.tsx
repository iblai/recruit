"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import {
  errorMessage,
  useCreatePersonMutation,
  useLazyListPersonsQuery,
  useUpdateActivityMutation,
} from "@/lib/crm/api";
import type { Activity, Person } from "@/lib/crm/types";
import { adminFetch } from "@/lib/recruit/admin-client";
import { CHANNELS, foundPerson, profileUrl, shortlistOf, uniqueIdOf } from "@/lib/recruit/found";
import { closedShortlist, uniqueIdTaken } from "./review";

/**
 * An agent's shortlist of students found on a social channel. A person ticks
 * who is kept; closing the review removes everyone else from the record.
 */
export function ShortlistDialog({
  activity,
  onClose,
}: {
  activity: Activity | null;
  onClose: () => void;
}) {
  const t = useTranslations("recruit.needsYou");
  const { href, username, tenantKey } = useSession();
  const list = useMemo(() => (activity ? shortlistOf(activity) : null), [activity]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [matches, setMatches] = useState<Record<number, Person>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [findPersons] = useLazyListPersonsQuery();
  const [createPerson] = useCreatePersonMutation();
  const [update] = useUpdateActivityMutation();

  // Someone on file with the same name, asked one candidate at a time; stops when the dialog closes.
  useEffect(() => {
    setPicked(new Set());
    setMatches({});
    setProblem("");
    if (!list) return;
    let stopped = false;
    let inFlight: { abort: () => void } | null = null;
    (async () => {
      for (const [i, c] of list.people.entries()) {
        if (stopped) return;
        if (c.on_file) continue;
        const request = findPersons({ search: c.name, page_size: 10 });
        inFlight = request;
        const found = await request.unwrap().catch(() => null);
        const same = found?.results.find(
          (p) => p.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
        );
        if (!stopped && same) setMatches((m) => ({ ...m, [i]: same }));
      }
    })();
    return () => {
      stopped = true;
      inFlight?.abort();
    };
  }, [list, findPersons]);

  if (!activity || !list) return null;

  const close = async (kept: number, passed: string[]) => {
    try {
      // One write: a list is never left emptied but open.
      await update({
        id: activity.id,
        body: {
          is_done: true,
          metadata: closedShortlist(list, kept, username ?? "", new Date(), passed),
        },
      }).unwrap();
    } catch (e) {
      setProblem(t("shortlistNotCleared", { detail: errorMessage(e) }));
      return false;
    }
    return true;
  };

  // Their channel tag, and the CRM app's copy: a retry finds the record and does it again.
  const keep = (personId: string) =>
    adminFetch("/api/admin/prospects/found-sync", {
      method: "POST",
      json: { org: tenantKey, personId, kept: true },
    });

  const addSelected = async () => {
    setBusy(true);
    setProblem("");
    let added = 0;
    let onFile = 0;
    let kept = 0;
    try {
      for (const i of [...picked].sort((a, b) => a - b)) {
        const c = list.people[i];
        let id = "";
        try {
          id = (await createPerson(foundPerson(c, list)).unwrap()).id;
          added++;
        } catch (e) {
          if (!uniqueIdTaken(e)) {
            setProblem(t("addStopped", { added, name: c.name, detail: errorMessage(e) }));
            return;
          }
          onFile++;
          const uid = uniqueIdOf(c.platform, c.handle);
          const same = await findPersons({ search: uid, page_size: 100 })
            .unwrap()
            .then((r) => r.results.find((p) => p.unique_id === uid))
            .catch(() => undefined);
          id = same?.id ?? "";
        }
        if (!id) continue;
        try {
          await keep(id);
          kept++;
        } catch (e) {
          setProblem(t("copyStopped", { added, name: c.name, detail: errorMessage(e) }));
          return;
        }
      }
      // Everyone else a person saw and did not keep: their handle alone, so new lists leave them out.
      const passed = list.people
        .filter((c, i) => !picked.has(i) && !c.on_file)
        .map((c) => uniqueIdOf(c.platform, c.handle));
      if (await close(kept, passed)) {
        toast.success(t("shortlistAdded", { added, onFile }));
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const discardAll = async () => {
    setBusy(true);
    setProblem("");
    const passed = list.people
      .filter((c) => !c.on_file)
      .map((c) => uniqueIdOf(c.platform, c.handle));
    if (await close(0, passed)) {
      toast.success(t("shortlistDiscarded"));
      onClose();
    }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{list.criteria || t("studentsFound")}</DialogTitle>
          <DialogDescription>{t("shortlistHint")}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-1 rounded-lg border border-[var(--border-color,#e5e7eb)] px-3 py-2 text-xs text-gray-600">
          <div>
            <dt className="inline font-medium text-gray-700">{t("where")}: </dt>
            <dd className="inline">{list.source}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-gray-700">{t("basis")}: </dt>
            <dd className="inline">{list.basis}</dd>
          </div>
        </dl>
        <ul className="-mx-1 max-h-[55vh] divide-y divide-gray-100 overflow-y-auto px-1">
          {list.people.map((c, i) => {
            const id = `sl-${i}`;
            const match = matches[i];
            const place = [
              c.program,
              [c.city, c.state].filter(Boolean).join(", "),
              c.graduation_year && t("classOf", { year: c.graduation_year }),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={`${c.platform}:${c.handle}`} className="flex gap-3 py-3">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  disabled={!!c.on_file || busy}
                  checked={picked.has(i)}
                  onCheckedChange={(on) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (on) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <label htmlFor={id} className="font-medium text-gray-900">
                      {c.name}
                    </label>
                    <a
                      href={profileUrl(c.platform, c.handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs break-all text-gray-500 hover:underline"
                    >
                      {t("handleOn", { handle: c.handle, channel: CHANNELS[c.platform].label })}
                    </a>
                  </div>
                  <p className="mt-1 break-words text-gray-700">“{c.said}”</p>
                  {c.post_url ? (
                    <a
                      href={c.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:underline"
                    >
                      {t("openPost")}
                    </a>
                  ) : null}
                  <p className="mt-1 text-xs text-gray-600">{c.why}</p>
                  {/* Everything that would be kept is shown before it is. */}
                  {c.bio ? <p className="mt-0.5 text-xs text-gray-500">{c.bio}</p> : null}
                  {place ? <p className="mt-0.5 text-xs text-gray-500">{place}</p> : null}
                  {c.on_file ? (
                    <Link
                      href={href(`/prospects/${c.on_file}`)}
                      className="mt-1 inline-block text-xs text-gray-600 underline-offset-4 hover:underline"
                    >
                      {t("onFile")}
                    </Link>
                  ) : match ? (
                    <Link
                      href={href(`/prospects/${match.id}`)}
                      className="mt-1 inline-block text-xs text-gray-600 underline-offset-4 hover:underline"
                    >
                      {t("possibleMatch", { name: match.name })}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {problem ? (
          <p role="alert" className="text-sm text-red-700">
            {problem}
          </p>
        ) : null}
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={discardAll} disabled={busy}>
            {t("discardAll")}
          </Button>
          <Button
            className="ibl-button-primary"
            onClick={addSelected}
            disabled={busy || picked.size === 0}
          >
            {t("addSelected", { count: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
