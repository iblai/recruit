"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Menu, PanelLeft, Sparkles } from "lucide-react";
import { NotificationDropdown } from "@iblai/iblai-js/web-containers";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@iblai/iblai-js/web-containers/next";
import { UserMenu } from "@/components/crm/user-menu";
import { AdminModeSwitch } from "@/components/crm/admin-mode-switch";
import { Breadcrumbs } from "@/components/crm/breadcrumbs";
import { useAssistantPanel } from "@/components/recruit/chief-of-staff/assistant-panel";
import { useSession } from "@/hooks/use-session";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

/**
 * The top bar — the OS's navbar shape (h-16, white, `#D0E0FF` hairline):
 * sidebar toggle + breadcrumbs on the left; the Chief of Staff toggle, the
 * Admin switch, the SDK notification bell and the SDK profile dropdown on
 * the right.
 */
export function TopBar() {
  const router = useRouter();
  const { tenantKey, username, isAdmin, href } = useSession();
  const { toggleSidebar, isMobile } = useSidebar();
  const assistant = useAssistantPanel();

  const handleViewNotifications = useCallback(
    (notificationId?: string) => {
      router.push(href(`/notifications/${notificationId ?? ""}`));
    },
    [router, href],
  );

  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-[#D0E0FF] bg-white pr-3 pl-2 md:h-16 md:pr-4">
      <div className="flex min-w-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer text-[#5f5f61]"
                onClick={toggleSidebar}
                aria-label="Toggle sidebar"
              />
            }
          >
            {isMobile ? <Menu className="size-5" /> : <PanelLeft className="size-5" />}
          </TooltipTrigger>
          <TooltipContent side="bottom">Collapse or expand the sidebar (⌘B)</TooltipContent>
        </Tooltip>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        {!assistant.onHome ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={assistant.open ? "secondary" : "outline"}
                  size="sm"
                  onClick={assistant.toggle}
                  aria-pressed={assistant.open}
                  className={cn(
                    "h-8 gap-1.5",
                    assistant.open && "bg-[#eef6fc] text-[#0058cc] hover:bg-[#e2effa]",
                  )}
                />
              }
            >
              <Sparkles className="size-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">{VOCAB.chiefOfStaff}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {assistant.open ? "Hide" : "Ask"} the {VOCAB.chiefOfStaff} while you work on this page
            </TooltipContent>
          </Tooltip>
        ) : null}
        <AdminModeSwitch className="hidden md:flex" />
        {tenantKey && username ? (
          <NotificationDropdown
            org={tenantKey}
            userId={username}
            isAdmin={isAdmin}
            onViewNotifications={handleViewNotifications}
          />
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
