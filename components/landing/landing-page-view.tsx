import { eventIsOpen, eventWhen, type LandingPage } from "@/lib/recruit/landing-pages";
import { publicMessages, type Locale } from "@/lib/recruit/locale";
import { LandingForm } from "@/components/landing/landing-form";
import { AdTags as AdTagsLoader } from "@/components/landing/ad-tags";
import type { AdTags } from "@/lib/recruit/ad-tags";

export interface Branding {
  name: string;
  logoUrl: string;
  accentColor: string;
  contactEmail: string;
}

// The form's card, at a height a conversation fits in.
const CHAT_FRAME =
  "mt-8 h-[28rem] w-full rounded-2xl border border-gray-200 bg-white shadow-sm sm:h-[32rem]";

/**
 * The public landing page: a short hero in the institution's accent color,
 * the pitch on the left, the form on the right (stacked on phones). Server-
 * renderable; the only client code is the form. `preview` is what the
 * in-app editor shows while an admin edits.
 */
export function LandingPageView({
  page,
  org,
  branding,
  preview = false,
  locale = "en",
  chatSrc,
  tags,
}: {
  page: LandingPage;
  org: string;
  branding: Branding;
  preview?: boolean;
  /** The language of the page's own words (the copy is the university's). */
  locale?: Locale;
  /** The chat frame's address; absent when the platform has no Recruit. `preview` shows only its place. */
  chatSrc?: string;
  /** The platform's validated ad tags; absent or empty loads none. */
  tags?: AdTags;
}) {
  const accent = branding.accentColor;
  const words = publicMessages(locale).page;
  // Empty while an editor is still typing the event's date.
  const when = page.event ? eventWhen(page.event, locale) : "";
  const closed = !!page.event && !!when && !eventIsOpen(page.event);
  const live = !preview && tags && (tags.googleTagId || tags.metaPixelId) ? tags : undefined;
  const tagsLine = live
    ? live.googleTagId && live.metaPixelId
      ? words.tagsBoth
      : live.googleTagId
        ? words.tagsGoogle
        : words.tagsMeta
    : "";
  return (
    <div className="min-h-full bg-[#f7f8fa] text-gray-900">
      {live ? <AdTagsLoader tags={live} /> : null}
      <BrandHeader branding={branding} />

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:py-16">
        <section className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            {page.headline}
          </h1>
          {page.subheadline ? (
            <p className="mt-4 text-lg leading-8 text-gray-600">{page.subheadline}</p>
          ) : null}
          {page.event && when ? (
            <p data-testid="event" className="mt-6 text-[15px] leading-6 text-gray-800">
              <span className="font-semibold">{when}</span>
              {page.event.place ? (
                <>
                  <br />
                  <span className="text-gray-600">{page.event.place}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {page.course?.lessons.length ? (
            <div data-testid="lessons" className="mt-8 grid gap-3">
              {page.course.lessons.map((lesson, i) => (
                <details
                  key={i}
                  open={i === 0}
                  className="group rounded-2xl border border-gray-200 bg-white shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-3 rounded-2xl px-5 py-4 text-[15px] font-semibold text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                    <span className="text-gray-500 tabular-nums">{i + 1}.</span>
                    <span className="min-w-0 flex-1 break-words">{lesson.title}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className="mt-0.5 size-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="space-y-3 px-5 pb-5 text-base leading-7 break-words text-gray-700">
                    {lesson.body.map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                    {lesson.question ? (
                      <p className="border-t border-gray-100 pt-3 text-[15px] text-gray-600">
                        <span className="font-medium text-gray-800">{words.think}</span>{" "}
                        {lesson.question}
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          ) : null}
          {chatSrc && preview ? (
            <div
              data-testid="chat-frame"
              className={`${CHAT_FRAME} flex flex-col items-center justify-center gap-1 px-6 text-center`}
            >
              <span className="text-sm font-medium text-gray-700">{words.ask}</span>
              <span className="text-xs text-gray-500">{words.askBody}</span>
            </div>
          ) : chatSrc ? (
            <iframe
              data-testid="chat-frame"
              src={chatSrc}
              title={words.ask}
              loading="lazy"
              className={CHAT_FRAME}
            />
          ) : null}
          {page.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.heroImageUrl}
              alt=""
              className="mt-8 aspect-[16/10] w-full rounded-2xl object-cover shadow-sm"
            />
          ) : null}
          {page.body?.length ? (
            <div className="mt-6 space-y-3 text-base leading-7 text-gray-700">
              {page.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
          {page.highlights?.length ? (
            <ul className="mt-8 grid gap-3">
              {page.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px] text-gray-800">
                  <span
                    className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: accent }}
                    aria-hidden
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
          {page.program || page.term ? (
            <p className="mt-8 inline-flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
              {page.program ? (
                <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
                  {page.program}
                </span>
              ) : null}
              {page.term ? (
                <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
                  {page.term}
                </span>
              ) : null}
            </p>
          ) : null}
        </section>

        <section className="relative min-w-0 lg:sticky lg:top-8 lg:self-start">
          {closed ? (
            <p
              data-testid="event-closed"
              className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm"
            >
              {words.closed}
            </p>
          ) : (
            <LandingForm page={page} org={org} accent={accent} preview={preview} tags={live} />
          )}
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-10 text-xs text-gray-500 sm:px-6">
        <span>
          {branding.name}
          {branding.contactEmail ? (
            <>
              {" · "}
              <a
                href={`mailto:${branding.contactEmail}`}
                className="underline-offset-2 hover:underline"
              >
                {branding.contactEmail}
              </a>
            </>
          ) : null}
        </span>
        {tagsLine ? <span>{tagsLine}</span> : null}
        <span>
          Powered by{" "}
          <a href="https://ibl.ai" className="font-medium underline-offset-2 hover:underline">
            ibl.ai
          </a>
        </span>
      </footer>
    </div>
  );
}

/** The institution's band across the top of every public page. */
export function BrandHeader({ branding }: { branding: Branding }) {
  const accent = branding.accentColor;
  return (
    <header
      className="text-white"
      style={{ background: `linear-gradient(135deg, ${accent} 0%, ${shade(accent, -0.25)} 100%)` }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              className="h-8 w-auto max-w-[9rem] rounded bg-white/90 p-1"
            />
          ) : null}
          <span className="truncate text-sm font-semibold tracking-wide uppercase opacity-95">
            {branding.name}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          Admissions
        </span>
      </div>
    </header>
  );
}

/** Darken / lighten a hex color by `amount` (-1..1). */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 0xff;
    const v = amount < 0 ? Math.round(c * (1 + amount)) : Math.round(c + (255 - c) * amount);
    return Math.max(0, Math.min(255, v));
  };
  return `#${[ch(16), ch(8), ch(0)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
