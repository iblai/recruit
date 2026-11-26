import { describe, expect, it } from "vitest";
import {
  adTagHosts,
  adTags,
  clickIds,
  isAdsLabel,
  isGoogleTagId,
  isMetaPixelId,
} from "../lib/recruit/ad-tags";
import { pickUtm } from "../lib/recruit/landing-pages";

const ATTACKS = [
  `G-ABC123'`,
  `G-ABC123"`,
  "G-ABC<script>",
  "G-ABC 123",
  "https://evil.example/G-ABC123",
  "G-ABC123,G-DEF456",
  "",
];

describe("validators", () => {
  it("accept real IDs", () => {
    expect(isGoogleTagId("G-ABC123XYZ")).toBe(true);
    expect(isGoogleTagId("AW-123456789")).toBe(true);
    expect(isGoogleTagId("GT-ABCD1234")).toBe(true);
    expect(isAdsLabel("AbC-123_xyz")).toBe(true);
    expect(isMetaPixelId("123456789012345")).toBe(true);
  });

  it("refuse injection attempts", () => {
    for (const v of ATTACKS) {
      expect(isGoogleTagId(v)).toBe(false);
      expect(isAdsLabel(v)).toBe(false);
      expect(isMetaPixelId(v)).toBe(false);
    }
    for (const v of [
      "12345'",
      "12345 6789",
      "<12345>",
      "12345,67890",
      "https://x/12345",
      "g-abc1",
    ]) {
      expect(isMetaPixelId(v)).toBe(false);
      expect(isGoogleTagId(v)).toBe(false);
    }
    expect(isAdsLabel("abc/def")).toBe(false);
    expect(isAdsLabel("abcd,efgh")).toBe(false);
  });
});

describe("adTags", () => {
  it("drops invalid values and ignores the label without an AW- ID", () => {
    expect(adTags({ googleTagId: "G-ABC123", googleAdsLabel: "label1", metaPixelId: "x" })).toEqual(
      { googleTagId: "G-ABC123" },
    );
    expect(adTags({ googleTagId: "AW-1234567", googleAdsLabel: "label1" })).toEqual({
      googleTagId: "AW-1234567",
      sendTo: "AW-1234567/label1",
    });
    expect(adTags({ googleTagId: "AW-1234567", googleAdsLabel: "bad label" })).toEqual({
      googleTagId: "AW-1234567",
    });
    expect(adTags({ googleAdsLabel: "label1", metaPixelId: "1234567" })).toEqual({
      metaPixelId: "1234567",
    });
    expect(adTags({})).toEqual({});
  });
});

describe("adTagHosts", () => {
  it("names no host without tags", () => {
    expect(adTagHosts({})).toEqual({ connectSrc: [], frameSrc: [] });
  });

  it("names only the hosts of the tags set", () => {
    const ga = adTagHosts({ googleTagId: "G-ABC123" });
    expect(ga.connectSrc).toContain("https://*.google-analytics.com");
    expect(ga.connectSrc).not.toContain("https://www.googleadservices.com");
    expect(ga.connectSrc).not.toContain("https://www.facebook.com");
    expect(ga.frameSrc).toEqual(["https://www.googletagmanager.com"]);

    const ads = adTagHosts({ googleTagId: "AW-1234567" });
    expect(ads.connectSrc).toContain("https://www.googleadservices.com");
    expect(ads.frameSrc).toEqual([
      "https://www.googletagmanager.com",
      "https://td.doubleclick.net",
    ]);
    // Every source is an https origin, so nothing here can widen a directive past a host.
    for (const host of [...ads.connectSrc, ...ads.frameSrc])
      expect(host).toMatch(/^https:\/\/[*a-z0-9.-]+$/);

    expect(adTagHosts({ metaPixelId: "1234567" })).toEqual({
      connectSrc: ["https://www.facebook.com"],
      frameSrc: [],
    });
  });
});

describe("click IDs", () => {
  it("map to utm_ keys", () => {
    expect(clickIds(new URLSearchParams("gclid=a&gbraid=b&wbraid=c&fbclid=d&x=y"))).toEqual({
      utm_gclid: "a",
      utm_gbraid: "b",
      utm_wbraid: "c",
      utm_fbclid: "d",
    });
  });

  it("come first in pickUtm and survive the cap of 8", () => {
    const qs = Array.from({ length: 10 }, (_, i) => `utm_k${i}=v`).join("&");
    const utm = pickUtm(new URLSearchParams(`${qs}&gclid=G1&fbclid=F1`));
    const keys = Object.keys(utm);
    expect(keys).toHaveLength(8);
    expect(keys.slice(0, 2)).toEqual(["utm_gclid", "utm_fbclid"]);
    expect(utm.utm_gclid).toBe("G1");
    expect(pickUtm({ gclid: "x".repeat(200) }).utm_gclid).toHaveLength(200);
    expect(pickUtm({ gclid: "x".repeat(201) })).not.toHaveProperty("utm_gclid");
  });
});
