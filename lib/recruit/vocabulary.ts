/**
 * Recruitment vocabulary for the ibl.ai CRM nouns.
 *
 * The platform's CRM API speaks sales (persons, organizations, deals, won /
 * lost, lead value). ibl.ai/recruit keeps those names in code — `lib/crm/*`,
 * the RTK slice, the types — and shows admissions language everywhere a
 * human reads it. Import from here instead of hard-coding a label so the
 * whole app changes together.
 *
 *   CRM API noun            UI noun
 *   ----------------------  ------------------------------------------
 *   Person                  Prospect (a student, applicant or contact)
 *   Organization            School (high school, college, CBO, agency…)
 *   Deal                    Application (one prospect × one program/term)
 *   Pipeline                Funnel
 *   Stage                   Stage
 *   Lead source             Source
 *   Owner                   Counselor
 *   Deal won / lost         Enrolled / Withdrawn
 *   lead_value              Estimated net tuition
 *   expected_close_date     Decision deadline
 *   lifecycle_stage         Inquiry → Engaged → Applicant → Enrolled · Withdrawn
 *
 * The ibl.ai *organization* (the tenant that signs in) keeps the word
 * "organization"; only the CRM Organization record becomes a School.
 */

export const VOCAB = {
  prospect: { one: "Prospect", many: "Prospects", lower: "prospect", lowerMany: "prospects" },
  school: { one: "School", many: "Schools & partners", lower: "school", lowerMany: "schools" },
  application: {
    one: "Application",
    many: "Applications",
    lower: "application",
    lowerMany: "applications",
  },
  funnel: { one: "Funnel", many: "Funnels", lower: "funnel", lowerMany: "funnels" },
  source: { one: "Source", many: "Sources", lower: "source", lowerMany: "sources" },
  counselor: { one: "Counselor", many: "Counselors", lower: "counselor", lowerMany: "counselors" },
  won: "Enrolled",
  lost: "Withdrawn",
  value: "Est. net tuition",
  deadline: "Decision deadline",
  intendedProgram: "Intended program",
  chiefOfStaff: "Chief of Staff",
} as const;

/** `lifecycle_stage` of a person, in admissions words. */
export const LIFECYCLE_LABELS = {
  lead: "Inquiry",
  qualified: "Engaged",
  opportunity: "Applicant",
  customer: "Enrolled",
  churned: "Withdrawn",
} as const;

/** `type` of an activity, in admissions words (`lunch` is the campus/school visit). */
export const ACTIVITY_LABELS = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  note: "Note",
  task: "Task",
  lunch: "Visit",
  deadline: "Deadline",
} as const;

/** Deal status, in admissions words. */
export const STATUS_LABELS = { open: "Open", won: VOCAB.won, lost: VOCAB.lost } as const;

/** The app's slug under `metadata.apps.<slug>` in the org's metadata object. */
export const APP_SLUG = "recruit";
