"use client";

import { usePathname, useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminMode } from "@/components/crm/admin-mode";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/** User / Admin view switch for org admins. Renders nothing for members. */
export function AdminModeSwitch({ className }: { className?: string }) {
  const { isAdmin, adminMode, setAdminMode } = useAdminMode();
  const { href } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  if (!isAdmin) return null;
  return (
    <div
      className={cn("text-muted-foreground flex items-center gap-2 text-xs font-medium", className)}
    >
      <span className={adminMode ? "" : "text-[#0058cc]"}>User</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Switch
              id="admin-mode"
              checked={adminMode}
              onCheckedChange={(on: boolean) => {
                setAdminMode(on);
                if (!on && /\/(admin|settings)(\/|$)/.test(pathname)) router.push(href());
              }}
              aria-label="Admin mode"
              className="data-[checked]:bg-[#0058cc]"
            />
          }
        />
        <TooltipContent side="bottom">
          Admin mode shows Settings and Users &amp; roles; User mode is what members see
        </TooltipContent>
      </Tooltip>
      <span className={adminMode ? "text-[#0058cc]" : ""}>Admin</span>
    </div>
  );
}
