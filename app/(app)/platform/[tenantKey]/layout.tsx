"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { NextIntlClientProvider } from "next-intl";
import { setOpenPricingModal } from "@iblai/iblai-js/web-utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@iblai/iblai-js/web-containers/next";
import { AppSidebar } from "@/components/crm/app-sidebar";
import { TopBar } from "@/components/crm/top-bar";
import { BreadcrumbProvider } from "@/components/crm/breadcrumbs";
import { CommandPaletteProvider } from "@/components/crm/command-palette";
import { AdminModeProvider, useAdminMode } from "@/components/crm/admin-mode";
import { CrmScopeGate } from "@/components/crm/scope-gate";
import {
  AssistantPanel,
  AssistantPanelProvider,
} from "@/components/recruit/chief-of-staff/assistant-panel";
import { LoadingScreen } from "@/components/loading-screen";
import { FirstRunGate } from "@/components/house/first-run-gate";
import { OrganizationPreview } from "@/components/house/organization-preview";
import { SampleNotice } from "@/components/house/sample-notice";
import { UpgradeModal } from "@/components/house/upgrade-modal";
import { useSampleMode } from "@/hooks/use-sample-mode";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { decideEntry } from "@/lib/iblai/house-journeys";
import { readStoredTenantKey } from "@/lib/iblai/tenant";
import messages from "@/messages/en.json";

/**
 * Everything under `/platform/[tenantKey]` — the authenticated, org-scoped
 * recruitment workspace: sidebar + top bar around the page, with the Chief of
 * Staff available in a side panel on every page but Home (which is the full
 * conversation). The providers above us have already verified the session
 * and the org membership. An organization the user does not belong to is
 * previewed (/iblai-vibe-house-journeys).
 */
export default function TenantLayout({ children }: { children: ReactNode }) {
  const { isAdmin, tenantKey, tenants, href } = useSession();
  const sample = useSampleMode();
  // Sidebar open/closed state persists in a cookie (written by the shadcn
  // sidebar); read it once on the client.
  const [defaultOpen] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    const m = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/);
    return m ? m[1] === "true" : true;
  });

  if (!tenantKey) return <LoadingScreen />;
  const entry = decideEntry({ routeOrg: tenantKey, stored: readStoredTenantKey(), tenants });
  if (entry.kind === "preview" && entry.preview) {
    return (
      <NextIntlClientProvider locale="en" messages={messages}>
        <OrganizationPreview org={entry.preview} app={config.iblPlatform()} />
      </NextIntlClientProvider>
    );
  }

  // The community organization shows the sample to everyone as its admin; the SDK
  // (sidebar footer, profile menu, first run) still sees the session's own role.
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminModeProvider isAdmin={isAdmin || sample} tenantKey={tenantKey}>
        <UpgradeModal org={tenantKey} app={config.iblPlatform()} />
        <TooltipProvider>
          <CommandPaletteProvider>
            <BreadcrumbProvider>
              <AssistantPanelProvider>
                <SidebarProvider defaultOpen={defaultOpen}>
                  <AppSidebar />
                  <SidebarInset className="flex h-dvh min-w-0 flex-col overflow-hidden bg-[var(--sidebar-bg,#fafbfc)]">
                    <TopBar />
                    {sample ? <SampleNotice /> : null}
                    <div className="flex min-h-0 flex-1">
                      <AdminGate>
                        <main
                          id="main-content"
                          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                        >
                          <FirstRunGate
                            org={tenantKey}
                            isAdmin={isAdmin}
                            onboardingPath={href("/onboarding")}
                          >
                            <CrmScopeGate>{children}</CrmScopeGate>
                          </FirstRunGate>
                        </main>
                      </AdminGate>
                      <AssistantPanel />
                    </div>
                  </SidebarInset>
                </SidebarProvider>
              </AssistantPanelProvider>
            </BreadcrumbProvider>
          </CommandPaletteProvider>
        </TooltipProvider>
      </AdminModeProvider>
    </NextIntlClientProvider>
  );
}

/**
 * `/settings` and `/admin/*` are admin-only, in Admin mode only. They read the
 * organization itself, so on the sample they open the upgrade dialog instead.
 */
function AdminGate({ children }: { children: ReactNode }) {
  const { adminMode } = useAdminMode();
  const sample = useSampleMode();
  const dispatch = useDispatch();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { href } = useSession();
  const gated = /\/platform\/[^/]+\/(admin|settings)(\/|$)/.test(pathname);
  const blocked = gated && (!adminMode || sample);

  useEffect(() => {
    if (!blocked) return;
    if (sample) dispatch(setOpenPricingModal(true));
    router.replace(href());
  }, [blocked, sample, dispatch, router, href]);

  if (blocked) return null;
  return <>{children}</>;
}
