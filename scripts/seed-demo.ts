/**
 * Seed a demo recruitment workspace into an organization: a Fall admissions
 * funnel, sources, tags, three schools, a dozen prospects with applications
 * and activities, and a published "Request information" landing page.
 *
 *   pnpm seed:demo --org <org-key> [--term "Fall 2027"] [--app-url https://…]
 *
 * It asks for the credential to act with (an org admin's Platform API key, or
 * `Token <session token>`) and keeps it nowhere.
 *
 * Idempotent-ish: funnel, sources, tags and schools are found or created;
 * prospects are matched by email so a re-run does not duplicate them.
 */
import { askAuthorization, bootstrap, argValue } from "./_env";
import { CrmServer } from "../lib/recruit/crm-server";
import { newLandingPage, landingPageUrl, toWebForm } from "../lib/recruit/landing-pages";
import { applicationTitle } from "../lib/recruit/fields";
import { readRecruitSettingsServer, writeRecruitSettings } from "../lib/recruit/settings-server";

const { org } = bootstrap();
const term = argValue("--term") ?? "Fall 2027";
const appUrl = (
  argValue("--app-url") ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");
const log = (s: string) => console.log(`  • ${s}`);

const STAGES = [
  { code: "inquiry", name: "Inquiry", probability: 10 },
  { code: "engaged", name: "Engaged", probability: 25 },
  { code: "applied", name: "Applied", probability: 45 },
  { code: "admitted", name: "Admitted", probability: 65 },
  { code: "deposited", name: "Deposited", probability: 90 },
  { code: "enrolled", name: "Enrolled", probability: 100, is_won: true },
  { code: "withdrawn", name: "Withdrawn", probability: 0, is_lost: true },
];

const SOURCES = [
  ["college_fair", "College fair"],
  ["school_visit", "School visit"],
  ["campus_tour", "Campus tour"],
  ["common_app", "Common App"],
  ["referral", "Referral"],
  ["web", "Website"],
] as const;

const TAGS = [
  ["Honors", "#7c3aed"],
  ["First-gen", "#0891b2"],
  ["Athlete", "#ea580c"],
  ["Legacy", "#059669"],
  ["Web inquiry", "#0058cc"],
] as const;

const SCHOOLS = [
  { name: "Lincoln High School", city: "Austin", state: "TX", type: "high_school" },
  { name: "Westbrook Community College", city: "Portland", state: "OR", type: "community_college" },
  { name: "St. Catherine Academy", city: "Chicago", state: "IL", type: "high_school" },
];

const PROSPECTS = [
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

async function main() {
  const authorization = await askAuthorization();
  const crm = new CrmServer(org, authorization);
  console.log(`\nSeeding a demo recruitment workspace into "${org}" (${term})\n`);

  // Funnel
  const pipelines = await crm.listPipelines();
  let funnel = pipelines.find((p) => p.code === "admissions");
  if (!funnel) {
    funnel = await crm.createPipeline({
      name: `Admissions ${term}`,
      code: "admissions",
      // The platform allows one default; the landing page names this funnel by code.
      is_default: !pipelines.some((p) => p.is_default),
      rotten_days: 14,
    });
    log(`Created funnel "${funnel.name}"`);
  } else log(`Funnel "${funnel.name}" exists`);
  const existingStages = new Map((funnel.stages ?? []).map((s) => [s.code, s]));
  const stageByCode = new Map<string, number>();
  for (const [i, s] of STAGES.entries()) {
    const have = existingStages.get(s.code);
    if (have) {
      stageByCode.set(s.code, have.id);
      continue;
    }
    const created = await crm.createStage(funnel.id, { ...s, sort_order: i });
    stageByCode.set(s.code, created.id);
    log(`Stage ${s.name}`);
  }

  // Sources, tags, schools
  const sources = new Map<string, number>();
  for (const [code, name] of SOURCES)
    sources.set(code, (await crm.findOrCreateLeadSource(code, name)).id);
  const tags = new Map<string, number>();
  for (const [name, color] of TAGS) tags.set(name, (await crm.findOrCreateTag(name, color)).id);
  const schools: string[] = [];
  for (const s of SCHOOLS) {
    const o = await crm.findOrCreateOrganization(s.name, {
      address: { city: s.city, state: s.state, country: "United States" },
      metadata: { school_type: s.type },
    });
    schools.push(o.id);
  }
  log(`${SOURCES.length} sources, ${TAGS.length} tags, ${SCHOOLS.length} schools`);

  // Prospects + applications + activities
  const sourceCodes = [...sources.keys()];
  const now = Date.now();
  for (const [i, p] of PROSPECTS.entries()) {
    let person = await crm.findPersonByEmail(p.email);
    const lifecycle =
      p.stage === "enrolled"
        ? "customer"
        : p.stage === "withdrawn"
          ? "churned"
          : ["applied", "admitted", "deposited"].includes(p.stage)
            ? "opportunity"
            : p.stage === "engaged"
              ? "qualified"
              : "lead";
    if (!person) {
      person = await crm.createPerson({
        name: p.name,
        primary_email: p.email,
        contact_numbers: [`+1 512 555 01${String(i).padStart(2, "0")}`],
        job_title: p.program,
        organization: schools[p.school],
        lifecycle_stage: lifecycle,
        metadata: {
          graduation_year: p.grad,
          entry_term: term,
          entry_type: p.entry ?? "first_year",
          residency: p.residency,
          gpa: Number((3.2 + (i % 8) / 10).toFixed(1)),
        },
      });
      for (const t of p.tags) await crm.attachTag("persons", person.id, tags.get(t) as number);
      const deal = await crm.createDeal({
        title: applicationTitle(p.name, p.program, term),
        person: person.id,
        organization: schools[p.school],
        pipeline: funnel.id,
        stage: stageByCode.get(
          p.stage === "enrolled" || p.stage === "withdrawn" ? "applied" : p.stage,
        ) as number,
        source: sources.get(sourceCodes[i % sourceCodes.length]) ?? null,
        expected_close_date: new Date(now + (20 + i * 5) * 86400000).toISOString().slice(0, 10),
        lead_value: String(18000 + (i % 5) * 2500),
        currency: "USD",
        metadata: {
          program: p.program,
          term,
          entry_type: p.entry ?? "first_year",
          financial_aid: i % 2 === 0,
        },
      });
      if (p.stage === "enrolled") await crm.markDealWon(deal.id);
      if (p.stage === "withdrawn") await crm.markDealLost(deal.id, "Chose another institution");
      await crm.createActivity({
        type: i % 3 === 0 ? "call" : i % 3 === 1 ? "email" : "lunch",
        title: i % 3 === 2 ? "Campus tour" : "Intro conversation",
        comment: "Seeded by scripts/seed-demo.ts",
        person: person.id,
        deal: deal.id,
        is_done: true,
      });
      if (i % 2 === 0) {
        await crm.createActivity({
          type: "task",
          title: `Follow up with ${p.name.split(" ")[0]} about ${p.program.replace(/^B\.[A-Z.]+\s/, "")}`,
          person: person.id,
          deal: deal.id,
          schedule_from: new Date(now + (i - 4) * 86400000).toISOString(),
          is_done: false,
        });
      }
      log(`${p.name} → ${p.stage}`);
    } else log(`${p.name} exists — skipped`);
  }

  // Landing page
  const forms = await crm.listWebForms();
  if (!forms.some((f) => f.slug === "request-information")) {
    const page = newLandingPage({
      title: "Request information",
      slug: "request-information",
      headline: "Find your place here.",
      subheadline: `Tell us a little about yourself and an admissions counselor will reach out about ${term}.`,
      pipelineCode: "admissions",
      stageCode: "inquiry",
      term,
      tags: ["Web inquiry"],
      published: true,
    });
    await crm.createWebForm(toWebForm(page));
    log(`Published landing page ${landingPageUrl(appUrl, org, page.slug)}`);
  } else log("Landing page exists");
  const settings = await readRecruitSettingsServer(org);
  if (!settings.institutionName)
    await writeRecruitSettings(org, { institutionName: "Northfield University" }, authorization);

  console.log("\n✓ Done. Open the app and ask the Chief of Staff for today's brief.\n");
}

main().catch((e) => {
  console.error(
    "\n✗",
    e instanceof Error ? e.message : e,
    e && typeof e === "object" && "body" in e ? JSON.stringify((e as { body: unknown }).body) : "",
  );
  process.exit(1);
});
