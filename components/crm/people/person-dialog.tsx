"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { InfoTip } from "@/components/crm/info-tip";
import { SimpleSelect } from "@/components/crm/simple-select";
import { OwnerSelect } from "@/components/crm/owner-select";
import { toastApiError } from "@/components/crm/people/crm-error";
import { useSession } from "@/hooks/use-session";
import { useCreatePersonMutation, useListOrganizationsQuery } from "@/lib/crm/api";
import { LIFECYCLE_STAGES, type LifecycleStage, type Person } from "@/lib/crm/types";
import { PROSPECT_FIELDS, withMeta, type Metadata } from "@/lib/recruit/fields";
import { LIFECYCLE_LABELS, VOCAB } from "@/lib/recruit/vocabulary";

const GRAD_YEAR = PROSPECT_FIELDS.find((f) => f.key === "graduation_year");
const ENTRY_TERM = PROSPECT_FIELDS.find((f) => f.key === "entry_term");

const labelClass = "flex items-center gap-1";

/**
 * Create a prospect (a CRM person). Opened from the Prospects list ("New
 * prospect", `?new=1`) and from a school's Prospects tab, where
 * `defaultOrganization` pre-fills the school so the record lands in the
 * right place. Graduation year and entry term go to `metadata`.
 */
export function PersonDialog({
  open,
  onOpenChange,
  defaultOrganization,
  navigateOnCreate = true,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOrganization?: string | null;
  /** Go to the new prospect's page on success (default). */
  navigateOnCreate?: boolean;
  onCreated?: (person: Person) => void;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const { href, userId } = useSession();
  const [createPerson, { isLoading }] = useCreatePersonMutation();
  const { data: orgs } = useListOrganizationsQuery({ page_size: 100 }, { skip: !open });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [organization, setOrganization] = useState(defaultOrganization ?? "");
  const [gradYear, setGradYear] = useState("");
  const [entryTerm, setEntryTerm] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleStage>("lead");
  const [owner, setOwner] = useState<number | null>(userId ?? null);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPhone("");
    setJobTitle("");
    setOrganization(defaultOrganization ?? "");
    setGradYear("");
    setEntryTerm("");
    setLifecycle("lead");
    setOwner(userId ?? null);
  }, [open, defaultOrganization, userId]);

  const orgOptions = (orgs?.results ?? []).map((o) => ({ value: o.id, label: o.name }));

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    let metadata: Metadata = {};
    if (GRAD_YEAR) metadata = withMeta(metadata, GRAD_YEAR, gradYear);
    if (ENTRY_TERM) metadata = withMeta(metadata, ENTRY_TERM, entryTerm);
    try {
      const person = await createPerson({
        name: trimmed,
        primary_email: email.trim() || undefined,
        contact_numbers: phone.trim() ? [phone.trim()] : undefined,
        job_title: jobTitle.trim() || undefined,
        organization: organization || null,
        lifecycle_stage: lifecycle,
        owner: owner ?? null,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }).unwrap();
      toast.success(`${person.name} added`);
      onOpenChange(false);
      onCreated?.(person);
      if (navigateOnCreate) router.push(href(`/prospects/${person.id}`));
    } catch (err) {
      toastApiError(err, `Could not create this ${VOCAB.prospect.lower}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>New {VOCAB.prospect.lower}</DialogTitle>
          <DialogDescription>
            Add a student, applicant or school contact. Everything else can be filled in on their
            record.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="person-name" className={labelClass}>
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="person-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="person-email" className={labelClass}>
                Email
              </Label>
              <Input
                id="person-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ada@example.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="person-phone" className={labelClass}>
                Phone
              </Label>
              <Input
                id="person-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 512 555 0100"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className={labelClass}>
                {VOCAB.school.one}
                <InfoTip label={`About ${VOCAB.school.lower}`}>
                  Their current high school, college or partner organization.
                </InfoTip>
              </Label>
              <SimpleSelect
                value={organization}
                onChange={setOrganization}
                options={orgOptions}
                allowEmpty
                emptyLabel={`No ${VOCAB.school.lower}`}
                placeholder={`No ${VOCAB.school.lower}`}
                aria-label={VOCAB.school.one}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="person-title" className={labelClass}>
                {VOCAB.intendedProgram}
                <InfoTip label={`About ${VOCAB.intendedProgram.toLowerCase()}`}>
                  For school contacts, use this for their role, e.g. Counselor.
                </InfoTip>
              </Label>
              <Input
                id="person-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="B.S. Computer Science"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {GRAD_YEAR ? (
              <div className="grid gap-1.5">
                <Label className={labelClass}>
                  {GRAD_YEAR.label}
                  {GRAD_YEAR.hint ? (
                    <InfoTip label={`About ${GRAD_YEAR.label.toLowerCase()}`}>
                      {GRAD_YEAR.hint}
                    </InfoTip>
                  ) : null}
                </Label>
                <SimpleSelect
                  value={gradYear}
                  onChange={setGradYear}
                  options={GRAD_YEAR.options ?? []}
                  allowEmpty
                  emptyLabel="Unknown"
                  placeholder="Unknown"
                  aria-label={GRAD_YEAR.label}
                />
              </div>
            ) : null}
            {ENTRY_TERM ? (
              <div className="grid gap-1.5">
                <Label className={labelClass}>
                  {ENTRY_TERM.label}
                  {ENTRY_TERM.hint ? (
                    <InfoTip label={`About ${ENTRY_TERM.label.toLowerCase()}`}>
                      {ENTRY_TERM.hint}
                    </InfoTip>
                  ) : null}
                </Label>
                <SimpleSelect
                  value={entryTerm}
                  onChange={setEntryTerm}
                  options={ENTRY_TERM.options ?? []}
                  allowEmpty
                  emptyLabel="Undecided"
                  placeholder="Undecided"
                  aria-label={ENTRY_TERM.label}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className={labelClass}>
                Stage
                <InfoTip label="About stages">
                  {LIFECYCLE_LABELS.lead} → {LIFECYCLE_LABELS.qualified} →{" "}
                  {LIFECYCLE_LABELS.opportunity} → {LIFECYCLE_LABELS.customer} ·{" "}
                  {LIFECYCLE_LABELS.churned}. New {VOCAB.prospect.lowerMany} start as{" "}
                  {LIFECYCLE_LABELS.lead}.
                </InfoTip>
              </Label>
              <SimpleSelect
                value={lifecycle}
                onChange={(v) => setLifecycle((v || "lead") as LifecycleStage)}
                options={LIFECYCLE_STAGES}
                aria-label="Stage"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className={labelClass}>
                {VOCAB.counselor.one}
                <InfoTip label={`About ${VOCAB.counselor.lower}`}>
                  The admissions counselor who owns this {VOCAB.prospect.lower}.
                </InfoTip>
              </Label>
              <OwnerSelect value={owner} onChange={setOwner} />
            </div>
          </div>

          <DialogFooter className="mt-1">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="submit"
              className="ibl-button-primary"
              disabled={!name.trim() || isLoading}
            >
              {isLoading ? <Spinner data-icon="inline-start" /> : null}
              Create {VOCAB.prospect.lower}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
