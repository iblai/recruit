"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AgentDatasetsTab,
  AgentDisclaimersTab,
  AgentLLMTab,
  AgentSafetyTab,
  AgentSettingsTab,
  AgentSpendCapsTab,
} from "@iblai/iblai-js/web-containers/next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { OwnerSelect } from "@/components/crm/owner-select";
import { PageHeader } from "@/components/crm/page-header";
import { AgentFrame } from "@/components/recruit/agent-frame";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { adminFetch } from "@/lib/recruit/admin-client";
import { cleanOrigins } from "@/lib/recruit/org-settings";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
// SDK panels fill what is left, with no card around them; their own 16px meets the header's edge.
const PANEL = "flex min-h-0 flex-1 flex-col bg-white md:px-2";
const TABS = [
  "sources",
  "voice",
  "notice",
  "guardrails",
  "model",
  "spend",
  "website",
  "handoffs",
  "channels",
] as const;

type Recruit = ReturnType<typeof useRecruitSettings>;

/**
 * Recruit's control room: what it knows, how it sounds, what it must not say,
 * where it appears and who it hands over to. The agent's own settings are the
 * SDK's tabs; the rest is this app's.
 */
export default function RecruitPage() {
  const t = useTranslations("recruit.agent");
  const { tenantKey, href } = useSession();
  const recruit = useRecruitSettings();
  const [tab, setTab] = useState<string>("sources");
  useBreadcrumbs([{ label: t("title"), href: href("/recruit") }]);
  const agentId = recruit.settings.studentAgentId ?? "";

  const sync = (body: object) =>
    adminFetch("/api/admin/agent", {
      method: "POST",
      json: { org: tenantKey, agent: "recruit", ...body },
    }).then(() => recruit.refetch());

  return (
    <>
      <PageHeader
        icon={<Bot />}
        title={t("title")}
        description={
          agentId ? t(recruit.settings.studentMcpServerId ? "toolsOn" : "toolsOff") : undefined
        }
      />
      {recruit.isLoading ? (
        <div className="flex-1 p-4 md:p-6">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !agentId ? (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Setup recruit={recruit} sync={sync} />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-white px-4 md:px-6">
            <TabsList variant="line" className="h-9 pb-1">
              {TABS.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {t(`tabs.${id}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <AgentFrame agentId={agentId}>
            <TabsContent value="sources" className={PANEL}>
              <AgentDatasetsTab maxUploadSizeMb={50} />
            </TabsContent>
            <TabsContent value="voice" className="min-h-0 flex-1 overflow-auto">
              <div className="p-4 md:p-6">
                <Voice recruit={recruit} sync={sync} />
              </div>
              <AgentSettingsTab tenants={[]} />
            </TabsContent>
            <TabsContent value="notice" className={PANEL}>
              <AgentDisclaimersTab />
            </TabsContent>
            <TabsContent value="guardrails" className={PANEL}>
              <AgentSafetyTab showFlaggedPrompts={false} />
            </TabsContent>
            <TabsContent value="model" className={PANEL}>
              <AgentLLMTab />
            </TabsContent>
            <TabsContent value="spend" className={PANEL}>
              <AgentSpendCapsTab />
            </TabsContent>
          </AgentFrame>
          <TabsContent value="website" className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <Website recruit={recruit} org={tenantKey} />
          </TabsContent>
          <TabsContent value="handoffs" className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <Handoffs recruit={recruit} />
          </TabsContent>
          <TabsContent value="channels" className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <Channels recruit={recruit} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function useSave() {
  const t = useTranslations("recruit.agent");
  const [busy, setBusy] = useState(false);
  const save = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

function Setup({ recruit, sync }: { recruit: Recruit; sync: (body: object) => Promise<unknown> }) {
  const t = useTranslations("recruit.agent");
  const { isAdmin } = useSession();
  const [institution, setInstitution] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setInstitution((v) => v || recruit.branding.name), [recruit.branding.name]);

  const run = async () => {
    setBusy(true);
    setProblem("");
    try {
      await sync({ institutionName: institution.trim() || undefined });
      toast.success(t("ready"));
    } catch (e) {
      // The server's own words: which of its two refusals this is.
      setProblem(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${CARD} mx-auto grid max-w-xl gap-3`}>
      <h2 className="text-sm font-semibold text-gray-900">{t("setupTitle")}</h2>
      <p className="text-sm text-gray-600">{t("setupBody")}</p>
      <div className="grid gap-1.5">
        <Label htmlFor="recruit-institution">{t("institution")}</Label>
        <Input
          id="recruit-institution"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          className="h-9"
        />
      </div>
      {problem ? (
        <p role="alert" data-testid="setup-problem" className="text-sm text-red-700">
          {problem}
        </p>
      ) : null}
      <div>
        <Button className="ibl-button-primary" onClick={run} disabled={busy || !isAdmin}>
          {busy ? t("settingUp") : t("setup")}
        </Button>
      </div>
    </section>
  );
}

function Voice({ recruit, sync }: { recruit: Recruit; sync: (body: object) => Promise<unknown> }) {
  const t = useTranslations("recruit.agent");
  const { busy, save } = useSave();
  const [voice, setVoice] = useState(recruit.settings.studentVoice ?? "");

  return (
    <section className={`${CARD} grid max-w-2xl gap-2`}>
      <Label htmlFor="recruit-voice">{t("voiceLabel")}</Label>
      <Textarea
        id="recruit-voice"
        rows={4}
        maxLength={1500}
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
      />
      <p className="text-muted-foreground text-xs">{t("voiceHint")}</p>
      <div>
        <Button
          size="sm"
          className="ibl-button-primary"
          disabled={busy}
          onClick={() => save(() => sync({ voice }))}
        >
          {t("save")}
        </Button>
      </div>
    </section>
  );
}

function Website({ recruit, org }: { recruit: Recruit; org: string }) {
  const t = useTranslations("recruit.agent");
  const { busy, save } = useSave();
  const [sites, setSites] = useState((recruit.settings.websiteOrigins ?? []).join("\n"));
  const typed = sites
    .split("\n")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const valid = cleanOrigins(typed);
  const chat = `${config.publicOrigin()}/chat/${encodeURIComponent(org)}`;
  const snippet = `<script src="${config.publicOrigin()}/embed.js" data-platform="${org}" async></script>`;

  return (
    <div className="grid max-w-2xl gap-4">
      <section className={`${CARD} grid gap-1.5`}>
        <Label>{t("chatLink")}</Label>
        <a
          href={chat}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-xs break-all text-gray-700 underline-offset-4 hover:underline"
        >
          {chat}
        </a>
      </section>
      <section className={`${CARD} grid gap-2`}>
        <Label htmlFor="recruit-sites">{t("sites")}</Label>
        <Textarea
          id="recruit-sites"
          rows={3}
          value={sites}
          onChange={(e) => setSites(e.target.value)}
          placeholder="https://www.example.edu"
          className="font-mono text-xs"
        />
        <p className="text-muted-foreground text-xs">
          {valid.length === typed.length ? t("sitesHint") : t("sitesInvalid")}
        </p>
        <div>
          <Button
            size="sm"
            className="ibl-button-primary"
            disabled={busy || valid.length !== typed.length}
            onClick={() => save(() => recruit.update({ websiteOrigins: valid }))}
          >
            {t("save")}
          </Button>
        </div>
      </section>
      <section className={`${CARD} grid gap-2`}>
        <Label>{t("snippet")}</Label>
        <code className="rounded bg-gray-100 px-2 py-1.5 font-mono text-[11px] break-all text-gray-700">
          {snippet}
        </code>
      </section>
    </div>
  );
}

function Handoffs({ recruit }: { recruit: Recruit }) {
  const t = useTranslations("recruit.agent");
  const { busy, save } = useSave();
  const [fallback, setFallback] = useState<number | null>(
    recruit.settings.handoffCounselorId ?? null,
  );
  const [rows, setRows] = useState<Array<{ program: string; counselor: number | null }>>(() =>
    Object.entries(recruit.settings.counselors ?? {}).map(([program, counselor]) => ({
      program,
      counselor,
    })),
  );
  const edit = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((list) => list.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  const counselors = Object.fromEntries(
    rows
      .filter((r) => r.program.trim() && r.counselor !== null)
      .map((r) => [r.program.trim().toLowerCase(), r.counselor as number]),
  );

  return (
    <section className={`${CARD} grid max-w-2xl gap-4`}>
      <div className="grid gap-1.5">
        <Label>{t("handoffDefault")}</Label>
        <OwnerSelect
          value={fallback}
          onChange={setFallback}
          size="sm"
          emptyLabel={t("handoffAnyone")}
        />
      </div>
      <div className="grid gap-2">
        <Label>{t("byProgram")}</Label>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
            <Input
              value={row.program}
              onChange={(e) => edit(i, { program: e.target.value })}
              placeholder={t("program")}
              aria-label={t("program")}
              className="h-8 text-sm"
            />
            <OwnerSelect
              value={row.counselor}
              onChange={(counselor) => edit(i, { counselor })}
              size="sm"
              emptyLabel={t("counselor")}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((list) => list.filter((_, n) => n !== i))}
            >
              {t("remove")}
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((list) => [...list, { program: "", counselor: null }])}
          >
            {t("addProgram")}
          </Button>
        </div>
      </div>
      <div>
        <Button
          size="sm"
          className="ibl-button-primary"
          disabled={busy}
          onClick={() => save(() => recruit.update({ handoffCounselorId: fallback, counselors }))}
        >
          {t("save")}
        </Button>
      </div>
    </section>
  );
}

function Channels({ recruit }: { recruit: Recruit }) {
  const t = useTranslations("recruit.agent");
  const mail = recruit.settings.mailConnector?.name;
  const rows = [
    { name: t("website"), on: true, note: "" },
    {
      name: t("email"),
      on: !!mail,
      note: mail ? t("emailOn", { connector: mail }) : t("emailOff"),
    },
    { name: t("text"), on: false, note: t("laterNote") },
    { name: t("phone"), on: false, note: t("laterNote") },
  ];
  return (
    <ul className={`${CARD} max-w-2xl divide-y divide-gray-100 !p-0`}>
      {rows.map((row) => (
        <li key={row.name} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
          <span className="font-medium text-gray-900">{row.name}</span>
          <span className="text-right text-xs text-gray-600">
            {row.on ? t("connected") : t("notConnected")}
            {row.note ? ` · ${row.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
