"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/hooks/use-session";
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

/**
 * Shown where the Chief of Staff would be when the organization has no agent
 * yet. Admins run the one-click setup from here (the server creates the
 * agent, registers this app's tool server and saves the id); members are
 * told to ask an admin.
 */
export function ChiefOfStaffSetupCard({ compact = false }: { compact?: boolean }) {
  const { isAdmin, tenantKey, href } = useSession();
  const { branding, refetch } = useRecruitSettings();
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [institution, setInstitution] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (!isAdmin || !tenantKey) return;
    adminFetch<Status>(`/api/admin/agent?org=${encodeURIComponent(tenantKey)}`)
      .then((s) => {
        setStatus(s);
        setInstitution((v) => v || (branding.name !== tenantKey ? branding.name : ""));
      })
      .catch((e: Error) => setStatusError(e.message));
  }, [isAdmin, tenantKey, branding.name]);

  const run = async () => {
    setBusy(true);
    setLog([]);
    try {
      const result = await adminFetch<{ agentId: string; log: string[] }>("/api/admin/agent", {
        method: "POST",
        json: { org: tenantKey, institutionName: institution.trim() || undefined },
      });
      setLog(result.log ?? []);
      toast.success(`${VOCAB.chiefOfStaff} is ready`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const ready = !!status && status.serverHasKey && status.mcpTokenSet;

  return (
    <div className={compact ? "p-4" : "mx-auto w-full max-w-2xl p-4 md:p-8"}>
      <section className="overflow-hidden rounded-2xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="bg-gradient-to-br from-[#eef6fc] to-white px-6 py-7">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#0058cc] shadow-sm">
            <Sparkles className="size-5" strokeWidth={1.75} />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-gray-900">
            Meet your {VOCAB.chiefOfStaff}
          </h2>
          <p className="text-muted-foreground mt-1.5 max-w-lg text-sm">
            One agent the whole recruitment team talks to. It reads and updates prospects, schools,
            applications and activities through this app, briefs you every morning, and drafts
            outreach in your institution&apos;s voice.
          </p>
        </div>

        {!isAdmin ? (
          <p className="text-muted-foreground px-6 py-5 text-sm">
            An organization admin has not set up the {VOCAB.chiefOfStaff} yet. Ask them to open{" "}
            <span className="font-medium text-gray-900">Settings → {VOCAB.chiefOfStaff}</span>.
          </p>
        ) : (
          <div className="grid gap-4 px-6 py-5">
            {statusError ? (
              <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{" "}
                {statusError}
              </p>
            ) : null}
            {status ? (
              <ul className="grid gap-1.5 text-sm">
                <Check ok={status.serverHasKey}>
                  The server holds a Platform API Token for{" "}
                  <code className="font-mono text-xs">{tenantKey}</code> (
                  <code className="font-mono text-xs">IBLAI_API_KEY</code> or{" "}
                  <code className="font-mono text-xs">IBLAI_API_KEYS</code>)
                </Check>
                <Check ok={status.mcpTokenSet}>
                  <code className="font-mono text-xs">RECRUIT_MCP_TOKEN</code> is set (the secret
                  the platform uses to call this app&apos;s tools)
                </Check>
                <Check
                  ok={/^https:\/\//.test(status.appUrl) || status.appUrl.includes("localhost")}
                >
                  Public URL the platform will call back on:{" "}
                  <code className="font-mono text-xs">{status.appUrl}/api/mcp/…</code>
                  {status.appUrl.includes("localhost") ? (
                    <span className="text-muted-foreground">
                      {" "}
                      — set NEXT_PUBLIC_APP_URL to a public https origin so the agent can reach the
                      tools.
                    </span>
                  ) : null}
                </Check>
              </ul>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="institution" className="text-muted-foreground text-xs">
                Institution name (how the agent refers to you)
              </Label>
              <Input
                id="institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Northfield University"
                className="h-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="ibl-button-primary"
                disabled={busy || !ready}
                onClick={() => void run()}
              >
                {busy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Wand2 data-icon="inline-start" strokeWidth={1.75} />
                )}
                Set up the {VOCAB.chiefOfStaff}
              </Button>
              <Button variant="outline" render={<Link href={href("/settings?tab=agent")} />}>
                Settings
              </Button>
            </div>
            {log.length ? (
              <ol className="text-muted-foreground rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5">
                {log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            ) : null}
          </div>
        )}
      </section>
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
