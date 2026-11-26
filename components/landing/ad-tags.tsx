"use client";

import { useEffect } from "react";
import type { AdTags as Tags } from "@/lib/recruit/ad-tags";

type Queue = ((...args: unknown[]) => void) & { queue?: unknown[][] };
type TagWindow = Window & { dataLayer?: unknown[]; gtag?: Queue; fbq?: Queue; _fbq?: Queue };

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Loads the platform's Google tag and Meta Pixel and reports the page view. */
export function AdTags({ tags }: { tags: Tags }) {
  const { googleTagId, metaPixelId } = tags;
  useEffect(() => {
    // Consent prompt goes here before any tag loads.
    const w = window as TagWindow;
    try {
      // Staff looking at their own page: their session lives on this origin, and a tag's script could read it.
      if (
        ["axd_token", "dm_token"].some((k) => localStorage.getItem(k) ?? sessionStorage.getItem(k))
      )
        return;
      if (googleTagId && !w.gtag) {
        w.dataLayer = w.dataLayer || [];
        // gtag.js reads the `arguments` object, not an array.
        w.gtag = function () {
          // eslint-disable-next-line prefer-rest-params
          w.dataLayer!.push(arguments);
        };
        w.gtag("js", new Date());
        w.gtag("config", googleTagId);
        addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`);
      }
      if (metaPixelId && !w.fbq) {
        const fbq: Queue & {
          callMethod?: Queue;
          push?: Queue;
          loaded?: boolean;
          version?: string;
        } = function (...args: unknown[]) {
          if (fbq.callMethod) fbq.callMethod(...args);
          else fbq.queue!.push(args);
        };
        fbq.queue = [];
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        w.fbq = w._fbq = fbq;
        fbq("init", metaPixelId);
        fbq("track", "PageView");
        addScript("https://connect.facebook.net/en_US/fbevents.js");
      }
    } catch {
      // A tag that fails must never break the page.
    }
  }, [googleTagId, metaPixelId]);
  return null;
}

/** Reports a sign-up to the tags that are set; never throws. */
export function reportSignUp(tags: Tags) {
  try {
    const w = window as TagWindow;
    if (tags.googleTagId) {
      w.gtag?.("event", "generate_lead");
      if (tags.sendTo) w.gtag?.("event", "conversion", { send_to: tags.sendTo });
    }
    if (tags.metaPixelId) w.fbq?.("track", "Lead");
  } catch {
    // Measurement never blocks the visitor.
  }
}
