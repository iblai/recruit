"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  errorMessage,
  useCreateLeadSourceMutation,
  useCreatePipelineMutation,
  useCreateStageMutation,
} from "@/lib/crm/api";
import type { LeadSource } from "@/lib/crm/types";
import { ADMISSIONS_FUNNEL, ADMISSIONS_SOURCES, ADMISSIONS_STAGES } from "@/lib/recruit/admissions";

/** Creates recruit's admissions funnel, its stages, and the sources it doesn't have yet. */
export function SetUpAdmissions({ sources }: { sources: LeadSource[] }) {
  const [createPipeline] = useCreatePipelineMutation();
  const [createStage] = useCreateStageMutation();
  const [createSource] = useCreateLeadSourceMutation();
  const [busy, setBusy] = useState(false);

  async function setUp() {
    setBusy(true);
    try {
      const funnel = await createPipeline({ ...ADMISSIONS_FUNNEL, is_default: true }).unwrap();
      for (const [i, stage] of ADMISSIONS_STAGES.entries())
        await createStage({ pipeline: funnel.id, body: { ...stage, sort_order: i } }).unwrap();
      const have = new Set(sources.map((s) => s.code));
      for (const source of ADMISSIONS_SOURCES)
        if (!have.has(source.code)) await createSource(source).unwrap();
      toast.success("The admissions funnel is ready");
    } catch (e) {
      toast.error(errorMessage(e, "Could not set up the admissions funnel"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button className="ibl-button-primary" onClick={setUp} disabled={busy}>
      <Plus data-icon="inline-start" /> {busy ? "Setting up…" : "Set up admissions"}
    </Button>
  );
}
