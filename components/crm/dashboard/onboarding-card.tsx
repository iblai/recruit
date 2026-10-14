"use client";

import Link from "next/link";
import { ClipboardList, LayoutTemplate, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

/** Shown while the organization has neither prospects nor applications. */
export function OnboardingCard() {
  const { href } = useSession();
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="bg-gradient-to-br from-[#eef6fc] to-white px-6 py-8 md:px-10 md:py-10">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#0058cc] shadow-sm">
          <Sparkles className="size-5" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-gray-900">
          Your recruitment workspace is ready
        </h2>
        <p className="text-muted-foreground mt-1.5 max-w-lg text-sm">
          Start by adding a prospect, then open an application for them. Everything else — schools,
          visits, activities and tags — hangs off those two.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="ibl-button-primary" render={<Link href={href("/prospects?new=1")} />}>
            <UserPlus data-icon="inline-start" /> Add a prospect
          </Button>
          <Button variant="outline" render={<Link href={href("/applications?new=1")} />}>
            <ClipboardList data-icon="inline-start" /> Open an application
          </Button>
        </div>
        <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
          <LayoutTemplate className="size-3.5 shrink-0" />
          <span>
            Capturing inquiries from a fair, a visit or your website?{" "}
            <Link
              href={href("/landing-pages")}
              className="font-medium text-[#0058cc] hover:underline"
            >
              Publish a landing page
            </Link>{" "}
            and each submission becomes a prospect automatically.
          </span>
        </p>
      </div>
      <ol className="grid gap-px bg-gray-100 sm:grid-cols-3">
        {[
          {
            n: 1,
            title: "Add prospects",
            body: "Students, parents and counselors — every application and activity starts with one.",
          },
          {
            n: 2,
            title: "Open applications",
            body: "One per prospect, program and term; move them through the stages of your funnel.",
          },
          {
            n: 3,
            title: "Log activity",
            body: "Calls, visits, emails and notes keep the history honest for the whole team.",
          },
        ].map((step) => (
          <li key={step.n} className="bg-white px-5 py-4">
            <span className="flex size-6 items-center justify-center rounded-full bg-[#eef6fc] text-xs font-semibold text-[#0058cc]">
              {step.n}
            </span>
            <p className="mt-2 text-sm font-medium text-gray-900">{step.title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
