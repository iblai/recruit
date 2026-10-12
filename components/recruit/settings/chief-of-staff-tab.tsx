"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { RECRUIT_TOOLS } from "@/lib/mcp/tools";
import { adminFetch } from "@/lib/recruit/admin-client";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import { VOCAB } from "@/lib/recruit/vocabulary";

type Status = {
  agentId: string;
  pinnedByEnv: boolean;
  mcpServerId: number | null;
  setupCompletedAt: string | null;
  serverHasKey: boolean;
  mcpTokenSet: boolean;
  appUrl: string;
  username: string;
};

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/**
 * Settings → Chief of Staff: what the server knows, the one-click setup /
 * re-sync, the agent's id, where to tune it in the OS, and the tools it holds.
 */
export function ChiefOfStaffTab() {
  const { tenantKey } = useSession();
  const { settings, branding, agentId, refetch, update, isSaving } = useRecruitSettings();
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [institution, setInstitution] = useState("");
  const [manualId, setManualId] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const load = () =>
    adminFetch<Status>(`/api/admin/agent?org=${encodeURIComponent(tenantKey)}`)
      .then((s) => {
        setStatus(s);
        setStatusError("");
      })
      .catch((e: Error) => setStatusError(e.message));

  useEffect(() => {
    if (!tenantKey) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);
  useEffect(() => {
    setInstitution(
      (v) => v || settings.institutionName || (branding.name !== tenantKey ? branding.name : ""),
    );
  }, [settings.institutionName, branding.name, tenantKey]);

  const run = async () => {
    setBusy(true);
    setLog([]);
    try {
      const result = await adminFetch<{
        agentId: string;
        log: string[];
        created: Record<string, boolean>;
      }>("/api/admin/agent", {
        method: "POST",
        json: { org: tenantKey, institutionName: institution.trim() || undefined },
      });
      setLog(result.log ?? []);
      toast.success(
        result.created?.agent ? `${VOCAB.chiefOfStaff} created` : `${VOCAB.chiefOfStaff} re-synced`,
      );
      await Promise.all([refetch(), load()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const useExisting = async () => {
    const id = manualId.trim();
    if (!/^[0-9a-f-]{20,}$/i.test(id)) {
      toast.error("That does not look like an agent id (the UUID at the end of its OS URL).");
      return;
    }
    try {
      await update({ agentId: id });
      toast.success("Agent saved. Run setup to give it the recruitment tools.");
      setManualId("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const ready = !!status && status.serverHasKey && status.mcpTokenSet;
  const osAgentUrl = agentId
    ? `${config.osUrl()}/platform/${encodeURIComponent(tenantKey)}/${encodeURIComponent(agentId)}`
    : "";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className={CARD}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Sparkles className="size-4 text-[#0058cc]" strokeWidth={1.75} /> The agent
        </h3>
        <dl className="mt-3 divide-y divide-gray-100 text-sm">
          <Row label="Status">
            {agentId ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="size-4" strokeWidth={1.75} /> Set up
                {settings.setupCompletedAt ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {new Date(settings.setupCompletedAt).toLocaleDateString()}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="size-4" strokeWidth={1.75} /> Not set up yet
              </span>
            )}
          </Row>
          <Row label="Agent id">
            {agentId ? (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] break-all text-gray-700">
                {agentId}
              </code>
            ) : (
              "—"
            )}
            {status?.pinnedByEnv ? (
              <span className="text-muted-foreground ml-2 text-xs">
                pinned by NEXT_PUBLIC_DEFAULT_AGENT_ID
              </span>
            ) : null}
          </Row>
          <Row label="Tool server">
            {settings.mcpServerId ? (
              <>
                MCP server <code className="font-mono text-[11px]">#{settings.mcpServerId}</code> →{" "}
                <code className="font-mono text-[11px] break-all">
                  {status?.appUrl ?? ""}/api/mcp/{tenantKey}
                </code>
              </>
            ) : (
              "Not registered"
            )}
          </Row>
        </dl>
        {osAgentUrl ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<a href={osAgentUrl} target="_blank" rel="noreferrer noopener" />}
            >
              Tune in the Agentic OS <ExternalLink data-icon="inline-end" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/platform/${encodeURIComponent(tenantKey)}`} />}
            >
              Open the conversation
            </Button>
          </div>
        ) : null}
        <p className="text-muted-foreground mt-3 text-[11px] leading-5">
          Prompts, LLM, memory, datasets, guardrails and analytics for the agent live in the OS
          (Agent settings). Re-running setup refreshes its system prompt and tool wiring and keeps
          everything else.
        </p>
      </section>

      <section className={CARD}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Wand2 className="size-4 text-[#0058cc]" strokeWidth={1.75} /> Set up or re-sync
        </h3>
        {statusError ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} /> {statusError}
          </p>
        ) : null}
        {status ? (
          <ul className="mt-3 grid gap-1.5 text-sm">
            <Check ok={status.serverHasKey}>
              Server holds a Platform API Token for{" "}
              <code className="font-mono text-xs">{tenantKey}</code>
            </Check>
            <Check ok={status.mcpTokenSet}>
              <code className="font-mono text-xs">RECRUIT_MCP_TOKEN</code> is set on the server
            </Check>
            <Check ok={/^https:\/\//.test(status.appUrl)}>
              Public URL: <code className="font-mono text-xs">{status.appUrl}</code>
              {!/^https:\/\//.test(status.appUrl) ? (
                <span className="text-muted-foreground">
                  {" "}
                  — the platform must reach this app over https; set NEXT_PUBLIC_APP_URL in
                  production.
                </span>
              ) : null}
            </Check>
          </ul>
        ) : !statusError ? (
          <p className="text-muted-foreground mt-3 text-sm">Checking the server…</p>
        ) : null}
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="cos-institution" className="text-muted-foreground text-xs">
            Institution name (used in the agent&apos;s prompt and on landing pages)
          </Label>
          <Input
            id="cos-institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Northfield University"
            className="h-9"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            className="ibl-button-primary"
            size="sm"
            disabled={busy || !ready}
            onClick={() => void run()}
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : agentId ? (
              <RefreshCw data-icon="inline-start" strokeWidth={1.75} />
            ) : (
              <Wand2 data-icon="inline-start" strokeWidth={1.75} />
            )}
            {agentId ? "Re-sync the agent" : `Set up the ${VOCAB.chiefOfStaff}`}
          </Button>
        </div>
        {log.length ? (
          <ol className="text-muted-foreground mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : null}
        <details className="mt-4">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Use an agent you already have instead
          </summary>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="Agent id (UUID from its OS URL)"
              className="h-8 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving || !manualId.trim()}
              onClick={() => void useExisting()}
            >
              Save
            </Button>
          </div>
        </details>
      </section>

      <section className={`${CARD} p-0 xl:col-span-2`}>
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">What the agent can do</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Every tool acts with this organization&apos;s authority against the same records the app
            shows. None of them deletes or merges anything.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafbfc]">
              <TableHead className="text-muted-foreground text-xs">Tool</TableHead>
              <TableHead className="text-muted-foreground text-xs">What it does</TableHead>
              <TableHead className="text-muted-foreground text-xs">Kind</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RECRUIT_TOOLS.map((t) => (
              <TableRow key={t.name}>
                <TableCell className="py-2 align-top font-mono text-xs whitespace-nowrap text-gray-900">
                  {t.name}
                </TableCell>
                <TableCell className="text-muted-foreground py-2 text-xs whitespace-normal">
                  {t.description.split(". ")[0]}.
                </TableCell>
                <TableCell className="py-2 align-top text-xs whitespace-nowrap">
                  {t.annotations?.readOnlyHint ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">read</span>
                  ) : (
                    <span className="rounded-full bg-[#eef6fc] px-2 py-0.5 text-[#0058cc]">
                      write
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 py-2">
      <dt className="text-muted-foreground pt-0.5 text-xs font-medium">{label}</dt>
      <dd className="min-w-0 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" strokeWidth={1.75} />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" strokeWidth={1.75} />
      )}
      <span className={ok ? "text-gray-700" : "text-gray-900"}>{children}</span>
    </li>
  );
}
