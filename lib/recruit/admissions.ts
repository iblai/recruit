/**
 * The admissions funnel recruit sets up on an organization: nothing of the
 * platform's own CRM (its default pipeline and sources) is recruit's.
 * Relative imports only (CLI scripts use it).
 */
import type { LeadSourceInput, PipelineInput, PipelineStageInput } from "../crm/types";

type Named = { code: string; name: string };

export const ADMISSIONS_FUNNEL: PipelineInput & Named = {
  name: "Admissions",
  code: "admissions",
  rotten_days: 14,
};

export const ADMISSIONS_STAGES: (PipelineStageInput & Named)[] = [
  { code: "inquiry", name: "Inquiry", probability: 10 },
  { code: "engaged", name: "Engaged", probability: 25 },
  { code: "applied", name: "Applied", probability: 45 },
  { code: "admitted", name: "Admitted", probability: 65 },
  { code: "deposited", name: "Deposited", probability: 90 },
  { code: "enrolled", name: "Enrolled", probability: 100, is_won: true },
  { code: "withdrawn", name: "Withdrawn", probability: 0, is_lost: true },
];

export const ADMISSIONS_SOURCES: (LeadSourceInput & Named)[] = [
  { code: "college_fair", name: "College fair" },
  { code: "school_visit", name: "School visit" },
  { code: "campus_tour", name: "Campus tour" },
  { code: "common_app", name: "Common App" },
  { code: "referral", name: "Referral" },
  { code: "web", name: "Website" },
];
