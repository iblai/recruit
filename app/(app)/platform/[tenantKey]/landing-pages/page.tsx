"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, ExternalLink, Globe, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { EmptyState } from "@/components/crm/empty-state";
import { PageHeader } from "@/components/crm/page-header";
import { useBreadcrumbs } from "@/components/crm/breadcrumbs";
import { LandingPageDialog } from "@/components/recruit/landing-pages/landing-page-dialog";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import { errorMessage, useListWebFormSubmissionsQuery } from "@/lib/crm/api";
import { formatRelative } from "@/lib/crm/format";
import { landingPageUrl, validateLandingPage, type LandingPage } from "@/lib/recruit/landing-pages";
import { useLandingPages } from "@/lib/recruit/use-landing-pages";

export default function LandingPagesPage() {
  return (
    <Suspense fallback={<PageHeader icon={<Globe />} title="Landing pages" />}>
      <LandingPagesView />
    </Suspense>
  );
}

/** How many submissions a page has received. */
function SubmissionCount({ slug }: { slug: string }) {
  const { data } = useListWebFormSubmissionsQuery({ slug, page_size: 1 });
  return <>{data ? data.count : "—"}</>;
}

/**
 * The public forms this organization publishes. Each row is a CRM web form;
 * Publish flips it live at `/p/<org>/<slug>` and starts turning submissions
 * into prospects.
 */
function LandingPagesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantKey, href, isAdmin } = useSession();
  const { pages, loaded, isLoading, error, create, setPublished, remove, isSaving } =
    useLandingPages();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<LandingPage | null>(null);

  useBreadcrumbs([{ label: "Landing pages", href: href("/landing-pages") }]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreateOpen(true);
    router.replace(window.location.pathname);
  }, [searchParams, router]);

  const appUrl = config.appUrl();

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"));
    }
  };

  const togglePublished = (page: LandingPage, on: boolean) => {
    if (on) {
      const issues = validateLandingPage(page, { publish: true });
      if (issues.length) {
        toast.error(`Fix before publishing: ${issues[0].message}`);
        return;
      }
    }
    void run(
      () => setPublished(page.slug, on),
      on ? `“${page.title}” is live` : `“${page.title}” unpublished`,
    );
  };

  const copyUrl = async (page: LandingPage) => {
    await navigator.clipboard.writeText(landingPageUrl(appUrl, tenantKey, page.slug));
    toast.success("Link copied");
  };

  const duplicate = (page: LandingPage) => {
    let slug = `${page.slug}-copy`;
    let n = 2;
    while (pages.some((p) => p.slug === slug)) slug = `${page.slug}-copy-${n++}`;
    void run(
      () => create({ ...page, slug, title: `${page.title} (copy)`, published: false }),
      "Page duplicated as a draft",
    );
  };

  return (
    <>
      <PageHeader
        icon={<Globe />}
        title="Landing pages"
        count={pages.length}
        description="Public inquiry and event forms — every submission becomes a prospect in your funnel"
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  className="ibl-button-primary"
                  onClick={() => setCreateOpen(true)}
                  disabled={!isAdmin}
                />
              }
            >
              <Plus data-icon="inline-start" /> New landing page
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isAdmin
                ? "Start from the standard inquiry form"
                : "Only organization admins can create pages"}
            </TooltipContent>
          </Tooltip>
        }
      />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : error ? (
          <EmptyState
            icon={<Globe />}
            title="Landing pages are unavailable"
            description={errorMessage(
              error,
              "The platform did not return this organization’s pages.",
            )}
          />
        ) : pages.length === 0 ? (
          <EmptyState
            icon={<Globe />}
            title="No landing pages yet"
            description="Publish a “Request information” page, link it from your site or a QR code at a college fair, and every submission lands here as a prospect — with an application in the funnel and a note of what they said."
            action={
              isAdmin ? (
                <Button className="ibl-button-primary" onClick={() => setCreateOpen(true)}>
                  <Plus data-icon="inline-start" /> Create your first page
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/70 hover:bg-gray-50/70">
                  <TableHead>Page</TableHead>
                  <TableHead>Funnel · stage</TableHead>
                  <TableHead className="text-right">Submissions</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => {
                  const url = landingPageUrl(appUrl, tenantKey, page.slug);
                  return (
                    <TableRow
                      key={page.slug}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(href(`/landing-pages/${encodeURIComponent(page.slug)}`))
                      }
                    >
                      <TableCell className="max-w-[24rem]">
                        <span className="block truncate font-medium text-gray-900">
                          {page.title}
                        </span>
                        <span className="text-muted-foreground block truncate font-mono text-[11px]">
                          /p/{tenantKey}/{page.slug}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-700">
                        {page.createApplication ? (
                          <>
                            <code className="font-mono">{page.pipelineCode || "default"}</code>
                            {page.stageCode ? (
                              <>
                                {" "}
                                · <code className="font-mono">{page.stageCode}</code>
                              </>
                            ) : (
                              <span className="text-muted-foreground"> · first stage</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">prospect only</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <SubmissionCount slug={page.slug} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatRelative(page.updatedAt)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Switch
                                checked={page.published}
                                disabled={isSaving || !isAdmin}
                                onCheckedChange={(on: boolean) => togglePublished(page, on)}
                                aria-label={`Publish ${page.title}`}
                                className="data-[checked]:bg-[#0058cc]"
                              />
                            }
                          />
                          <TooltipContent>
                            {page.published
                              ? "Live — accepting submissions"
                              : "Draft — the public link shows “not available”"}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${page.title}`}
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              render={
                                <Link
                                  href={href(`/landing-pages/${encodeURIComponent(page.slug)}`)}
                                />
                              }
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void copyUrl(page)}>
                              <Copy /> Copy link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              render={
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  aria-label="Open the public page"
                                />
                              }
                              disabled={!page.published}
                            >
                              <ExternalLink /> Open public page
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => duplicate(page)}
                              disabled={!isAdmin || !loaded}
                            >
                              <Copy /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setToDelete(page)}
                              disabled={!isAdmin}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <LandingPageDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete “${toDelete?.title}”?`}
        description="The public link stops working immediately. Prospects already captured stay in the CRM."
        confirmLabel="Delete page"
        destructive
        loading={isSaving}
        onConfirm={async () => {
          if (!toDelete) return;
          await run(() => remove(toDelete.slug), "Page deleted");
          setToDelete(null);
        }}
      />
    </>
  );
}
