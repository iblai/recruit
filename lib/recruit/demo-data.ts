/**
 * The demo recruitment workspace: the inputs `pnpm seed:demo` writes into an
 * organization, and the sample recruit shows on the community organization
 * (`lib/recruit/sample/`). Relative imports only (CLI scripts use it).
 */
import type { LifecycleStage } from "../crm/types";

export const DEMO_TERM = "Fall 2027";
export const DEMO_INSTITUTION = "Northfield University";

export interface DemoProspect {
  name: string;
  email: string;
  program: string;
  /** Index into `DEMO_SCHOOLS`. */
  school: number;
  /** An admissions stage code (`ADMISSIONS_STAGES`). */
  stage: string;
  tags: readonly string[];
  grad: string;
  residency: string;
  entry?: string;
}

export const DEMO_TAGS = [
  ["Honors", "#7c3aed"],
  ["First-gen", "#0891b2"],
  ["Athlete", "#ea580c"],
  ["Legacy", "#059669"],
  ["Web inquiry", "#0058cc"],
] as const;

export const DEMO_SCHOOLS = [
  { name: "Lincoln High School", city: "Austin", state: "TX", type: "high_school" },
  { name: "Westbrook Community College", city: "Portland", state: "OR", type: "community_college" },
  { name: "St. Catherine Academy", city: "Chicago", state: "IL", type: "high_school" },
];

export const DEMO_PROSPECTS: readonly DemoProspect[] = [
  {
    name: "Ada Lovelace",
    email: "ada.lovelace@example.edu",
    program: "B.S. Computer Science",
    school: 0,
    stage: "admitted",
    tags: ["Honors"],
    grad: "2027",
    residency: "in_state",
  },
  {
    name: "Marcus Chen",
    email: "marcus.chen@example.edu",
    program: "B.A. Economics",
    school: 0,
    stage: "applied",
    tags: [],
    grad: "2027",
    residency: "in_state",
  },
  {
    name: "Priya Natarajan",
    email: "priya.n@example.edu",
    program: "B.S. Nursing",
    school: 2,
    stage: "deposited",
    tags: ["First-gen"],
    grad: "2027",
    residency: "out_of_state",
  },
  {
    name: "Diego Alvarez",
    email: "diego.alvarez@example.edu",
    program: "B.S. Mechanical Engineering",
    school: 1,
    stage: "engaged",
    tags: ["Athlete"],
    grad: "2026",
    residency: "out_of_state",
    entry: "transfer",
  },
  {
    name: "Hannah Okafor",
    email: "hannah.okafor@example.edu",
    program: "B.F.A. Design",
    school: 2,
    stage: "inquiry",
    tags: ["Web inquiry"],
    grad: "2028",
    residency: "out_of_state",
  },
  {
    name: "Liam O'Connor",
    email: "liam.oconnor@example.edu",
    program: "B.S. Biology",
    school: 0,
    stage: "applied",
    tags: ["Legacy"],
    grad: "2027",
    residency: "in_state",
  },
  {
    name: "Sofia Rossi",
    email: "sofia.rossi@example.edu",
    program: "B.A. International Relations",
    school: 2,
    stage: "admitted",
    tags: ["Honors", "First-gen"],
    grad: "2027",
    residency: "international",
  },
  {
    name: "Noah Williams",
    email: "noah.williams@example.edu",
    program: "B.S. Business",
    school: 1,
    stage: "enrolled",
    tags: [],
    grad: "2026",
    residency: "in_state",
    entry: "transfer",
  },
  {
    name: "Mei Tanaka",
    email: "mei.tanaka@example.edu",
    program: "B.S. Data Science",
    school: 0,
    stage: "engaged",
    tags: ["Honors"],
    grad: "2027",
    residency: "international",
  },
  {
    name: "Jamal Robinson",
    email: "jamal.robinson@example.edu",
    program: "B.S. Kinesiology",
    school: 2,
    stage: "withdrawn",
    tags: ["Athlete"],
    grad: "2027",
    residency: "out_of_state",
  },
  {
    name: "Emma Johansson",
    email: "emma.johansson@example.edu",
    program: "B.A. Psychology",
    school: 0,
    stage: "inquiry",
    tags: ["Web inquiry"],
    grad: "2028",
    residency: "in_state",
  },
  {
    name: "Carlos Mendes",
    email: "carlos.mendes@example.edu",
    program: "B.S. Civil Engineering",
    school: 1,
    stage: "applied",
    tags: ["First-gen"],
    grad: "2026",
    residency: "in_state",
    entry: "transfer",
  },
];

/** The CRM lifecycle a prospect's admissions stage implies. */
export function lifecycleFor(stage: string): LifecycleStage {
  if (stage === "enrolled") return "customer";
  if (stage === "withdrawn") return "churned";
  if (["applied", "admitted", "deposited"].includes(stage)) return "opportunity";
  return stage === "engaged" ? "qualified" : "lead";
}

/** The published "Request information" landing page, for `newLandingPage`. */
export function demoLandingPage(term: string) {
  return {
    title: "Request information",
    slug: "request-information",
    headline: "Find your place here.",
    subheadline: `Tell us a little about yourself and an admissions counselor will reach out about ${term}.`,
    pipelineCode: "admissions",
    stageCode: "inquiry",
    term,
    tags: ["Web inquiry"],
    published: true,
  };
}

export const DEMO_TIME_ZONE = "America/New_York";

/** The instant a wall-clock hour is, on a UTC calendar day, in `timeZone`. */
function zoned(day: Date, hour: number, timeZone: string): Date {
  const guess = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
  }).formatToParts(new Date(guess));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"));
  return new Date(guess - (shown - guess));
}

/**
 * The published nursing open house, for `newLandingPage`: the first Saturday
 * at least two weeks out, 10 a.m. to 1 p.m., sign-ups until the Tuesday before.
 */
export function demoOpenHouse(term: string, now = new Date()) {
  const day = new Date(now.getTime() + 14 * 86_400_000);
  while (day.getUTCDay() !== 6) day.setUTCDate(day.getUTCDate() + 1);
  const startsAt = zoned(day, 10, DEMO_TIME_ZONE);
  const tuesday = new Date(day.getTime() - 4 * 86_400_000);
  return {
    title: "Nursing open house",
    slug: "nursing-open-house",
    headline: "See where you will learn to be a nurse.",
    subheadline: "Tour the Simulation Lab and meet nursing faculty and students.",
    highlights: [
      "Tour the Simulation Lab in Harper Hall",
      "Meet nursing faculty and current students",
      "Ask about direct admission and what comes next",
    ],
    ctaLabel: "Save my seat",
    successTitle: "Your seat is saved",
    successMessage: "We look forward to meeting you.",
    program: "B.S. Nursing",
    term,
    pipelineCode: "admissions",
    stageCode: "inquiry",
    tags: ["Open house"],
    published: true,
    event: {
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3 * 3_600_000).toISOString(),
      timeZone: DEMO_TIME_ZONE,
      place: "Simulation Lab, Harper Hall",
      signUpBy: new Date(zoned(tuesday, 23, DEMO_TIME_ZONE).getTime() + 59 * 60_000).toISOString(),
    },
  };
}
