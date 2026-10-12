import type { LandingPage } from "@/lib/recruit/landing-pages";
import { LandingForm } from "@/components/landing/landing-form";

export interface Branding {
  name: string;
  logoUrl: string;
  accentColor: string;
  contactEmail: string;
}

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
}: {
  page: LandingPage;
  org: string;
  branding: Branding;
  preview?: boolean;
}) {
  const accent = branding.accentColor;
  return (
    <div className="min-h-full bg-[#f7f8fa] text-gray-900">
      <header
        className="text-white"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${shade(accent, -0.25)} 100%)`,
        }}
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

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:py-16">
        <section className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            {page.headline}
          </h1>
          {page.subheadline ? (
            <p className="mt-4 text-lg leading-8 text-gray-600">{page.subheadline}</p>
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
          <LandingForm page={page} org={org} accent={accent} preview={preview} />
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
