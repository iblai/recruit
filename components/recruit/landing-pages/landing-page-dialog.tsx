"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SimpleSelect } from "@/components/crm/simple-select";
import { useDealLookups, openStages } from "@/components/crm/deals/use-lookups";
import { useSession } from "@/hooks/use-session";
import { entryTerms } from "@/lib/recruit/fields";
import { newLandingPage, slugify, SLUG_RE } from "@/lib/recruit/landing-pages";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

/** Create a landing page with the standard inquiry form; refine it in the editor. */
export function LandingPageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { href } = useSession();
  const titleRef = useRef<HTMLInputElement>(null);
  const { settings, update, isSaving } = useRecruitSettings();
  const lookups = useDealLookups({ skip: !open });

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [program, setProgram] = useState("");
  const [term, setTerm] = useState("");
  const [pipelineCode, setPipelineCode] = useState("");
  const [stageCode, setStageCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setProgram("");
    setTerm("");
    setPipelineCode("");
    setStageCode("");
  }, [open]);
  useEffect(() => {
    if (open && !pipelineCode && lookups.defaultPipeline)
      setPipelineCode(lookups.defaultPipeline.code);
  }, [open, pipelineCode, lookups.defaultPipeline]);

  const pipeline = lookups.pipelines.find((p) => p.code === pipelineCode);
  const stages = openStages(pipeline);
  const taken = (settings.landingPages ?? []).some((p) => p.slug === slug);
  const valid = title.trim().length > 0 && SLUG_RE.test(slug) && !taken;

  const submit = async () => {
    if (!valid) return;
    const page = newLandingPage({
      title: title.trim(),
      slug,
      program: program.trim(),
      term,
      pipelineCode: pipelineCode || "default",
      stageCode,
      headline: title.trim(),
    });
    try {
      await update({ landingPages: [...(settings.landingPages ?? []), page] });
      toast.success("Landing page created — it is a draft until you publish it");
      onOpenChange(false);
      router.push(href(`/landing-pages/${encodeURIComponent(page.slug)}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the page");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" initialFocus={titleRef}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#eef6fc] text-[#0058cc]">
              <Globe className="size-4" strokeWidth={1.75} />
            </span>
            New landing page
          </DialogTitle>
          <DialogDescription>
            A public page with an inquiry form. Every submission becomes a prospect — and an
            application in the funnel you pick. You will refine the copy and fields next.
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
            <Label htmlFor="lp-title" className="text-muted-foreground text-xs">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lp-title"
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Fall 2027 Nursing Open House"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lp-slug" className="text-muted-foreground text-xs">
              URL slug
            </Label>
            <Input
              id="lp-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="fall-2027-nursing-open-house"
              className="font-mono text-sm"
              aria-invalid={!!slug && (!SLUG_RE.test(slug) || taken)}
            />
            <p
              className={
                taken ? "text-destructive text-[11px]" : "text-muted-foreground text-[11px]"
              }
            >
              {taken ? "That slug is already used by another page." : `/p/…/${slug || "slug"}`}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="lp-program" className="text-muted-foreground text-xs">
                Program (optional)
              </Label>
              <Input
                id="lp-program"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="B.S. Nursing"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Entry term (optional)</Label>
              <SimpleSelect
                value={term}
                onChange={setTerm}
                options={entryTerms()}
                allowEmpty
                emptyLabel="Any term"
                placeholder="Any term"
                aria-label="Entry term"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Funnel</Label>
              <SimpleSelect
                value={pipelineCode}
                onChange={(v) => {
                  setPipelineCode(v);
                  setStageCode("");
                }}
                options={lookups.pipelines.map((p) => ({ value: p.code, label: p.name }))}
                placeholder="Funnel"
                aria-label="Funnel"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Starting stage</Label>
              <SimpleSelect
                value={stageCode}
                onChange={setStageCode}
                options={stages.map((s) => ({ value: s.code, label: s.name }))}
                allowEmpty
                emptyLabel="First stage"
                placeholder="First stage"
                aria-label="Starting stage"
              />
            </div>
          </div>
          <DialogFooter className="mt-1">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" className="ibl-button-primary" disabled={!valid || isSaving}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Create page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
