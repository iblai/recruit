"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { EntityAvatar } from "@/components/crm/entity-avatar";
import { InfoTip } from "@/components/crm/info-tip";
import { SimpleSelect } from "@/components/crm/simple-select";
import { OwnerSelect } from "@/components/crm/owner-select";
import { openStages, useDealLookups } from "@/components/crm/deals/use-lookups";
import { useSession } from "@/hooks/use-session";
import { errorMessage, useCreateDealMutation, useGetPersonQuery } from "@/lib/crm/api";
import type { Deal } from "@/lib/crm/types";
import {
  APPLICATION_FIELDS,
  ENTRY_TYPE_OPTIONS,
  applicationTitle,
  entryTerms,
  withMeta,
  type Metadata,
} from "@/lib/recruit/fields";
import { VOCAB } from "@/lib/recruit/vocabulary";
import config from "@/lib/iblai/config";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "INR",
  "BRL",
  "MXN",
  "SGD",
  "ZAR",
];

const PROGRAM_FIELD = APPLICATION_FIELDS.find((f) => f.key === "program");
const TERM_FIELD = APPLICATION_FIELDS.find((f) => f.key === "term");
const ENTRY_TYPE_FIELD = APPLICATION_FIELDS.find((f) => f.key === "entry_type");

/**
 * Create an application (a CRM deal) — the one place applications are born.
 * A prospect and a stage are required; program, entry term and entry type
 * live in `metadata` and feed the auto-generated title.
 */
