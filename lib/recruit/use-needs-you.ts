"use client";

import { useMemo } from "react";
import { useAdminMode } from "@/components/crm/admin-mode";
import { useSession } from "@/hooks/use-session";
import { useListActivitiesQuery, useListWebFormsQuery } from "@/lib/crm/api";
import type { Activity } from "@/lib/crm/types";
import { fromWebForm } from "./landing-pages";

// ponytail: the first 100 of each kind; page through when a team keeps more than that open.
const OPEN = { is_done: false, page_size: 100, ordering: "-created_at" } as const;
// ponytail: asked again each minute; a push once the platform notifies an app of its own records.
const LIVE = { pollingInterval: 60_000 } as const;

/**
 * What waits for a person: shortlists of students an agent found, handoffs from Recruit, messages an agent wrote, and
 * (for an admin) pages not yet published. A counselor sees their own and the
 * unassigned; an admin in Admin mode sees everyone's.
 */
export function useNeedsYou() {
  const { userId } = useSession();
  const { adminMode } = useAdminMode();
  const handoffs = useListActivitiesQuery({ ...OPEN, metadata__has_key: "handoff" }, LIVE);
  const followUps = useListActivitiesQuery({ ...OPEN, metadata__has_key: "follow_up" }, LIVE);
  const shortlists = useListActivitiesQuery({ ...OPEN, metadata__has_key: "shortlist" }, LIVE);
  const forms = useListWebFormsQuery(undefined, { skip: !adminMode });

  return useMemo(() => {
    const mine = (a: Activity) => adminMode || a.owner == null || a.owner === userId;
    const out = {
      shortlists: (shortlists.data?.results ?? []).filter(mine),
      handoffs: (handoffs.data?.results ?? []).filter(mine),
      followUps: (followUps.data?.results ?? []).filter(mine),
      pages: (forms.data?.results ?? []).map(fromWebForm).filter((p) => !p.published),
    };
    return {
      ...out,
      count: out.shortlists.length + out.handoffs.length + out.followUps.length + out.pages.length,
      isLoading:
        shortlists.isLoading || handoffs.isLoading || followUps.isLoading || forms.isLoading,
      error: shortlists.error ?? handoffs.error ?? followUps.error,
    };
  }, [shortlists, handoffs, followUps, forms, adminMode, userId]);
}
