"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { crmApi, errorMessage } from "@/lib/crm/api";
import type { Activity, Person } from "@/lib/crm/types";
import { adminFetch } from "@/lib/recruit/admin-client";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import type { IblaiAppDispatch } from "@/store/iblai-store";
import { batchPlan, tally, type Outcome } from "./review";

type Plan = ReturnType<typeof batchPlan>;

/** Every email draft that would go, listed first; sent one at a time on a person's press. */
export function ApproveAllDialog({
  drafts,
  open,
  onClose,
}: {
  drafts: Activity[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("recruit.needsYou");
  const dispatch = useDispatch<IblaiAppDispatch>();
  const { tenantKey } = useSession();
  const { settings, branding } = useRecruitSettings();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [sending, setSending] = useState(false);
  // Which run may still send: closing or reopening the dialog ends the one before.
  const run = useRef(0);

  // Read each draft's person, ten at a time, and list what would go.
  useEffect(() => {
    if (!open) return;
    setPlan(null);
    setOutcomes(null);
    setSending(false);
    setProblem("");
    let cancelled = false;
    (async () => {
      const read: { activity: Activity; person: Person }[] = [];
      const withPerson = drafts.filter((a) => a.person);
      for (let i = 0; i < withPerson.length; i += 10) {
        const page = await Promise.all(
          withPerson.slice(i, i + 10).map(async (activity) => {
            const request = dispatch(crmApi.endpoints.getPerson.initiate(activity.person!));
            try {
              return { activity, person: await request.unwrap() };
            } finally {
              request.unsubscribe();
            }
          }),
        );
        read.push(...page);
        if (cancelled) return;
      }
      if (!cancelled) setPlan(batchPlan(read, branding.name, settings.mailingAddress));
    })().catch((e) => !cancelled && setProblem(t("batchReadFailed", { detail: errorMessage(e) })));
    return () => {
      cancelled = true;
    };
    // Read once per opening: a draft changing underneath does not re-list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async () => {
    if (!plan) return;
    const mine = ++run.current;
    setSending(true);
    const done: Outcome[] = [];
    setOutcomes(done);
    for (const m of plan.go) {
      if (run.current !== mine) break;
      try {
        const r = await adminFetch<{ sent: boolean | null; detail: string }>(
          "/api/admin/messages/send",
          {
            method: "POST",
            json: { org: tenantKey, id: m.id, subject: m.subject, body: m.body, to: m.to },
          },
        );
        done.push({ id: m.id, name: m.name, sent: r.sent, detail: r.detail });
      } catch (e) {
        done.push({ id: m.id, name: m.name, sent: false, detail: errorMessage(e) });
      }
      if (run.current === mine) setOutcomes([...done]);
    }
    if (run.current === mine) setSending(false);
    dispatch(crmApi.util.invalidateTags(["Activity"]));
  };

  const close = () => {
    // The message in flight finishes; nothing after it is sent.
    run.current++;
    onClose();
  };

  const counts = outcomes && !sending ? tally(outcomes) : null;
  const reasons = {
    notEmail: t("leftNotEmail"),
    noAddress: t("leftNoAddress"),
    optedOut: t("leftOptedOut"),
    approved: t("leftApproved"),
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("approveAll")}</DialogTitle>
          <DialogDescription>
            {t("sendsVia", { connector: settings.mailConnector?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        {problem ? (
          <p role="alert" className="text-sm text-red-700">
            {problem}
          </p>
        ) : !plan ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : counts ? (
          <div data-testid="batch-result" className="grid gap-2 text-sm text-gray-700">
            <p>
              {t("batchCounts", {
                sent: counts.sent,
                failed: counts.failed.length,
                unknown: counts.unknown,
              })}
            </p>
            {counts.failed.length ? (
              <ul className="grid gap-1 text-xs text-gray-600">
                {counts.failed.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium text-gray-900">{f.name}</span>: {f.detail}
                  </li>
                ))}
              </ul>
            ) : null}
            {counts.unknown ? <p className="text-xs text-gray-600">{t("sendUnknown")}</p> : null}
          </div>
        ) : (
          <div className="grid max-h-[55vh] gap-4 overflow-y-auto">
            <ul className="divide-y divide-gray-100 rounded-lg border border-[var(--border-color,#e5e7eb)]">
              {plan.go.map((m) => (
                <li key={m.id} className="px-3 py-2 text-sm">
                  {/* The exact text that goes, footer included, one click away. */}
                  <details>
                    <summary className="cursor-pointer">
                      <span className="inline-flex flex-wrap gap-x-2">
                        <span className="font-medium text-gray-900">{m.name}</span>
                        <span className="break-all text-gray-500">{m.to}</span>
                      </span>
                      <span className="block text-xs break-words text-gray-600">{m.subject}</span>
                    </summary>
                    <p className="mt-2 text-xs break-words whitespace-pre-wrap text-gray-700">
                      {m.body}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
            {plan.left.length ? (
              <section>
                <h3 className="mb-1 text-xs font-medium text-gray-500">{t("leftOut")}</h3>
                <ul className="grid gap-1 text-xs text-gray-600">
                  {plan.left.map((l) => (
                    <li key={l.id}>
                      <span className="font-medium text-gray-900">{l.name}</span>:{" "}
                      {reasons[l.reason]}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
        {sending && outcomes ? (
          <p aria-live="polite" className="text-xs text-gray-500">
            {t("progress", { done: outcomes.length, total: plan?.go.length ?? 0 })}
          </p>
        ) : null}
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={close}>
            {counts ? t("close") : t("cancel")}
          </Button>
          {!counts ? (
            <Button
              className="ibl-button-primary"
              onClick={send}
              disabled={sending || !plan || plan.go.length === 0}
            >
              {sending ? t("sending") : t("sendCount", { count: plan?.go.length ?? 0 })}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
