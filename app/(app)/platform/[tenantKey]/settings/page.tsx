"use client";

import { Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Info, Palette, Radio, Settings, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/crm/page-header";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { PipelinesTab } from "@/components/crm/settings/pipelines-tab";
import { LeadSourcesTab } from "@/components/crm/settings/lead-sources-tab";
import { AboutTab } from "@/components/crm/settings/about-tab";
import { ChiefOfStaffTab } from "@/components/recruit/settings/chief-of-staff-tab";
import { BrandingTab } from "@/components/recruit/settings/branding-tab";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { useSession } from "@/hooks/use-session";

const TABS = ["agent", "pipelines", "sources", "branding", "about"] as const;
type TabValue = (typeof TABS)[number];

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsView />
    </Suspense>
  );
}

function SettingsFallback() {
  return (
    <>
      <PageHeader
        icon={<Settings />}
        title="Settings"
        description="The Chief of Staff, funnels, sources and branding of this organization"
      />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </>
  );
}

function SettingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { href } = useSession();
  useBreadcrumbs([{ label: "Settings", href: href("/settings") }]);

  const tab = useMemo<TabValue>(() => {
    const raw = searchParams.get("tab");
    return TABS.includes(raw as TabValue) ? (raw as TabValue) : "agent";
  }, [searchParams]);

  const setTab = useCallback(
    (value: TabValue) => {
      router.replace(value === "agent" ? href("/settings") : `${href("/settings")}?tab=${value}`);
    },
    [router, href],
  );

  return (
    <>
      <PageHeader
        icon={<Settings />}
        title="Settings"
        description="The Chief of Staff, funnels, sources and branding of this organization"
      />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="gap-4">
          <TabsList variant="line" className="h-9 border-b border-gray-200 pb-1">
            <TabsTrigger value="agent">
              <Sparkles strokeWidth={1.75} /> {VOCAB.chiefOfStaff}
            </TabsTrigger>
            <TabsTrigger value="pipelines">
              <Filter strokeWidth={1.75} /> Funnels
            </TabsTrigger>
            <TabsTrigger value="sources">
              <Radio strokeWidth={1.75} /> Sources
            </TabsTrigger>
            <TabsTrigger value="branding">
              <Palette strokeWidth={1.75} /> Branding
            </TabsTrigger>
            <TabsTrigger value="about">
              <Info strokeWidth={1.75} /> About
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agent">
            <ChiefOfStaffTab />
          </TabsContent>
          <TabsContent value="pipelines">
            <PipelinesTab />
          </TabsContent>
          <TabsContent value="sources">
            <LeadSourcesTab />
          </TabsContent>
          <TabsContent value="branding">
            <BrandingTab />
          </TabsContent>
          <TabsContent value="about">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
