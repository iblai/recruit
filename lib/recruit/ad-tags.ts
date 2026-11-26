/**
 * Ad measurement on the public landing page: which Google tag and Meta Pixel a
 * platform set, the policy hosts they need, and the ad click IDs a sign-up keeps.
 * Pure module; unit-tested in __tests__/ad-tags.test.ts.
 */
import type { RecruitSettings } from "./org-settings";

export interface AdTags {
  googleTagId?: string;
  /** `AW-…/label`, only with an Ads tag ID. */
  sendTo?: string;
  metaPixelId?: string;
}

export const isGoogleTagId = (v: string) => /^(G|AW|GT)-[A-Z0-9]{4,20}$/.test(v);
export const isAdsLabel = (v: string) => /^[A-Za-z0-9_-]{4,40}$/.test(v);
export const isMetaPixelId = (v: string) => /^\d{5,20}$/.test(v);

/** The tags a platform set that are safe to load; anything invalid is dropped. */
export function adTags(s: RecruitSettings): AdTags {
  const out: AdTags = {};
  if (s.googleTagId && isGoogleTagId(s.googleTagId)) {
    out.googleTagId = s.googleTagId;
    if (s.googleTagId.startsWith("AW-") && s.googleAdsLabel && isAdsLabel(s.googleAdsLabel)) {
      out.sendTo = `${s.googleTagId}/${s.googleAdsLabel}`;
    }
  }
  if (s.metaPixelId && isMetaPixelId(s.metaPixelId)) out.metaPixelId = s.metaPixelId;
  return out;
}

/** The policy hosts the set tags need beyond the app's own. */
export function adTagHosts(t: AdTags): { connectSrc: string[]; frameSrc: string[] } {
  const connectSrc: string[] = [];
  const frameSrc: string[] = [];
  if (t.googleTagId) {
    // Google's list for a Google tag, a property linked to Ads included (tag-platform/security/guides/csp).
    connectSrc.push(
      "https://*.googletagmanager.com",
      "https://*.google-analytics.com",
      "https://*.google.com",
      "https://*.g.doubleclick.net",
      "https://pagead2.googlesyndication.com",
    );
    frameSrc.push("https://www.googletagmanager.com");
    if (t.googleTagId.startsWith("AW-")) {
      connectSrc.push("https://www.googleadservices.com", "https://ad.doubleclick.net");
      frameSrc.push("https://td.doubleclick.net");
    }
  }
  if (t.metaPixelId) connectSrc.push("https://www.facebook.com");
  return { connectSrc, frameSrc };
}

const CLICK_IDS = ["gclid", "gbraid", "wbraid", "fbclid"];

/** The ad click IDs in the page's query, as the `utm_*` keys the platform keeps. */
export function clickIds(params: URLSearchParams | Record<string, string>): Record<string, string> {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.get(k) : (params[k] ?? null);
  const out: Record<string, string> = {};
  for (const k of CLICK_IDS) {
    const v = get(k);
    // The platform drops a value over 200 characters; a cut ID would be someone else's.
    if (v && v.length <= 200) out[`utm_${k}`] = v;
  }
  return out;
}
