"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useGetMCPServersQuery } from "@iblai/iblai-js/data-layer";
import { McpTab } from "@iblai/iblai-js/web-containers/next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/crm/simple-select";
import { AgentFrame } from "@/components/recruit/agent-frame";
import { useSession } from "@/hooks/use-session";
import { adminFetch } from "@/lib/recruit/admin-client";
import { FINDING_CONNECTOR_URL, type Connector } from "@/lib/recruit/connectors";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/**
 * Settings → Connectors: the other systems the Chief of Staff can use, in the
 * platform's own connector list, which one sends approved mail, and the terms
 * on which it may look for students.
 */
export function ConnectorsTab() {
  const t = useTranslations("recruit.settings");
  const { agentId, isLoading } = useRecruitSettings();

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!agentId) return <p className="text-sm text-gray-600">{t("needsAgent")}</p>;

  return (
    <div className="grid gap-4">
      <Mail />
      <Finding />
      <p className="max-w-2xl text-sm text-gray-600">{t("connectorsBody")}</p>
      {/* The platform's list fills a frame of its own height. */}
      <div className="flex h-[40rem] flex-col overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white">
        <AgentFrame agentId={agentId}>
          <McpTab />
        </AgentFrame>
      </div>
    </div>
  );
}

/** Why the university may write to students it finds, and the connector that is limited to finding them. */
function Finding() {
  const t = useTranslations("recruit.settings");
  const { tenantKey, isAdmin } = useSession();
  const { settings, update, refetch } = useRecruitSettings();
  const [basis, setBasis] = useState("");
  const [busy, setBusy] = useState(false);
  // The Apify connectors on the Chief of Staff; read again after a key is shared.
  const [apify, setApify] = useState<Connector[]>([]);
  const [reads, setReads] = useState(0);
  useEffect(() => setBasis(settings.foundBasis ?? ""), [settings.foundBasis]);
  useEffect(() => {
    if (!tenantKey) return;
    let live = true;
    adminFetch<{ connectors: Connector[] | null }>(
      `/api/admin/agent?org=${encodeURIComponent(tenantKey)}`,
    )
      .then((r) => live && setApify((r.connectors ?? []).filter((c) => c.pinned !== null)))
      // Not known is not a warning: the card still says which address to use.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [tenantKey, reads]);

  const shareKey = async (c: Connector) => {
    setBusy(true);
    try {
      await adminFetch("/api/admin/agent", {
        method: "PATCH",
        json: { org: tenantKey, connectorId: c.id },
      });
      toast.success(t("findingKeyShared"));
      setReads((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("mailFailed"));
    } finally {
      setBusy(false);
    }
  };

  const text = basis.trim();
  const save = async () => {
    setBusy(true);
    try {
      await update(text ? { foundBasis: text } : {}, text ? [] : ["foundBasis"]);
      await refetch();
      toast.success(t("mailSaved"));
    } catch {
      toast.error(t("mailFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="finding" className={`${CARD} grid max-w-2xl gap-3`}>
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-gray-900">{t("findingTitle")}</h2>
        <p className="text-sm text-gray-600">{t("findingBody")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="finding-basis">{t("findingBasis")}</Label>
        <Textarea
          id="finding-basis"
          rows={3}
          maxLength={300}
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
          disabled={!isAdmin}
        />
        <p className="text-muted-foreground text-xs">
          {settings.foundBasis ? t("findingBasisHint") : t("findingOff")}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="finding-address">{t("findingAddress")}</Label>
        <div className="flex gap-2">
          <Input
            id="finding-address"
            readOnly
            value={FINDING_CONNECTOR_URL}
            className="h-9 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={async () => {
              await navigator.clipboard.writeText(FINDING_CONNECTOR_URL);
              toast.success(t("findingCopied"));
            }}
          >
            {t("findingCopy")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t("findingAddressHint")}</p>
        {apify
          .filter((c) => c.pinned === false)
          .map((c) => (
            <p key={c.id} data-testid="finding-open" className="text-xs text-gray-600">
              {t("findingOpen", { name: c.name })}
            </p>
          ))}
        {apify
          .filter((c) => c.pinned && c.keyIgnored)
          .map((c) => (
            <div key={c.id} data-testid="finding-key" className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-gray-600">{t("findingKeyIgnored", { name: c.name })}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !isAdmin}
                onClick={() => shareKey(c)}
              >
                {t("findingShareKey")}
              </Button>
            </div>
          ))}
      </div>
      <div>
        <Button
          size="sm"
          className="ibl-button-primary"
          disabled={busy || !isAdmin || (text.length > 0 && text.length < 10)}
          onClick={save}
        >
          {t("mailSave")}
        </Button>
      </div>
    </section>
  );
}

/** Which connector sends approved mail, and the address found people are shown. */
function Mail() {
  const t = useTranslations("recruit.settings");
  const { tenantKey, username, isAdmin } = useSession();
  const { settings, update, refetch } = useRecruitSettings();
  const servers = useGetMCPServersQuery(
    { org: tenantKey, userId: username, pageSize: 100 },
    { skip: !tenantKey || !username },
  );
  // The platform's own connectors, less this app's tool servers: a mailbox is not picked from the public directory.
  // ponytail: the platform lists its own first and has no filter for them; page on when one adds more than 100.
  const choices = (servers.data?.results ?? []).filter(
    (s) => s.platform_key === tenantKey && !s.name.startsWith("ibl.ai/recruit"),
  );
  const [chosen, setChosen] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setChosen(settings.mailConnector ? String(settings.mailConnector.id) : "");
    setAddress(settings.mailingAddress ?? "");
  }, [settings.mailConnector, settings.mailingAddress]);

  const save = async () => {
    setBusy(true);
    try {
      if (chosen !== (settings.mailConnector ? String(settings.mailConnector.id) : ""))
        await adminFetch("/api/admin/outbox", {
          method: "POST",
          json: { org: tenantKey, connectorId: chosen ? Number(chosen) : null },
        });
      const postal = address.trim();
      if (postal !== (settings.mailingAddress ?? ""))
        await update(postal ? { mailingAddress: postal } : {}, postal ? [] : ["mailingAddress"]);
      await refetch();
      toast.success(t("mailSaved"));
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("mailFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${CARD} grid max-w-2xl gap-3`}>
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold text-gray-900">{t("mailTitle")}</h2>
        <p className="text-sm text-gray-600">{t("mailBody")}</p>
        <p className="text-xs text-gray-600">{t("mailHint")}</p>
      </div>
      <div className="grid gap-1.5">
        <Label>{t("mailConnector")}</Label>
        <SimpleSelect
          value={chosen}
          onChange={setChosen}
          options={choices.map((s) => ({ value: String(s.id), label: s.name }))}
          allowEmpty
          emptyLabel={t("mailNone")}
          placeholder={t("mailNone")}
          size="sm"
          disabled={!isAdmin || servers.isLoading}
          aria-label={t("mailConnector")}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mail-address">{t("address")}</Label>
        <Textarea
          id="mail-address"
          rows={2}
          maxLength={300}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t("addressHint")}</p>
      </div>
      <div>
        <Button size="sm" className="ibl-button-primary" disabled={busy || !isAdmin} onClick={save}>
          {t("mailSave")}
        </Button>
      </div>
    </section>
  );
}