export function DealDialog({
  open,
  onOpenChange,
  defaultPerson,
  defaultOrganization,
  defaultPipeline,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPerson?: string | null;
  defaultOrganization?: string | null;
  defaultPipeline?: number | null;
  onCreated?: (deal: Deal) => void;
}) {
  const router = useRouter();
  const { href, userId } = useSession();
  const lookups = useDealLookups({ skip: !open });
  const [createDeal, { isLoading }] = useCreateDealMutation();

  const [title, setTitle] = useState("");
  /** Once the user types a title we stop regenerating it from the fields. */
  const [titleEdited, setTitleEdited] = useState(false);
  const [personId, setPersonId] = useState("");
  const [personOpen, setPersonOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [program, setProgram] = useState("");
  const [term, setTerm] = useState("");
  const [entryType, setEntryType] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [showTuition, setShowTuition] = useState(false);
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(config.defaultCurrency());
  const [sourceId, setSourceId] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [owner, setOwner] = useState<number | null>(userId ?? null);
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  // The prospect may not be on the first page the picker lists (deep links).
  const { data: seededPerson } = useGetPersonQuery(defaultPerson ?? "", {
    skip: !open || !defaultPerson,
  });
  const selectedPerson =
    lookups.personById.get(personId) ?? (seededPerson?.id === personId ? seededPerson : undefined);

  // Reset to the defaults each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setTitleEdited(false);
    setPersonId(defaultPerson ?? "");
    setOrganizationId(defaultOrganization ?? "");
    setProgram("");
    setTerm("");
    setEntryType("");
    setShowTuition(false);
    setValue("");
    setCurrency(config.defaultCurrency());
    setSourceId("");
    setExpectedClose("");
    setDescription("");
    setOwner(userId ?? null);
    setTouched(false);
    if (defaultPipeline) setPipelineId(String(defaultPipeline));
  }, [open, defaultPerson, defaultOrganization, defaultPipeline, userId]);

  // Default the funnel once the list arrives.
  useEffect(() => {
    if (!open) return;
    const fallback = defaultPipeline ?? lookups.defaultPipeline?.id;
    if (fallback && !pipelineId) setPipelineId(String(fallback));
  }, [open, defaultPipeline, lookups.defaultPipeline, pipelineId]);

  const pipeline = lookups.pipelineById.get(Number(pipelineId));
  const stages = useMemo(() => openStages(pipeline), [pipeline]);

  // Keep the stage inside the selected funnel.
  useEffect(() => {
    if (stages.length === 0) return;
    if (!stages.some((s) => String(s.id) === stageId)) setStageId(String(stages[0].id));
  }, [stages, stageId]);

  // Inherit the prospect's school when the user has not picked one.
  useEffect(() => {
    if (!selectedPerson?.organization || organizationId) return;
    setOrganizationId(selectedPerson.organization);
  }, [selectedPerson, organizationId]);

  // Prospects whose metadata already names a term / entry type seed the fields.
  useEffect(() => {
    if (!selectedPerson) return;
    const meta = selectedPerson.metadata ?? {};
    if (!term && typeof meta.entry_term === "string") setTerm(meta.entry_term);
    if (!entryType && typeof meta.entry_type === "string") setEntryType(meta.entry_type);
    // Only when the prospect changes — the user's own edits must win afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPerson?.id]);

  const currencyOptions = useMemo(() => {
    const all = new Set([config.defaultCurrency(), ...CURRENCIES]);
    return [...all].filter(Boolean).map((c) => ({ value: c, label: c }));
  }, []);
  const termOptions = useMemo(() => entryTerms(), []);

  const autoTitle = selectedPerson ? applicationTitle(selectedPerson.name, program, term) : "";
  const effectiveTitle = titleEdited ? title : autoTitle;

  const valid = effectiveTitle.trim().length > 0 && !!personId && !!pipelineId && !!stageId;

  const submit = async () => {
    setTouched(true);
    if (!valid || isLoading) return;
    let metadata: Metadata = {};
    if (PROGRAM_FIELD) metadata = withMeta(metadata, PROGRAM_FIELD, program);
    if (TERM_FIELD) metadata = withMeta(metadata, TERM_FIELD, term);
    if (ENTRY_TYPE_FIELD) metadata = withMeta(metadata, ENTRY_TYPE_FIELD, entryType);
    try {
      const deal = await createDeal({
        title: effectiveTitle.trim(),
        person: personId,
        organization: organizationId || null,
        pipeline: Number(pipelineId),
        stage: Number(stageId),
        lead_value: value.trim() ? String(Number(value)) : undefined,
        currency,
        source: sourceId ? Number(sourceId) : null,
        expected_close_date: expectedClose || null,
        owner: owner ?? null,
        description: description.trim() || undefined,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }).unwrap();
      toast.success(`Application “${deal.title}” opened`);
      onOpenChange(false);
      onCreated?.(deal);
      router.push(href(`/applications/${deal.id}`));
    } catch (err) {
      toast.error(errorMessage(err, "Could not open the application"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#eef6fc] text-[#0058cc]">
              <ClipboardList className="size-4" />
            </span>
            New application
          </DialogTitle>
          <DialogDescription>
            One application is one prospect applying to one program for one term. It starts in the
            first stage of the funnel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-0.5 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="flex items-center gap-1">
              {VOCAB.prospect.one}
              <InfoTip label="About the prospect field">
                Every application belongs to one prospect; add them first under Prospects
              </InfoTip>
            </Label>
            <Popover open={personOpen} onOpenChange={setPersonOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-between font-normal"
                    aria-invalid={touched && !personId}
                  />
                }
              >
                {selectedPerson ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <EntityAvatar name={selectedPerson.name} seed={selectedPerson.id} size="xs" />
                    <span className="truncate">{selectedPerson.name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Search for a prospect…</span>
                )}
                <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <Command>
                  <CommandInput autoFocus placeholder="Search prospects…" />
                  <CommandList>
                    <CommandEmpty>No prospect found.</CommandEmpty>
                    <CommandGroup>
                      {lookups.persons.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${p.primary_email ?? ""}`}
                          onSelect={() => {
                            setPersonId(p.id);
                            if (p.organization) setOrganizationId(p.organization);
                            setPersonOpen(false);
                          }}
                        >
                          <EntityAvatar name={p.name} seed={p.id} size="xs" />
                          <span className="min-w-0 flex-1 truncate">
                            {p.name}
                            {p.primary_email ? (
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                {p.primary_email}
                              </span>
                            ) : null}
                          </span>
                          {personId === p.id ? (
                            <Check className="size-4 shrink-0 text-[#0058cc]" />
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="flex items-center gap-1">
              {VOCAB.school.one}
              <InfoTip label="About the school field">
                Inherited from the prospect — the high school, college or partner they come from
              </InfoTip>
            </Label>
            <SimpleSelect
              value={organizationId}
              onChange={setOrganizationId}
              options={lookups.organizations.map((o) => ({ value: o.id, label: o.name }))}
              allowEmpty
              emptyLabel="No school"
              placeholder="No school"
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="deal-program" className="flex items-center gap-1">
              {PROGRAM_FIELD?.label ?? "Program"}
              {PROGRAM_FIELD?.hint ? (
                <InfoTip label="About the program field">{PROGRAM_FIELD.hint}</InfoTip>
              ) : null}
            </Label>
            <Input
              id="deal-program"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              placeholder={PROGRAM_FIELD?.placeholder ?? "B.S. Computer Science"}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1">
              {TERM_FIELD?.label ?? "Entry term"}
              {TERM_FIELD?.hint ? (
                <InfoTip label="About the entry term field">{TERM_FIELD.hint}</InfoTip>
              ) : null}
            </Label>
            <SimpleSelect
              value={term}
              onChange={setTerm}
              options={termOptions}
              allowEmpty
              emptyLabel="No term yet"
              placeholder="Entry term"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1">
              {ENTRY_TYPE_FIELD?.label ?? "Entry type"}
              <InfoTip label="About the entry type field">
                First-year, transfer, graduate… — shapes the checklist and the deadlines
              </InfoTip>
            </Label>
            <SimpleSelect
              value={entryType}
              onChange={setEntryType}
              options={ENTRY_TYPE_OPTIONS}
              allowEmpty
              emptyLabel="Not set"
              placeholder="Entry type"
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="deal-title" className="flex items-center gap-1">
              Title
              <InfoTip label="About the title field">
                Written for you from the prospect, program and term — edit it if you prefer
              </InfoTip>
            </Label>
            <Input
              id="deal-title"
              value={effectiveTitle}
              onChange={(e) => {
                const next = e.target.value;
                // Clearing the field hands the title back to the generator.
                setTitleEdited(next.length > 0);
                setTitle(next);
              }}
              placeholder={
                selectedPerson ? autoTitle : "Pick a prospect and the title writes itself"
              }
              aria-invalid={touched && !effectiveTitle.trim()}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1">
              {VOCAB.funnel.one}
              <InfoTip label="About the funnel field">
                The set of stages this application moves through
              </InfoTip>
            </Label>
            <SimpleSelect
              value={pipelineId}
              onChange={setPipelineId}
              options={lookups.pipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              placeholder={VOCAB.funnel.one}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1">
              Stage
              <InfoTip label="About the stage field">
                Applications start here; move them from the board
              </InfoTip>
            </Label>
            <SimpleSelect
              value={stageId}
              onChange={setStageId}
              options={stages.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="Stage"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1">
              {VOCAB.source.one}
              <InfoTip label="About the source field">
                How this prospect found you — a fair, a visit, a landing page; admins manage the
                list in Settings
              </InfoTip>
            </Label>
            <SimpleSelect
              value={sourceId}
              onChange={setSourceId}
              options={lookups.sources.map((s) => ({ value: String(s.id), label: s.name }))}
              allowEmpty
              emptyLabel="No source"
              placeholder="No source"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-close" className="flex items-center gap-1">
              {VOCAB.deadline}
              <InfoTip label="About the decision deadline field">
                The date the prospect must decide by; the card flags it once it passes
              </InfoTip>
            </Label>
            <Input
              id="deal-close"
              type="date"
              value={expectedClose}
              onChange={(e) => setExpectedClose(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="flex items-center gap-1">
              {VOCAB.counselor.one}
              <InfoTip label="About the counselor field">
                Who shepherds this application — it shows up on their board and their lists
              </InfoTip>
            </Label>
            <OwnerSelect value={owner} onChange={setOwner} />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setShowTuition((s) => !s)}
              aria-expanded={showTuition}
              className="text-muted-foreground flex items-center gap-1 text-xs font-medium hover:text-gray-900"
            >
              {showTuition ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {VOCAB.value}
              <span className="font-normal">— optional</span>
            </button>
            {showTuition ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="deal-value" className="flex items-center gap-1">
                    {VOCAB.value}
                    <InfoTip label="About the estimated net tuition field">
                      Tuition after aid, per year; it feeds the funnel totals and the weighted yield
                    </InfoTip>
                  </Label>
                  <Input
                    id="deal-value"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="flex items-center gap-1">
                    Currency
                    <InfoTip label="About the currency field">
                      Set per application — totals are added up as-is, not converted
                    </InfoTip>
                  </Label>
                  <SimpleSelect value={currency} onChange={setCurrency} options={currencyOptions} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="deal-description">Notes</Label>
            <Textarea
              id="deal-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything the team should know — interests, concerns, who else is involved…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            className={cn("ibl-button-primary")}
            disabled={!valid || isLoading}
            onClick={() => void submit()}
          >
            {isLoading ? <Spinner data-icon="inline-start" /> : null}
            Open application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
