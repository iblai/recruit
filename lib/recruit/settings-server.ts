/**
 * Server-side access to the app's organization settings
 * (`metadata.apps.recruit` in the org's public metadata object).
 *
 * Reads are public on the platform — a landing page can be rendered for an
 * organization the server holds no key for. Writes need the org's Platform
 * API Token and always GET → merge → PUT so the OS's own keys survive.
 * Relative imports on purpose (vitest, CLI).
 */
import { apiKeyFor, platformBase, platformFetch } from "../iblai/platform";
import { mergeRecruitSettings, readRecruitSettings, type RecruitSettings } from "./org-settings";

const metaPath = (org: string) => `/dm/api/core/orgs/${encodeURIComponent(org)}/metadata/`;

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; metadata: Record<string, unknown> }>();

async function fetchOrgMetadata(org: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${platformBase()}${metaPath(org)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);
  if (res?.ok) {
    const data = (await res.json().catch(() => null)) as {
      metadata?: Record<string, unknown>;
    } | null;
    return data?.metadata ?? {};
  }
  if (res && (res.status === 404 || res.status === 403)) return {};
  // Some deployments gate the read; fall back to the org's own authority.
  if (apiKeyFor(org)) {
    const data = await platformFetch<{ metadata?: Record<string, unknown> }>(metaPath(org), {
      org,
    }).catch(() => null);
    if (data) return data.metadata ?? {};
  }
  return null; // transient: throttled (429), network, 5xx
}

/**
 * The org's whole metadata object. Cached for a minute per organization and
 * served from the last good copy when the platform throttles or hiccups, so
 * a live landing page or a tool call never disappears behind a 429.
 */
export async function readOrgMetadata(org: string): Promise<Record<string, unknown>> {
  if (!org) return {};
  const hit = cache.get(org);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.metadata;
  let metadata = await fetchOrgMetadata(org);
  if (metadata === null) {
    await new Promise((r) => setTimeout(r, 1500));
    metadata = await fetchOrgMetadata(org);
  }
  if (metadata === null) return hit?.metadata ?? {};
  cache.set(org, { at: Date.now(), metadata });
  return metadata;
}

/** Forget the cached copy (after this server wrote the metadata). */
export function invalidateOrgMetadata(org: string) {
  cache.delete(org);
}

export async function readRecruitSettingsServer(org: string): Promise<RecruitSettings> {
  return readRecruitSettings(await readOrgMetadata(org));
}

/** Merge `patch` into the app's namespace and save (org authority). */
export async function writeRecruitSettings(
  org: string,
  patch: Partial<RecruitSettings>,
  remove: string[] = [],
): Promise<RecruitSettings> {
  const latest = await platformFetch<{ metadata?: Record<string, unknown> }>(metaPath(org), {
    org,
  });
  const merged = mergeRecruitSettings(latest?.metadata ?? {}, patch, remove);
  await platformFetch(metaPath(org), { org, method: "PUT", body: { metadata: merged } });
  cache.set(org, { at: Date.now(), metadata: merged });
  return readRecruitSettings(merged);
}
