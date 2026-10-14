/**
 * The app's namespace inside the organization's public metadata object
 * (`GET/PUT …/dm/api/core/orgs/{org}/metadata/`): `metadata.apps.recruit`.
 *
 * It holds everything ibl.ai/recruit needs once per organization and that is
 * safe to be public — the Chief of Staff agent id, the registered MCP server
 * id, the landing pages, the institution's display settings. PUT replaces the
 * whole object, so every writer GETs, merges with `mergeRecruitSettings`, and
 * PUTs. Pure module: no React, no SDK; shared by the browser hook, the route
 * handlers and the CLI scripts.
 */
import { APP_SLUG } from "./vocabulary";
import type { LandingPage } from "./landing-pages";

export interface RecruitSettings {
  /** The Chief of Staff agent (`unique_id`) members chat with. */
  agentId?: string;
  /** The MCP server record on the platform that points back at this app. */
  mcpServerId?: number;
  /** When an admin last ran the setup. */
  setupCompletedAt?: string;
  /** The institution's name as prospects should see it. */
  institutionName?: string;
  /** Logo shown on landing pages (https URL). */
  logoUrl?: string;
  /** Accent color for landing pages (hex). */
  accentColor?: string;
  /** Reply-to shown to prospects after they submit a form. */
  contactEmail?: string;
  landingPages?: LandingPage[];
  [key: string]: unknown;
}

export type OrgMetadata = Record<string, unknown>;

export function readRecruitSettings(metadata: unknown): RecruitSettings {
  const apps = (metadata as { apps?: Record<string, unknown> } | null | undefined)?.apps;
  const mine = apps?.[APP_SLUG];
  return mine && typeof mine === "object" ? (mine as RecruitSettings) : {};
}

/**
 * Merge `patch` into `metadata.apps.recruit` (dropping `remove` keys) without
 * touching the OS's own keys or other apps' namespaces.
 */
export function mergeRecruitSettings(
  metadata: unknown,
  patch: Partial<RecruitSettings>,
  remove: string[] = [],
): OrgMetadata {
  const root: OrgMetadata =
    metadata && typeof metadata === "object" ? { ...(metadata as OrgMetadata) } : {};
  const apps = { ...(root.apps as Record<string, unknown> | undefined) };
  const mine: RecruitSettings = { ...readRecruitSettings(root), ...patch };
  for (const k of remove) delete mine[k];
  apps[APP_SLUG] = mine;
  root.apps = apps;
  return root;
}

/** The institution's branding, with the org-level metadata keys as fallback. */
export function institutionBranding(metadata: unknown, orgKey: string) {
  const mine = readRecruitSettings(metadata);
  const root = (metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  return {
    name: str(mine.institutionName) || str(root.platform_name) || str(root.name) || orgKey,
    logoUrl: str(mine.logoUrl) || str(root.logo) || str(root.light_logo) || "",
    accentColor: /^#[0-9a-f]{6}$/i.test(str(mine.accentColor)) ? str(mine.accentColor) : "#0058cc",
    contactEmail: str(mine.contactEmail) || str(root.support_email) || "",
  };
}
