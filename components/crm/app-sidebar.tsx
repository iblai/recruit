"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  CalendarCheck2,
  ChartColumn,
  ClipboardList,
  Globe,
  School,
  Search,
  Settings,
  Sparkles,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LOGO_ENDPOINTS } from "@iblai/iblai-js/data-layer";
import { InviteUserDialog } from "@iblai/iblai-js/web-containers";
import {
  PLATFORM_SIDEBAR_NAV_MUTED,
  PlatformAccountSheet,
  PlatformSidebar,
  PlatformSidebarCollapsedLabelFlyout,
  type PlatformAccountTab,
  type PlatformSidebarFooterActionId,
  type PlatformSidebarSectionConfig,
  type PlatformSidebarSectionContext,
} from "@iblai/iblai-js/web-containers/next";
import { selectRbacPermissions, type Tenant } from "@iblai/iblai-js/web-utils";
import { useAdminMode } from "@/components/crm/admin-mode";
import { useCommandPalette } from "@/components/crm/command-palette";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { tenantDisplayName } from "@/lib/iblai/tenant";
import type { IblaiRootState } from "@/store/iblai-store";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  adminOnly?: boolean;
};

const WORKSPACE: NavItem[] = [
  { label: "Home", path: "", icon: Sparkles, exact: true },
  { label: "Funnel", path: "/dashboard", icon: ChartColumn },
  { label: "Prospects", path: "/prospects", icon: Users },
  { label: "Schools", path: "/schools", icon: School },
  { label: "Applications", path: "/applications", icon: ClipboardList },
  { label: "Activities", path: "/activities", icon: CalendarCheck2 },
  { label: "Pages", path: "/landing-pages", icon: Globe },
  { label: "Tags", path: "/tags", icon: Tag },
  { label: "Settings", path: "/settings", icon: Settings, adminOnly: true },
];

/**
 * The sidebar is the SDK's cross-SPA `PlatformSidebar` — the same shell as
 * os.ibl.ai: the organization's logo in the header, a primary action, the
 * app's own navigation in the middle, and the invariant footer cluster
 * (Notifications, Invites, Management, Integrations, Monetization,
 * Advanced, Support) with the platform's admin / RBAC visibility rules.
 * Footer actions open the SDK's organization sheets in place, exactly like
 * the OS.
 */
export function AppSidebar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { href, tenantKey, username, email, isAdmin, currentTenant } = useSession();
  const { adminMode } = useAdminMode();
  const { open: openPalette } = useCommandPalette();
  const rbacPermissions = useSelector((s: IblaiRootState) => selectRbacPermissions(s));
  const [sheet, setSheet] = useState<PlatformAccountTab | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const onFooterAction = useCallback(
    (id: PlatformSidebarFooterActionId) => {
      if (id === "notifications") router.push(href("/notifications"));
      else if (id === "invites") setInviteOpen(true);
      else setSheet(id);
    },
    [router, href],
  );

  const sections = useMemo<PlatformSidebarSectionConfig[]>(
    () => [
      {
        type: "custom",
        id: "recruit-nav",
        render: (ctx) => (
          <RecruitNav
            ctx={ctx}
            pathname={pathname}
            href={href}
            adminMode={adminMode}
            onSearch={openPalette}
          />
        ),
      },
    ],
    [pathname, href, adminMode, openPalette],
  );

  return (
    <>
      <PlatformSidebar
        logo={
          <TenantLogo
            tenantKey={tenantKey}
            name={tenantDisplayName(currentTenant)}
            homeHref={href()}
          />
        }
        primaryAction={{
          label: "New conversation",
          icon: Sparkles,
          onClick: () => router.push(`${href()}?new=${Date.now().toString(36)}`),
        }}
        sections={sections}
        footer={{
          isAdmin,
          isLiveAdmin: isAdmin && adminMode,
          enableRbac: config.enableRBAC(),
          rbacPermissions: rbacPermissions ?? {},
          tenantKey,
          currentTenant: (currentTenant as unknown as Tenant | undefined) ?? null,
          notificationsAllowed: true,
          invitesUserTypeAllowed: true,
          supportUrl: config.helpCenterUrl(),
          onAction: onFooterAction,
        }}
      />
      <PlatformAccountSheet
        tab={sheet}
        onClose={() => setSheet(null)}
        tenantKey={tenantKey}
        username={username}
        email={email}
        onInviteClick={() => setInviteOpen(true)}
        mainPlatformKey={config.mainTenantKey()}
        authUrl={config.authUrl()}
        currentSpa="recruit"
        platformBaseDomain={config.platformBaseDomain()}
        rbacPermissions={rbacPermissions ?? {}}
      />
      <InviteUserDialog
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        tenant={tenantKey}
      />
    </>
  );
}

