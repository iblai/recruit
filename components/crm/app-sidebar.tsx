"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarCheck2,
  ChartColumn,
  ClipboardList,
  ExternalLink,
  Globe,
  School,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OrgSwitcher } from "@/components/crm/org-switcher";
import { useAdminMode } from "@/components/crm/admin-mode";
import { useCommandPalette } from "@/components/crm/command-palette";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  adminOnly?: boolean;
};

const WORKSPACE: NavItem[] = [
  { label: VOCAB.chiefOfStaff, path: "", icon: Sparkles, exact: true },
  { label: VOCAB.funnel.one, path: "/dashboard", icon: ChartColumn },
  { label: VOCAB.prospect.many, path: "/prospects", icon: Users },
  { label: VOCAB.school.many, path: "/schools", icon: School },
  { label: VOCAB.application.many, path: "/applications", icon: ClipboardList },
  { label: "Activities", path: "/activities", icon: CalendarCheck2 },
  { label: "Landing pages", path: "/landing-pages", icon: Globe },
  { label: "Tags", path: "/tags", icon: Tag },
];

const MANAGE: NavItem[] = [
  { label: "Notifications", path: "/notifications", icon: Bell },
  { label: "Settings", path: "/settings", icon: Settings, adminOnly: true },
  { label: "Users & roles", path: "/admin/users", icon: ShieldCheck, adminOnly: true },
];

/**
 * The sidebar — the OS's look (white, brand-blue active state, icon-only
 * collapsed mode) with Twenty's information architecture: an organization
 * switcher, search, the Chief of Staff, then the recruitment objects.
 */
export function AppSidebar() {
  const pathname = usePathname() ?? "/";
  const { href, tenantKey } = useSession();
  const { adminMode } = useAdminMode();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { open: openPalette } = useCommandPalette();

  const isActive = (item: NavItem) => {
    const target = href(item.path);
    if (item.exact) return pathname === target || pathname === `${target}/`;
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const renderItem = (item: NavItem) => {
    if (item.adminOnly && !adminMode) return null;
    const active = isActive(item);
    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          render={<Link href={href(item.path)} onClick={() => setOpenMobile(false)} />}
          isActive={active}
          tooltip={item.label}
          className={cn(
            "h-8 gap-2.5 rounded-md text-[13.5px] text-[#4a5568] hover:bg-[#f0f4fa] hover:text-gray-900",
            "data-[active=true]:bg-[#eef6fc] data-[active=true]:font-medium data-[active=true]:text-[#0058cc]",
          )}
        >
          <item.icon
            className={cn("size-4 shrink-0", active ? "text-[#0058cc]" : "text-[#5f5f61]")}
            strokeWidth={1.75}
          />
          <span className="truncate">{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-[#e6e6e8] bg-white">
      <SidebarHeader className="gap-2 px-2 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <OrgSwitcher collapsed={collapsed} />
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuButton
                    onClick={openPalette}
                    aria-label="Search"
                    className="text-muted-foreground h-8 gap-2.5 rounded-md border border-[#e6e6e8] bg-[#fafbfc] text-[13px] hover:bg-white hover:text-gray-900"
                  />
                }
              >
                <Search className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="flex-1 truncate text-left">Search…</span>
                <kbd className="text-muted-foreground rounded border border-[#e6e6e8] bg-white px-1 font-sans text-[10px] group-data-[collapsible=icon]:hidden">
                  ⌘K
                </kbd>
              </TooltipTrigger>
              <TooltipContent side="right">
                Search prospects, schools and applications — ⌘K
              </TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="px-0">
          <SidebarGroupLabel className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">{WORKSPACE.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-0">
          <SidebarGroupLabel className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Manage
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">{MANAGE.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuButton
                    render={
                      <a
                        href={`${config.osUrl()}/platform/${encodeURIComponent(tenantKey)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Agentic OS"
                      />
                    }
                    className="h-8 gap-2.5 rounded-md text-[13px] text-[#4a5568] hover:bg-[#f0f4fa]"
                  />
                }
              >
                <ExternalLink className="size-4 shrink-0 text-[#5f5f61]" strokeWidth={1.75} />
                <span className="truncate">Agentic OS</span>
              </TooltipTrigger>
              <TooltipContent side="right">Open this organization in the Agentic OS</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuButton
                    render={
                      <a
                        href={config.documentationUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Documentation"
                      />
                    }
                    className="h-8 gap-2.5 rounded-md text-[13px] text-[#4a5568] hover:bg-[#f0f4fa]"
                  />
                }
              >
                <BookOpen className="size-4 shrink-0 text-[#5f5f61]" strokeWidth={1.75} />
                <span className="truncate">Documentation</span>
              </TooltipTrigger>
              <TooltipContent side="right">
                Guides and API reference for ibl.ai/recruit — opens in a new tab
              </TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-2 flex items-center justify-center gap-1.5 px-1 group-data-[collapsible=icon]:hidden">
          <Image
            src="/images/iblai-logo.png"
            alt="ibl.ai"
            width={60}
            height={20}
            className="h-4 w-auto opacity-70"
          />
          <span className="text-muted-foreground text-[11px]">/recruit</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
