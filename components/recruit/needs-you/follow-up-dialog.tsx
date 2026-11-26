"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import {
  crmApi,
  useGetPersonQuery,
  useMarkActivityDoneMutation,
  useUpdateActivityMutation,
} from "@/lib/crm/api";
import type { Activity } from "@/lib/crm/types";
import { adminFetch } from "@/lib/recruit/admin-client";
import {
  contactRefusal,
  followUpOf,
  foundLine,
  sendLink,
  withLine,
} from "@/lib/recruit/follow-ups";
import { CHANNELS, DM_MAX, dmLine, foundOf } from "@/lib/recruit/found";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

/**
 * A message an agent wrote, for a person to read, change and send: from their
 * own mail or phone, or, where the university's mail is connected, by
 * approving it here. Nothing leaves without that press.
 */
export function FollowUpDialog({
  activity,
  onClose,
}: {
  activity: Activity | null;
  onClose: () => void;
}) {
  const t = useTranslations("recruit.needsYou");
  const dispatch = useDispatch();
  const { tenantKey, username } = useSession();
  const { settings, branding } = useRecruitSettings();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  // Approved with no outcome on record: it may have gone out, so it is not offered again.
  const [unknown, setUnknown] = useState(false);
  const { data: person } = useGetPersonQuery(activity?.person ?? "", { skip: !activity?.person });
  const [update] = useUpdateActivityMutation();
  const [markDone, done] = useMarkActivityDoneMutation();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setSubject(activity?.title ?? "");
    setBody(activity?.comment ?? "");
    setProblem("");
    setUnknown(!!(activity?.metadata?.follow_up as { approved?: unknown } | undefined)?.approved);
  }, [activity]);

  if (!activity) return null;
  const channel = followUpOf(activity)?.channel ?? "email";
  // Someone the university found always gets the line saying who writes and how to stop, however it is sent.
  const found = person ? foundOf(person) : null;
  const dm = channel === "dm" && found?.platform && found.handle ? found : null;
  const to =
    channel === "email"
      ? (person?.primary_email ?? "")
      : dm
        ? t("handleOn", { handle: dm.handle!, channel: CHANNELS[dm.platform!].label })
        : channel === "text"
          ? (person?.contact_numbers?.[0] ?? "")
          : "";
  // Asked again here: consent can change between the draft and the send.
  const refusal = person ? contactRefusal(person, channel) : "";

  const text = dm
    ? withLine(body, dmLine(branding.name, dm.platform!))
    : found
      ? withLine(body, foundLine(branding.name, found.source, settings.mailingAddress))
      : body;
  const tooLong = !!dm && text.length > DM_MAX;
  const send = channel === "email" ? t("openMail") : t("openText");
  const approved = !!(activity.metadata?.follow_up as { approved?: unknown } | undefined)?.approved;
  // The university's mail, when an admin connected it; otherwise by hand only.
  const via = channel === "email" ? (settings.mailConnector?.name ?? "") : "";
  const approve = async () => {
    setSending(true);
    setProblem("");
    try {
      const result = await adminFetch<{ sent: boolean | null; detail: string }>(
        "/api/admin/messages/send",
        { method: "POST", json: { org: tenantKey, id: activity.id, subject, body: text, to } },
      );
      // The record changed on the server: the lists read it again.
      dispatch(crmApi.util.invalidateTags(["Activity"]));
      if (result.sent === null) return setUnknown(true);
      if (!result.sent) return setProblem(t("sendFailed", { detail: result.detail }));
      toast.success(t("sentVia", { connector: via }));
      onClose();
    } catch (e) {
      setProblem(t("sendFailed", { detail: e instanceof Error ? e.message : "" }));
    } finally {
      setSending(false);
    }
  };
  const markSent = async () => {
    try {
      await update({
        id: activity.id,
        body: {
          title: subject,
          comment: text,
          metadata: {
            ...activity.metadata,
            follow_up: {
              ...(activity.metadata?.follow_up as object | undefined),
              sent: { at: new Date().toISOString(), by: username },
            },
          },
        },
      }).unwrap();
      await markDone(activity.id).unwrap();
      toast.success(t("sent"));
      onClose();
    } catch {
      toast.error(t("failed"));
    }
  };
  // Kept as a done note, so the step counts as decided and is not drafted again.
  const discard = async () => {
    try {
      await update({
        id: activity.id,
        body: {
          type: "note",
          title: `Not sent: ${activity.title}`.slice(0, 255),
          comment: activity.comment,
          metadata: {
            ...activity.metadata,
            follow_up: {
              ...(activity.metadata?.follow_up as object | undefined),
              discarded: { at: new Date().toISOString(), by: username },
            },
          },
        },
      }).unwrap();
      await markDone(activity.id).unwrap();
      toast.success(t("discarded"));
      onClose();
    } catch {
      toast.error(t("failed"));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" initialFocus={bodyRef}>
        <DialogHeader>
          <DialogTitle>{person?.name ?? t("review")}</DialogTitle>
          <DialogDescription>
            {refusal
              ? t("refused", { reason: refusal })
              : unknown
                ? t("sendUnknown")
                : dm
                  ? t("dmByHand")
                  : via
                    ? t("sendsVia", { connector: via })
                    : t("notSending")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fu-to">{t("to")}</Label>
            <Input id="fu-to" value={to} readOnly className="h-9" />
          </div>
          {channel === "email" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="fu-subject">{t("subject")}</Label>
              <Input
                id="fu-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9"
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="fu-body">{t("message")}</Label>
            <Textarea
              id="fu-body"
              ref={bodyRef}
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {dm ? (
              <p className={`text-xs ${tooLong ? "text-red-700" : "text-gray-500"}`}>
                {t("characters", { count: text.length, max: DM_MAX })}
              </p>
            ) : null}
          </div>
          {problem ? (
            <p role="alert" data-testid="send-problem" className="text-sm text-red-700">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter className="flex-wrap">
          <Button
            variant="outline"
            onClick={discard}
            disabled={approved || done.isLoading || sending}
            className="sm:mr-auto"
          >
            {t("discard")}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast.success(t("copied"));
            }}
          >
            {t("copy")}
          </Button>
          {dm ? (
            <Button
              variant="outline"
              render={
                <a
                  href={dm.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("openProfile")}
                />
              }
            >
              {t("openProfile")}
            </Button>
          ) : channel !== "dm" ? (
            <Button
              variant="outline"
              disabled={!to || !!refusal}
              render={<a href={sendLink(channel, to, subject, text)} aria-label={send} />}
            >
              {send}
            </Button>
          ) : null}
          <Button
            variant={via && !unknown && !dm ? "outline" : undefined}
            className={via && !unknown && !dm ? undefined : "ibl-button-primary"}
            onClick={markSent}
            disabled={done.isLoading || sending || !!refusal || tooLong}
          >
            {t("markSent")}
          </Button>
          {via && !unknown ? (
            <Button
              className="ibl-button-primary"
              onClick={approve}
              disabled={sending || done.isLoading || !to || !!refusal}
            >
              {sending ? t("sending") : t("approveSend")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
