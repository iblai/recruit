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

/** The org's whole metadata object ({} when the org is unknown or unreachable). */
export async function readOrgMetadata(org: string): Promise<Record<string, unknown>> {
  if (!org) return {};
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
  // Some deployments gate the read; fall back to the org's own authority.
  if (apiKeyFor(org)) {
    const data = await platformFetch<{ metadata?: Record<string, unknown> }>(metaPath(org), {
      org,
    }).catch(() => null);
    return data?.metadata ?? {};
  }
  return {};
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
  return readRecruitSettings(merged);
}
