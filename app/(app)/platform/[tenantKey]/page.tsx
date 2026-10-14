"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChartColumn,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/crm/page-header";
import { LoadingScreen } from "@/components/loading-screen";
import { TodayBrief } from "@/components/recruit/chief-of-staff/brief";
import { ChiefOfStaffChat } from "@/components/recruit/chief-of-staff/chat";
import { ChiefOfStaffSetupCard } from "@/components/recruit/chief-of-staff/setup-card";
import { useSession } from "@/hooks/use-session";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

const BRIEF_KEY = "recruit.home.brief";

/**
 * Home is a conversation with the Chief of Staff — the agent every member of
 * the recruitment team works through — with today's numbers beside it. The
 * agent is the one an admin set up for this organization (or the one pinned
 * by NEXT_PUBLIC_DEFAULT_AGENT_ID); without one, the setup card takes its place.
 */
export default function HomePage() {
  const router = useRouter();
  const { href, displayName } = useSession();
  const { agentId, isLoading } = useRecruitSettings();
  const [showBrief, setShowBrief] = useState(true);

  useEffect(() => {
    try {
      setShowBrief(window.localStorage.getItem(BRIEF_KEY) !== "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleBrief = () => {
    setShowBrief((v) => {
      try {
        window.localStorage.setItem(BRIEF_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  return (
    <>
      <PageHeader
        icon={<Sparkles />}
        title={VOCAB.chiefOfStaff}
        description={`Good to see you${displayName ? `, ${displayName.split(" ")[0]}` : ""} — ask about prospects, applications, deadlines, or hand off the follow-ups`}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="outline" size="sm" render={<Link href={href("/dashboard")} />} />
                }
              >
                <ChartColumn data-icon="inline-start" /> {VOCAB.funnel.one}
              </TooltipTrigger>
              <TooltipContent side="bottom">The full funnel dashboard</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden xl:inline-flex"
                    onClick={toggleBrief}
                    aria-pressed={showBrief}
                  />
                }
              >
                {showBrief ? (
                  <PanelRightClose data-icon="inline-start" />
                ) : (
                  <PanelRightOpen data-icon="inline-start" />
                )}
                Today
              </TooltipTrigger>
              <TooltipContent side="bottom">Show or hide today&apos;s brief</TooltipContent>
            </Tooltip>
            {agentId ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      className="ibl-button-primary"
                      onClick={() => router.push(`${href()}?new=${Date.now().toString(36)}`)}
                    />
                  }
                >
                  <MessageSquarePlus data-icon="inline-start" /> New conversation
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Start a fresh thread with the {VOCAB.chiefOfStaff}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {isLoading && !agentId ? (
            <LoadingScreen className="min-h-0 flex-1" />
          ) : agentId ? (
            <ChiefOfStaffChat agentId={agentId} />
          ) : (
            <div className="flex-1 overflow-auto">
              <ChiefOfStaffSetupCard />
            </div>
          )}
        </div>
        <aside
          className={cn(
            "hidden w-80 shrink-0 overflow-auto border-l border-[var(--border-color,#e5e7eb)] bg-[var(--sidebar-bg,#fafbfc)]",
            showBrief && "xl:block",
          )}
          aria-label="Today's brief"
        >
          <TodayBrief />
        </aside>
      </div>
    </>
  );
}
