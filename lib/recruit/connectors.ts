/**
 * What the app says about a connector on the Chief of Staff: its name and
 * host, never its address (some carry a token). Pure; relative imports only.
 */

export const APIFY_HOST = "mcp.apify.com";

/** The scrapers finding students uses; the connector is limited to them. */
export const FINDING_ACTORS = [
  "apify/instagram-scraper",
  "apify/instagram-hashtag-scraper",
  "trudax/reddit-scraper-lite",
  "apidojo/tweet-scraper",
  "apidojo/twitter-user-scraper",
  "streamers/youtube-scraper",
  "streamers/youtube-comments-scraper",
];

/** Apify's server with only those scrapers as tools: `tools` replaces its default set, which can run any Actor. */
export const FINDING_CONNECTOR_URL = `https://${APIFY_HOST}?tools=${FINDING_ACTORS.join(",")}`;

export interface Connector {
  id: number;
  name: string;
  host: string;
  /** For Apify: whether its address names only the scrapers finding students uses. Null for any other host. */
  pinned: boolean | null;
  /** For Apify: whether its own key is stored but never sent (the platform sends it only with a `platform` scope). Null for any other host. */
  keyIgnored: boolean | null;
}

/** A connector as the platform lists it, reduced to what may be shown. */
export function connectorOf(row: {
  id: number;
  name?: string;
  url?: string;
  auth_type?: string;
  auth_scope?: string;
  credentials?: unknown;
}): Connector {
  let url: URL | null = null;
  try {
    url = new URL(row.url ?? "");
  } catch {
    // An address that does not parse has no host to show.
  }
  const tools = (url?.searchParams.get("tools") ?? "").split(",").filter(Boolean);
  return {
    id: row.id,
    name: row.name ?? "",
    host: url?.host ?? "",
    // A category, `call-actor` or any other Actor (one that browses, or sends DMs) is not finding students.
    pinned:
      url?.host === APIFY_HOST
        ? tools.length > 0 && tools.every((t) => FINDING_ACTORS.includes(t))
        : null,
    // The SDK saves an API-key connector with a `user` scope, where the platform never sends its key.
    keyIgnored:
      url?.host === APIFY_HOST
        ? row.auth_type === "token" && !!row.credentials && row.auth_scope !== "platform"
        : null,
  };
}
