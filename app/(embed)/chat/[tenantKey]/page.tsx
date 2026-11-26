import type { Metadata } from "next";
import { headers } from "next/headers";
import { PublicChat } from "@/components/chat/public-chat";
import { SLUG_RE, eventIsOpen, eventWhen, fromPublicWebForm } from "@/lib/recruit/landing-pages";
import { fill, pickLocale, publicMessages } from "@/lib/recruit/locale";
import { cleanOrigins, institutionBranding, readRecruitSettings } from "@/lib/recruit/org-settings";
import { readOrgMetadata, readPublicWebForm } from "@/lib/recruit/settings-server";

/**
 * `/chat/<org>` — Recruit for a visitor: no sign-in. `?page=<slug>` tells the
 * agent which published landing page the visitor came from, `&frame=page` that
 * the chat sits inside that page. A platform with no Recruit set up shows a
 * neutral "not available" state.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ tenantKey: string }>;
type Search = Promise<{ page?: string | string[]; frame?: string | string[] }>;

async function load(params: Params) {
  const org = decodeURIComponent((await params).tenantKey);
  const metadata = await readOrgMetadata(org);
  const words = publicMessages(pickLocale((await headers()).get("accept-language")));
  return {
    org,
    metadata,
    words,
    settings: readRecruitSettings(metadata),
    branding: institutionBranding(metadata, org),
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { words, branding } = await load(params);
  return { title: `${words.chat.title} · ${branding.name}`, robots: { index: false } };
}

/** What the agent is told about where the visitor is. The slug is the visitor's; the words are staff's. */
async function whereabouts(
  org: string,
  institution: string,
  email: string,
  slug: string,
  onPage: boolean,
) {
  const form = SLUG_RE.test(slug) ? await readPublicWebForm(org, slug) : null;
  const contact = email ? ` The admissions office's email is ${email}.` : "";
  const here = `The visitor is on the website of ${institution}.${contact}`;
  if (!form) return { pageContent: here };
  const page = fromPublicWebForm(form);
  const event = page.event
    ? ` It is an event: ${eventWhen(page.event)}${page.event.place ? `, ${page.event.place}` : ""} (event "${page.slug}").`
    : "";
  // The lessons as the visitor reads them, so a question about one is answered from its own text.
  const course = page.course
    ? ` The page is a short taster course. Its lessons:\n${page.course.lessons
        .map((l, i) => `${i + 1}. ${l.title}\n${l.body.join("\n")}`)
        .join("\n\n")}`
    : "";
  const open = !page.event || eventIsOpen(page.event);
  const where = !onPage
    ? `They came from the page "${page.title}".`
    : open
      ? `They are on the page "${page.title}"; its sign-up form is on that page, beside this chat.`
      : `They are on the page "${page.title}"; sign-ups on it have closed.`;
  return { pageContent: `${here} ${where}${event}${course}`, page: page.slug };
}

export default async function PublicChatPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { org, metadata, words, settings, branding } = await load(params);
  if (!settings.studentAgentId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">{words.chat.unavailableTitle}</h1>
          <p className="mt-2 text-sm text-gray-600">{words.chat.unavailableBody}</p>
        </div>
      </main>
    );
  }
  const { page: slug, frame } = await searchParams;
  const framed = frame === "page";
  // The email the university set: the branding's fallback is the platform's support address.
  const email = typeof settings.contactEmail === "string" ? settings.contactEmail.trim() : "";
  const where = await whereabouts(
    org,
    branding.name,
    email,
    typeof slug === "string" ? slug : "",
    framed,
  );
  // It can bring in a counselor only once its tools are connected.
  const notice = settings.studentMcpServerId ? words.chat.notice : words.chat.noticeAnswers;
  return (
    <PublicChat
      org={org}
      agentId={settings.studentAgentId}
      branding={branding}
      orgMetadata={metadata}
      websiteOrigins={cleanOrigins(settings.websiteOrigins)}
      notice={fill(notice, { institution: branding.name })}
      busy={words.chat.busy}
      framed={framed}
      {...where}
    />
  );
}
