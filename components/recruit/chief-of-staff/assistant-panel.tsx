"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChiefOfStaffChat } from "@/components/recruit/chief-of-staff/chat";
import { ChiefOfStaffSetupCard } from "@/components/recruit/chief-of-staff/setup-card";
import { useSession } from "@/hooks/use-session";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import { VOCAB } from "@/lib/recruit/vocabulary";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "recruit.assistant.open";

type PanelState = {
  open: boolean;
  toggle: () => void;
  setOpen: (o: boolean) => void;
  onHome: boolean;
};

const PanelContext = createContext<PanelState>({
  open: false,
  toggle: () => {},
  setOpen: () => {},
  onHome: false,
});

export function useAssistantPanel() {
  return useContext(PanelContext);
}

/**
 * The Chief of Staff follows the team to every page as a right-hand panel.
 * Home shows the full conversation instead, so the panel hides itself there.
 * Open/closed is remembered per browser.
 */
export function AssistantPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { href } = useSession();
  const home = href();
  const onHome = pathname === home || pathname === `${home}/`;
  const [open, setOpenState] = useState(false);

  useEffect(() => {
    try {
      setOpenState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setOpen = useCallback((o: boolean) => {
    setOpenState(o);
    try {
      window.localStorage.setItem(STORAGE_KEY, o ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const value = useMemo(() => ({ open, toggle, setOpen, onHome }), [open, toggle, setOpen, onHome]);
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

/** The panel itself — mount once, to the right of the page content. */
export function AssistantPanel() {
  const { open, setOpen, onHome } = useAssistantPanel();
  const { agentId, isLoading } = useRecruitSettings();
  const [nonce, setNonce] = useState(0);
  if (onHome || !open) return null;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-l border-[var(--border-color,#e5e7eb)] bg-white",
        "fixed inset-y-0 right-0 z-30 max-w-[28rem] shadow-2xl md:static md:z-auto md:w-[26rem] md:max-w-none md:shadow-none xl:w-[30rem]",
      )}
      aria-label={VOCAB.chiefOfStaff}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="flex size-6 items-center justify-center rounded-md bg-[#eef6fc] text-[#0058cc]">
            <Sparkles className="size-3.5" />
          </span>
          {VOCAB.chiefOfStaff}
        </span>
        <span className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New conversation"
                  onClick={() => setNonce((n) => n + 1)}
                />
              }
            >
              <MessageSquarePlus />
            </TooltipTrigger>
            <TooltipContent side="bottom">Start a new conversation</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                />
              }
            >
              <X />
            </TooltipTrigger>
            <TooltipContent side="bottom">Close the panel</TooltipContent>
          </Tooltip>
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading && !agentId ? null : agentId ? (
          <PanelChat agentId={agentId} nonce={nonce} />
        ) : (
          <div className="overflow-auto">
            <ChiefOfStaffSetupCard compact />
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * The panel keeps its own "new conversation" counter instead of the URL, so
 * starting fresh does not navigate the page the user is working on. Keying
 * the chat on it is the one legitimate remount.
 */
function PanelChat({ agentId, nonce }: { agentId: string; nonce: number }) {
  return (
    <div key={nonce} className="flex min-h-0 flex-1 flex-col">
      <ChiefOfStaffChat agentId={agentId} />
    </div>
  );
}
