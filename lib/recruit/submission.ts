/**
 * Turn a landing-page submission into CRM records — the server half of the
 * public form. Pure orchestration over `CrmServer` so it is testable with a
 * fake client and reusable by the MCP tools or an import script.
 */
import type { CrmServer } from "./crm-server";
import type { LandingPage, SubmissionPlan } from "./landing-pages";

export interface SubmissionOutcome {
  personId: string;
  personCreated: boolean;
  applicationId?: number;
  schoolId?: string;
}

export async function applySubmission(
  crm: Pick<
    CrmServer,
    | "findPersonByEmail"
    | "createPerson"
    | "updatePerson"
    | "findOrCreateOrganization"
    | "resolvePipeline"
    | "findOrCreateLeadSource"
    | "createDeal"
    | "createActivity"
    | "findOrCreateTag"
    | "attachTag"
  >,
  page: LandingPage,
  plan: SubmissionPlan,
): Promise<SubmissionOutcome> {
  // 1. The school, when the prospect told us one.
  let schoolId: string | undefined;
  if (plan.schoolName) {
    schoolId = (await crm.findOrCreateOrganization(plan.schoolName)).id;
  }

  // 2. The prospect: reuse an existing record with the same email so a
  //    second inquiry adds to the story instead of duplicating the person.
  let personId: string;
  let personCreated = false;
  const existing = plan.person.primary_email
    ? await crm.findPersonByEmail(plan.person.primary_email)
    : undefined;
  if (existing) {
    personId = existing.id;
    const metadata = { ...(existing.metadata ?? {}), ...plan.person.metadata };
    await crm.updatePerson(existing.id, {
      metadata,
      ...(plan.person.contact_numbers?.length && !existing.contact_numbers?.length
        ? { contact_numbers: plan.person.contact_numbers }
        : {}),
      ...(plan.person.job_title && !existing.job_title ? { job_title: plan.person.job_title } : {}),
      ...(schoolId && !existing.organization ? { organization: schoolId } : {}),
    });
  } else {
    const person = await crm.createPerson({
      ...plan.person,
      organization: schoolId ?? null,
    });
    personId = person.id;
    personCreated = true;
  }

  // 3. Tags (created on first use).
  for (const name of plan.tags) {
    const tag = await crm.findOrCreateTag(name);
    await crm.attachTag("persons", personId, tag.id);
  }

  // 4. The application, in the configured funnel and stage.
  let applicationId: number | undefined;
  if (plan.application) {
    const pipeline = await crm.resolvePipeline(plan.application.pipelineCode);
    if (pipeline) {
      const stages = [...(pipeline.stages ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      const stage =
        (plan.application.stageCode
          ? stages.find((s) => s.code === plan.application?.stageCode)
          : undefined) ?? stages.find((s) => !s.is_won && !s.is_lost);
      if (stage) {
        const source = plan.application.sourceCode
          ? await crm.findOrCreateLeadSource(
              plan.application.sourceCode,
              `Landing page: ${page.title}`,
            )
          : undefined;
        const deal = await crm.createDeal({
          title: plan.application.title,
          description: plan.application.description,
          person: personId,
          organization: schoolId ?? null,
          pipeline: pipeline.id,
          stage: stage.id,
          source: source?.id ?? null,
          owner: plan.person.owner ?? null,
          metadata: plan.application.metadata,
        });
        applicationId = deal.id;
        for (const name of plan.tags) {
          const tag = await crm.findOrCreateTag(name);
          await crm.attachTag("deals", deal.id, tag.id);
        }
      }
    }
  }

  // 5. The note with every answer, on the prospect (and the application).
  await crm.createActivity({
    type: "note",
    title: plan.note.title,
    comment: plan.note.comment,
    person: personId,
    deal: applicationId ?? null,
    owner: plan.person.owner ?? null,
    is_done: true,
    metadata: { source: "landing_page", slug: page.slug },
  });

  return { personId, personCreated, applicationId, schoolId };
}
