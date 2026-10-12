"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/crm/app-sidebar";
import { TopBar } from "@/components/crm/top-bar";
import { BreadcrumbProvider } from "@/components/crm/breadcrumbs";
import { CommandPaletteProvider } from "@/components/crm/command-palette";
import { AdminModeProvider, useAdminMode } from "@/components/crm/admin-mode";
import {
  AssistantPanel,
  AssistantPanelProvider,
} from "@/components/recruit/chief-of-staff/assistant-panel";
import { LoadingScreen } from "@/components/loading-screen";
import { useSession } from "@/hooks/use-session";

/**
 * Everything under `/platform/[tenantKey]` — the authenticated, org-scoped
 * recruitment workspace: sidebar + top bar around the page, with the Chief of
 * Staff available in a side panel on every page but Home (which is the full
 * conversation). The providers above us have already verified the session
 * and the org membership.
 */
export default function TenantLayout({ children }: { children: ReactNode }) {
  const { isAdmin, tenantKey } = useSession();
  // Sidebar open/closed state persists in a cookie (written by the shadcn
  // sidebar); read it once on the client.
  const [defaultOpen] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    const m = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/);
    return m ? m[1] === "true" : true;
  });

  if (!tenantKey) return <LoadingScreen />;

  return (
    <AdminModeProvider isAdmin={isAdmin}>
      <TooltipProvider>
        <CommandPaletteProvider>
          <BreadcrumbProvider>
            <AssistantPanelProvider>
              <SidebarProvider defaultOpen={defaultOpen}>
                <AppSidebar />
                <SidebarInset className="flex h-dvh min-w-0 flex-col overflow-hidden bg-[var(--sidebar-bg,#fafbfc)]">
                  <TopBar />
                  <div className="flex min-h-0 flex-1">
                    <AdminGate>
                      <main
                        id="main-content"
                        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                      >
                        {children}
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
  );
}

/** `/settings` and `/admin/*` are admin-only, in Admin mode only. */
function AdminGate({ children }: { children: ReactNode }) {
  const { adminMode } = useAdminMode();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { href } = useSession();
  const gated = /\/platform\/[^/]+\/(admin|settings)(\/|$)/.test(pathname);

  useEffect(() => {
    if (gated && !adminMode) router.replace(href());
  }, [gated, adminMode, router, href]);

  if (gated && !adminMode) return null;
  return <>{children}</>;
}
