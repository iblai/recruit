import type { Metadata } from "next";
import { LandingPageView } from "@/components/landing/landing-page-view";
import { newLandingPage, type LandingPage } from "@/lib/recruit/landing-pages";
import { institutionBranding } from "@/lib/recruit/org-settings";
import { readOrgMetadata } from "@/lib/recruit/settings-server";
import { readRecruitSettings } from "@/lib/recruit/org-settings";

/**
 * `/p/<org>/<slug>` — a published landing page, server-rendered from the
 * organization's public metadata. No session, no SDK bundle. Unpublished or
 * unknown pages show a neutral "not available" state (never a hint about
 * what exists).
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ tenantKey: string; slug: string }>;

async function load(params: Params) {
  const { tenantKey, slug } = await params;
  const org = decodeURIComponent(tenantKey);
  // A built-in sample for local design work only — never in production.
  if (org === "__sample__" && process.env.NODE_ENV !== "production") {
    return {
      org,
      page: samplePage(slug),
      branding: {
        name: "Northfield University",
        logoUrl: "",
        accentColor: "#0058cc",
        contactEmail: "admissions@northfield.edu",
      },
    };
  }
  const metadata = await readOrgMetadata(org);
  const settings = readRecruitSettings(metadata);
  const page = (settings.landingPages ?? []).find((p) => p.slug === slug && p.published);
  return { org, page, branding: institutionBranding(metadata, org) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { page, branding } = await load(params);
  if (!page) return { title: "Page not available", robots: { index: false } };
  return {
    title: `${page.title} · ${branding.name}`,
    description: page.subheadline || page.headline,
    openGraph: {
      title: page.headline,
      description: page.subheadline,
      ...(page.heroImageUrl && { images: [page.heroImageUrl] }),
    },
  };
}

export default async function PublicLandingPage({ params }: { params: Params }) {
  const { org, page, branding } = await load(params);
  if (!page) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">This page is not available</h1>
          <p className="mt-2 text-sm text-gray-600">
            The link may be out of date or the page has not been published yet. Please contact the
            admissions office directly.
          </p>
        </div>
      </main>
    );
  }
  return <LandingPageView page={page} org={org} branding={branding} />;
}

function samplePage(slug: string): LandingPage {
  return newLandingPage({
    slug,
    title: "Request information",
    headline: "Find your place at Northfield.",
    subheadline:
      "Tell us a little about yourself and an admissions counselor will reach out with program details, visit dates and scholarship information.",
    highlights: [
      "A counselor who knows your program, not a call center",
      "Scholarship and financial-aid estimates within days",
      "Invitations to Preview Days and virtual info sessions",
    ],
    program: "",
    term: "Fall 2027",
    published: true,
  });
}
