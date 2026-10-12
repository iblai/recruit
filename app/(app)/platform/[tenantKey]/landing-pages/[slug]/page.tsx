"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Code2, Copy, ExternalLink, Eye, Globe, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/crm/empty-state";
import { InfoTip } from "@/components/crm/info-tip";
import { OwnerSelect } from "@/components/crm/owner-select";
import { PageHeader } from "@/components/crm/page-header";
import { SimpleSelect } from "@/components/crm/simple-select";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { openStages, useDealLookups } from "@/components/crm/deals/use-lookups";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { FieldsEditor } from "@/components/recruit/landing-pages/fields-editor";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { entryTerms } from "@/lib/recruit/fields";
import { landingPageUrl, validateLandingPage, type LandingPage } from "@/lib/recruit/landing-pages";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";
import { LIFECYCLE_LABELS } from "@/lib/recruit/vocabulary";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
const label = "text-muted-foreground flex items-center gap-1 text-xs";

const lines = (v: string[] | undefined) => (v ?? []).join("\n");
const unlines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The landing-page editor: content, routing into the funnel, the form's
 * questions — with a live preview of exactly what a prospect will see, and
 * the publish switch, link and embed snippet.
 */
export default function LandingPageEditorPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ? decodeURIComponent(params.slug) : "";
  const router = useRouter();
  const { tenantKey, href, isAdmin } = useSession();
  const { settings, branding, update, isLoading, isSaving } = useRecruitSettings();
  const lookups = useDealLookups();

  const stored = useMemo(
    () => (settings.landingPages ?? []).find((p) => p.slug === slug),
    [settings.landingPages, slug],
  );
  const [draft, setDraft] = useState<LandingPage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("content");

  useEffect(() => {
    if (stored && (!draft || !dirty)) setDraft(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  useBreadcrumbs([
    { label: "Landing pages", href: href("/landing-pages") },
    { label: draft?.title ?? stored?.title ?? "Page" },
  ]);

  const patch = (p: Partial<LandingPage>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  };

  const issues = draft ? validateLandingPage(draft) : [];
  const url = landingPageUrl(config.appUrl(), tenantKey, slug);
  const pipeline =
    lookups.pipelines.find((p) => p.code === (draft?.pipelineCode || "default")) ??
    lookups.defaultPipeline;
  const stages = openStages(pipeline);

  const persist = async (next: LandingPage, message: string) => {
    try {
      await update({
        landingPages: (settings.landingPages ?? []).map((p) =>
          p.slug === slug ? { ...next, updatedAt: new Date().toISOString() } : p,
        ),
      });
      setDirty(false);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const save = () => draft && void persist(draft, "Page saved");
  const togglePublished = (on: boolean) => {
    if (!draft) return;
    if (on && issues.length) {
      toast.error(`Fix before publishing: ${issues[0].message}`);
      return;
    }
    const next = { ...draft, published: on };
    setDraft(next);
    void persist(next, on ? "Page is live" : "Page unpublished");
  };

  if (isLoading && !stored) {
    return (
      <>
        <PageHeader icon={<Globe />} title="Landing page" />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </>
    );
  }
  if (!stored || !draft) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
        <EmptyState
          icon={<Globe strokeWidth={1.75} />}
          title="This landing page no longer exists"
          description="It may have been deleted or renamed."
          action={
            <Button variant="outline" onClick={() => router.push(href("/landing-pages"))}>
              <ArrowLeft data-icon="inline-start" strokeWidth={1.75} /> Back to landing pages
            </Button>
          }
        />
      </div>
    );
  }

  const embed = `<iframe src="${url}" title="${draft.title.replace(/"/g, "&quot;")}" style="width:100%;min-height:900px;border:0" loading="lazy"></iframe>`;

  return (
    <>
      <PageHeader
        icon={<Globe />}
        title={draft.title || "Landing page"}
        description={
          <span className="font-mono">
            /p/{tenantKey}/{slug}
          </span>
        }
        actions={
          <>
            <label className="text-muted-foreground mr-1 flex items-center gap-2 text-xs font-medium">
              <Switch
                checked={draft.published}
                disabled={isSaving || !isAdmin}
                onCheckedChange={togglePublished}
                aria-label="Published"
                className="data-[checked]:bg-[#0058cc]"
              />
              {draft.published ? <span className="text-emerald-700">Live</span> : "Draft"}
            </label>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(url);
                      toast.success("Link copied");
                    }}
                  />
                }
              >
                <Copy data-icon="inline-start" strokeWidth={1.75} /> Copy link
              </TooltipTrigger>
              <TooltipContent side="bottom">{url}</TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              size="sm"
              render={<a href={url} target="_blank" rel="noreferrer noopener" />}
              disabled={!draft.published}
            >
              <ExternalLink data-icon="inline-start" strokeWidth={1.75} /> Open
            </Button>
            <Button
              size="sm"
              className="ibl-button-primary"
              onClick={save}
              disabled={!dirty || isSaving || !isAdmin}
            >
              {isSaving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" strokeWidth={1.75} />
              )}
              Save
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6 xl:grid xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:items-start">
        <div className="min-w-0">
          {issues.length ? (
            <ul className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {issues.map((i, idx) => (
                <li key={idx}>• {i.message}</li>
              ))}
            </ul>
          ) : null}
          <Tabs value={tab} onValueChange={setTab} className="gap-3">
            <TabsList variant="line" className="h-9 border-b border-gray-200 pb-1">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="form">Form ({draft.fields.length})</TabsTrigger>
              <TabsTrigger value="routing">Routing</TabsTrigger>
              <TabsTrigger value="share">Share</TabsTrigger>
            </TabsList>

            <TabsContent value="content">
              <section className={`${CARD} grid gap-3`}>
                <div className="grid gap-1.5">
                  <Label htmlFor="lp-title" className={label}>
                    Title{" "}
                    <InfoTip label="About the title">
                      Browser tab and the list; not shown as the headline.
                    </InfoTip>
                  </Label>
                  <Input
                    id="lp-title"
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lp-headline" className={label}>
                    Headline
                  </Label>
                  <Input
                    id="lp-headline"
                    value={draft.headline}
                    onChange={(e) => patch({ headline: e.target.value })}
                    className="h-9"
                    placeholder="Find your place here."
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lp-sub" className={label}>
                    Subheadline
                  </Label>
                  <Textarea
                    id="lp-sub"
                    rows={2}
                    value={draft.subheadline ?? ""}
                    onChange={(e) => patch({ subheadline: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lp-highlights" className={label}>
                    Highlights{" "}
                    <InfoTip label="About highlights">One per line — shown as a checklist.</InfoTip>
                  </Label>
                  <Textarea
                    id="lp-highlights"
                    rows={3}
                    value={lines(draft.highlights)}
                    onChange={(e) => patch({ highlights: unlines(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lp-body" className={label}>
                    Paragraphs{" "}
                    <InfoTip label="About paragraphs">
                      One paragraph per line, under the headline.
                    </InfoTip>
                  </Label>
                  <Textarea
                    id="lp-body"
                    rows={3}
                    value={lines(draft.body)}
                    onChange={(e) => patch({ body: unlines(e.target.value) })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="lp-hero" className={label}>
                      Hero image URL
                    </Label>
                    <Input
                      id="lp-hero"
                      value={draft.heroImageUrl ?? ""}
                      onChange={(e) => patch({ heroImageUrl: e.target.value })}
                      className="h-9"
                      placeholder="https://…/campus.jpg"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lp-cta" className={label}>
                      Button label
                    </Label>
                    <Input
                      id="lp-cta"
                      value={draft.ctaLabel ?? ""}
                      onChange={(e) => patch({ ctaLabel: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lp-success-title" className={label}>
                      Thank-you title
                    </Label>
                    <Input
                      id="lp-success-title"
                      value={draft.successTitle ?? ""}
                      onChange={(e) => patch({ successTitle: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="lp-success" className={label}>
                      Thank-you message
                    </Label>
                    <Textarea
                      id="lp-success"
                      rows={2}
                      value={draft.successMessage ?? ""}
                      onChange={(e) => patch({ successMessage: e.target.value })}
                    />
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="form">
              <section className={CARD}>
                <p className="text-muted-foreground mb-3 text-xs">
                  Each question maps to where its answer lands in the CRM. Email and a name are
                  required so a prospect record can be created.
                </p>
                <FieldsEditor fields={draft.fields} onChange={(fields) => patch({ fields })} />
              </section>
            </TabsContent>

            <TabsContent value="routing">
              <section className={`${CARD} grid gap-3`}>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color,#e5e7eb)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Open an application for each submission
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      Off = create the prospect and a note only.
                    </p>
                  </div>
                  <Switch
                    checked={!!draft.createApplication}
                    onCheckedChange={(on: boolean) => patch({ createApplication: on })}
                    aria-label="Create an application"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className={label}>Funnel</Label>
                    <SimpleSelect
                      value={draft.pipelineCode ?? ""}
                      onChange={(v) => patch({ pipelineCode: v, stageCode: "" })}
                      options={lookups.pipelines.map((p) => ({ value: p.code, label: p.name }))}
                      size="sm"
                      disabled={!draft.createApplication}
                      aria-label="Funnel"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className={label}>Starting stage</Label>
                    <SimpleSelect
                      value={draft.stageCode ?? ""}
                      onChange={(v) => patch({ stageCode: v })}
                      options={stages.map((s) => ({ value: s.code, label: s.name }))}
                      allowEmpty
                      emptyLabel="First stage"
                      placeholder="First stage"
                      size="sm"
                      disabled={!draft.createApplication}
                      aria-label="Starting stage"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lp-program" className={label}>
                      Default program{" "}
                      <InfoTip label="About the default program">
                        Used when the form has no program question.
                      </InfoTip>
                    </Label>
                    <Input
                      id="lp-program"
                      value={draft.program ?? ""}
                      onChange={(e) => patch({ program: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className={label}>Default entry term</Label>
                    <SimpleSelect
                      value={draft.term ?? ""}
                      onChange={(v) => patch({ term: v })}
                      options={entryTerms()}
                      allowEmpty
                      emptyLabel="Any term"
                      placeholder="Any term"
                      size="sm"
                      aria-label="Default entry term"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lp-source" className={label}>
                      Source code{" "}
                      <InfoTip label="About the source">
                        Recorded on each application; created on first use.
                      </InfoTip>
                    </Label>
                    <Input
                      id="lp-source"
                      value={draft.sourceCode ?? ""}
                      onChange={(e) =>
                        patch({
                          sourceCode: e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
                        })
                      }
                      className="h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lp-tags" className={label}>
                      Tags{" "}
                      <InfoTip label="About tags">
                        Comma separated; attached to the prospect and application.
                      </InfoTip>
                    </Label>
                    <Input
                      id="lp-tags"
                      value={(draft.tags ?? []).join(", ")}
                      onChange={(e) =>
                        patch({
                          tags: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className={label}>Prospect stage</Label>
                    <SimpleSelect
                      value={draft.lifecycleStage ?? "lead"}
                      onChange={(v) =>
                        patch({ lifecycleStage: v as LandingPage["lifecycleStage"] })
                      }
                      options={(["lead", "qualified", "opportunity"] as const).map((v) => ({
                        value: v,
                        label: LIFECYCLE_LABELS[v],
                      }))}
                      size="sm"
                      aria-label="Prospect stage"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className={label}>Counselor who owns submissions</Label>
                    <OwnerSelect
                      value={draft.ownerId ?? null}
                      onChange={(ownerId) => patch({ ownerId })}
                      size="sm"
                    />
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="share">
              <section className={`${CARD} grid gap-3`}>
                <div className="grid gap-1.5">
                  <Label className={label}>Public link</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={url} className="h-8 font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(url);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy data-icon="inline-start" strokeWidth={1.75} /> Copy
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Add <code className="font-mono">?utm_source=…&utm_campaign=…</code> to track
                    where inquiries come from; they are stored on the prospect.
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label className={label}>
                    <Code2 className="size-3.5" strokeWidth={1.75} /> Embed on your website
                  </Label>
                  <Textarea readOnly rows={3} value={embed} className="font-mono text-[11px]" />
                </div>
                <div className="grid gap-1.5">
                  <Label className={label}>Submissions</Label>
                  <p className="text-sm text-gray-900">
                    {draft.submissions ?? 0} so far ·{" "}
                    <Link href={href("/prospects")} className="text-[#0058cc] hover:underline">
                      see prospects
                    </Link>
                  </p>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </div>

        <div className="min-w-0 xl:sticky xl:top-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Eye className="size-3.5" strokeWidth={1.75} /> Live preview
            </span>
            <span className="text-muted-foreground text-[11px]">
              Branding from Settings → Branding
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="origin-top-left" style={{ zoom: 0.62 }}>
              <LandingPageView page={draft} org={tenantKey} branding={branding} preview />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