/**
 * The organization's own logo, served by the platform for every tenant
 * (`/api/core/orgs/<org>/logo`, the same source os.ibl.ai uses). Falls back
 * to the organization's name while it loads or when none was uploaded.
 */
function TenantLogo({
  tenantKey,
  name,
  homeHref,
}: {
  tenantKey: string;
  name: string;
  homeHref: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = tenantKey ? LOGO_ENDPOINTS.light_logo(tenantKey) : "";
  return (
    <Link
      href={homeHref}
      className="flex min-w-0 items-center justify-center"
      aria-label={`${name || "Home"} — home`}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || tenantKey}
          className="h-8 w-auto max-w-[9.5rem] object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex items-center gap-1.5">
          <Image
            src="/images/iblai-logo.png"
            alt=""
            width={60}
            height={20}
            className="h-4 w-auto"
          />
          <span className="truncate text-[13px] font-semibold text-gray-900">
            {name || "ibl.ai"}
          </span>
        </span>
      )}
    </Link>
  );
}

/** The app's navigation, rendered inside the SDK shell with its palette. */
function RecruitNav({
  ctx,
  pathname,
  href,
  adminMode,
  onSearch,
}: {
  ctx: PlatformSidebarSectionContext;
  pathname: string;
  href: (path?: string) => string;
  adminMode: boolean;
  onSearch: () => void;
}) {
  const isActive = (item: NavItem) => {
    const target = href(item.path);
    if (item.exact) return pathname === target || pathname === `${target}/`;
    return pathname === target || pathname.startsWith(`${target}/`);
  };
  const items = WORKSPACE.filter((i) => !i.adminOnly || adminMode);

  if (ctx.collapsed) {
    return (
      <>
        <PlatformSidebarCollapsedLabelFlyout label="Search ⌘K">
          <button
            type="button"
            onClick={onSearch}
            aria-label="Search"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-[#5f5f61] transition-colors hover:bg-[#f0f0f0]"
          >
            <Search className="size-4" strokeWidth={1.5} />
          </button>
        </PlatformSidebarCollapsedLabelFlyout>
        {items.map((item) => {
          const active = isActive(item);
          return (
            <PlatformSidebarCollapsedLabelFlyout key={item.path} label={item.label}>
              <Link
                href={href(item.path)}
                onClick={ctx.onAfterNav}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-[#f0f0f0]",
                  active ? "bg-[#cfe8fa]/40 text-[#0058cc]" : "text-[#5f5f61]",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.5} />
              </Link>
            </PlatformSidebarCollapsedLabelFlyout>
          );
        })}
      </>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-[#e0e0e2] bg-white px-2 text-left text-[14px] font-normal text-[#687482] transition-colors hover:bg-[#f8f8f9]"
      >
        <Search
          className="size-4 shrink-0"
          strokeWidth={1.5}
          style={{ color: PLATFORM_SIDEBAR_NAV_MUTED }}
        />
        <span className="min-w-0 flex-1 truncate">Search…</span>
        <kbd className="rounded border border-[#e0e0e2] bg-[#fafafa] px-1 font-sans text-[10px] text-[#7d7e82]">
          ⌘K
        </kbd>
      </button>
      <ul className="flex flex-col gap-0.5 pt-1">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.path}>
              <Link
                href={href(item.path)}
                onClick={ctx.onAfterNav}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-[14px] font-normal transition-colors",
                  active
                    ? "bg-[#cfe8fa]/40 font-medium text-[#0058cc] hover:bg-[#cfe8fa]/50"
                    : "text-[#5f5f61] hover:bg-[#f4f4f4]",
                )}
              >
                <item.icon
                  className="size-4 shrink-0"
                  strokeWidth={1.5}
                  style={{ color: active ? "#0058cc" : PLATFORM_SIDEBAR_NAV_MUTED }}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
