import type { NextRequest } from "next/server";
import { applyCsp } from "@iblai/iblai-js/security/next";
import { adTagHosts, adTags } from "@/lib/recruit/ad-tags";
import { cleanOrigins } from "@/lib/recruit/org-settings";
import { readRecruitSettingsServer } from "@/lib/recruit/settings-server";

// NOTE: on Next.js 16+ this file convention is deprecated — rename it to
// `proxy.ts` and rename the exported function to `proxy`. The body is
// unchanged. See https://nextjs.org/docs/messages/middleware-to-proxy

/** The platform a path names; "" for an address that does not decode, which has no settings. */
function platformIn(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/** Who may frame the public chat: this app's own pages (the SDK adds `'self'`) and the sites the platform listed. `false` leaves a route as it was. */
async function chatFrameAncestors(path: string): Promise<string[] | false> {
  const chat = /^\/chat\/([^/]+)/.exec(path);
  if (!chat) return false;
  const settings = await readRecruitSettingsServer(platformIn(chat[1]));
  return cleanOrigins(settings.websiteOrigins);
}

/** The hosts a landing page's ad tags need; none on any other route or without tags. */
async function landingTagHosts(path: string) {
  const landing = /^\/p\/([^/]+)\//.exec(path);
  if (!landing) return adTagHosts({});
  return adTagHosts(adTags(await readRecruitSettingsServer(platformIn(landing[1]))));
}

// Server components don't have direct access to the request URL/pathname.
// Forward the pathname as a header so layouts can read it via `headers()` and
// branch on the current route.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Attach the per-request, nonce-based Content-Security-Policy. applyCsp
  // stamps the nonce onto these same request headers — preserving x-pathname —
  // and returns the response carrying the CSP header.
  //
  // `next dev` runs report-only so React Refresh / eval() and the error
  // overlay work (the SDK auto-allows dev eval in report-only mode); without
  // it every dev page load reports "eval() is not supported in this
  // environment". NODE_ENV is inlined per build command, so production builds
  // pass `undefined` and the SDK's own resolution stays authoritative:
  // enforce by default, overridable at runtime with CSP_MODE=report-only
  // (validated by the SDK — unknown values fall safe to report-only).
  const tagHosts = await landingTagHosts(request.nextUrl.pathname);
  return applyCsp(request, {
    requestHeaders,
    mode: process.env.NODE_ENV === "development" ? "report-only" : undefined,
    // The chat uploads attachments straight to the platform's media bucket.
    connectSrc: ["https://iblai-app-dm-media.s3.amazonaws.com", ...tagHosts.connectSrc],
    ...(tagHosts.frameSrc.length && { frameSrc: tagHosts.frameSrc }),
    frameAncestors: await chatFrameAncestors(request.nextUrl.pathname),
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
