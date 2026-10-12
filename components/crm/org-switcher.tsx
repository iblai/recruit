"use client";

import { Check, ChevronsUpDown, ExternalLink, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { useSession } from "@/hooks/use-session";
import { handleTenantSwitch } from "@/lib/iblai/auth-utils";
import { isUnnamedTenant, shortTenantKey, tenantDisplayName } from "@/lib/iblai/tenant";
import config from "@/lib/iblai/config";
import { cn } from "@/lib/utils";

/**
 * The organization switcher at the top of the sidebar — every org the user
 * belongs to (the whole set of tenants, exactly like os.ibl.ai). Switching
 * re-authenticates against the new org through the Auth SPA and lands on
 * `/platform/<org>`.
 */
export function OrgSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { tenantKey, tenants, currentTenant } = useSession();
  const name = tenantDisplayName(currentTenant) || "Organization";
  const unnamed = !currentTenant || isUnnamedTenant(currentTenant);
  // Avatar initials come from the key for unnamed orgs so two of them differ.
  const avatarName = unnamed ? shortTenantKey(tenantKey) : name;
  const others = tenants.filter((t) => t.key !== tenantKey);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className={cn(
              "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
              collapsed && "justify-center",
            )}
            aria-label="Switch organization"
          />
        }
      >
        <EntityAvatar name={avatarName} seed={tenantKey} kind="organization" size="md" />
        {!collapsed ? (
          <>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold text-gray-900">{name}</span>
              <span className="text-muted-foreground truncate text-[11px]">
                {currentTenant?.is_admin ? "Admin" : "Member"}
                {unnamed ? ` · ${shortTenantKey(tenantKey)}` : ""}
              </span>
            </div>
            <ChevronsUpDown className="text-muted-foreground ml-auto size-4" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--anchor-width] min-w-64 rounded-xl"
        align="start"
        side="bottom"
        sideOffset={6}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Organizations
          </DropdownMenuLabel>
          <DropdownMenuItem className="gap-2 p-2" disabled>
            <EntityAvatar name={avatarName} seed={tenantKey} kind="organization" size="sm" />
            <span className="flex-1 truncate font-medium text-gray-900">
              {name}
              {unnamed ? (
                <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                  {shortTenantKey(tenantKey)}
                </span>
              ) : null}
            </span>
            <Check className="size-4 text-[#0058cc]" />
          </DropdownMenuItem>
          {others.map((t) => (
            <DropdownMenuItem
              key={t.key}
              className="gap-2 p-2"
              onClick={() => void handleTenantSwitch(t.key)}
            >
              <EntityAvatar
                name={isUnnamedTenant(t) ? shortTenantKey(t.key) : tenantDisplayName(t)}
                seed={t.key}
                kind="organization"
                size="sm"
              />
              <span className="flex-1 truncate">
                {tenantDisplayName(t)}
                {isUnnamedTenant(t) ? (
                  <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                    {shortTenantKey(t.key)}
                  </span>
                ) : null}
              </span>
              {t.is_admin ? (
                <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-600">
                  admin
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-muted-foreground gap-2 p-2"
          onClick={() =>
            window.open(`${config.osUrl()}/platform/${tenantKey}`, "_blank", "noopener")
          }
        >
          <ExternalLink className="size-4" />
          Open in Agentic OS
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-muted-foreground gap-2 p-2"
          onClick={() => window.open("https://ibl.ai/join", "_blank", "noopener")}
        >
          <Plus className="size-4" />
          Create an organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
