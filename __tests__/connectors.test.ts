import { describe, expect, it } from "vitest";
import { FINDING_CONNECTOR_URL, connectorOf } from "../lib/recruit/connectors";

describe("connectorOf", () => {
  const of = (url: string) => connectorOf({ id: 1, name: "Apify", url });

  it("shows a connector's host and never its address or its key", () => {
    const out = connectorOf({
      id: 4,
      name: "Mail",
      url: "https://mail.example/mcp?key=secret",
      credentials: "secret-key",
    });
    expect(out).toEqual({
      id: 4,
      name: "Mail",
      host: "mail.example",
      pinned: null,
      keyIgnored: null,
    });
    expect(JSON.stringify(out)).not.toMatch(/secret/);
  });

  it("says when an Apify connector's own key is never sent: an API key with any scope but the platform's", () => {
    const key = (auth_scope: string, credentials: unknown = "k") =>
      connectorOf({
        id: 3,
        url: FINDING_CONNECTOR_URL,
        auth_type: "token",
        auth_scope,
        credentials,
      }).keyIgnored;
    // What the SDK's Add Connector saves for an API key.
    expect(key("user")).toBe(true);
    expect(key("mentor")).toBe(true);
    expect(key("platform")).toBe(false);
    expect(key("user", "")).toBe(false);
    expect(
      connectorOf({ id: 5, url: "https://other.example/mcp", auth_type: "token", credentials: "k" })
        .keyIgnored,
    ).toBeNull();
  });

  it("calls an Apify connector limited only when every tool it names is one of the scrapers", () => {
    expect(of(FINDING_CONNECTOR_URL).pinned).toBe(true);
    expect(of("https://mcp.apify.com/?tools=apify/instagram-scraper").pinned).toBe(true);
    // X and YouTube's scrapers, and an older address with only the first three, are limited too.
    expect(
      of("https://mcp.apify.com/?tools=apidojo/tweet-scraper,streamers/youtube-comments-scraper")
        .pinned,
    ).toBe(true);
    expect(
      of(
        "https://mcp.apify.com?tools=apify/instagram-scraper,apify/instagram-hashtag-scraper,trudax/reddit-scraper-lite",
      ).pinned,
    ).toBe(true);
    expect(FINDING_CONNECTOR_URL).toContain(
      "apidojo/twitter-user-scraper,streamers/youtube-scraper",
    );
    // Another Actor is not finding students: one browses anywhere, one sends DMs.
    expect(of("https://mcp.apify.com/?tools=apify/rag-web-browser").pinned).toBe(false);
    expect(
      of("https://mcp.apify.com/?tools=apify/instagram-scraper,someone/instagram-dm-sender").pinned,
    ).toBe(false);
    // Apify's default set, a category and a tool name can each run any Actor.
    expect(of("https://mcp.apify.com").pinned).toBe(false);
    expect(of("https://mcp.apify.com/?tools=").pinned).toBe(false);
    expect(of("https://mcp.apify.com/?tools=actors,apify/instagram-scraper").pinned).toBe(false);
    expect(of("https://mcp.apify.com/?tools=apify/instagram-scraper,call-actor").pinned).toBe(
      false,
    );
  });

  it("says nothing about limits for another host, or an address it cannot read", () => {
    expect(of("https://evil.example/?tools=apify/instagram-scraper").pinned).toBeNull();
    expect(connectorOf({ id: 2 })).toEqual({
      id: 2,
      name: "",
      host: "",
      pinned: null,
      keyIgnored: null,
    });
  });
});
