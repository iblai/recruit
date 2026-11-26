/**
 * The app's namespace inside the organization's public metadata object
 * (`GET/PUT …/dm/api/core/orgs/{org}/metadata/`): `metadata.apps.recruit`.
 *
 * It holds everything ibl.ai/recruit needs once per organization and that is
 * safe to be public — the Chief of Staff agent id, the registered MCP server
 * id, the institution's display settings. Landing pages are CRM web forms.
 * PUT merges into what is stored, nested objects too, so a key is unset by
 * writing `null`; every writer GETs, merges with `mergeRecruitSettings`, and
 * PUTs. Pure module: no React, no SDK; shared by the browser hook, the route
 * handlers and the CLI scripts.
 */
import { APP_SLUG } from "./vocabulary";

export interface RecruitSettings {
  /** The Chief of Staff agent (`unique_id`) members chat with. */
  agentId?: string;
  /** The MCP server record on the platform that points back at this app. */
  mcpServerId?: number;
  /** When an admin last ran the setup. */
  setupCompletedAt?: string;
  /** What the tools' key may do: the CRM User role, or everything its admin may. */
  toolsAccess?: "crm-user" | "owner";
  /** Recruit, the agent prospective students talk to (`unique_id`). */
  studentAgentId?: string;
  /** The MCP server record of Recruit's public tools. */
  studentMcpServerId?: number;
  /** When an admin last set Recruit up. */
  studentSetupCompletedAt?: string;
  /** How Recruit should sound, in the university's words. */
  studentVoice?: string;
  /** Origins of the university's sites that may embed the chat. */
  websiteOrigins?: string[];
  /** Who gets a handoff: by program (lowercase), then the default. */
  counselors?: Record<string, number>;
  handoffCounselorId?: number | null;
  /** The institution's name as prospects should see it. */
  institutionName?: string;
  /** Logo shown on landing pages (https URL). */
  logoUrl?: string;
  /** Accent color for landing pages (hex). */
  accentColor?: string;
  /** Reply-to shown to prospects after they submit a form. */
  contactEmail?: string;
  /** Google tag loaded on landing pages: `G-…` (Analytics) or `AW-…` (Ads). */
  googleTagId?: string;
  /** Google Ads conversion label reported on a sign-up, with an `AW-…` tag. */
  googleAdsLabel?: string;
  /** Meta Pixel loaded on landing pages. */
  metaPixelId?: string;
  /** Postal address at the foot of an email to someone the university found. */
  mailingAddress?: string;
  /** The agent that relays an approved email, and the one mail connector it has. */
  outboxAgentId?: string;
  mailConnector?: { id: number; name: string };
  /** Why the university may contact students it finds on social channels; finding is off until it is written. */
  foundBasis?: string;
  /** Drafts the agents may write in 24 hours; 50 when unset. */
  dailyDrafts?: number;
  [key: string]: unknown;
}

export type OrgMetadata = Record<string, unknown>;

export function readRecruitSettings(metadata: unknown): RecruitSettings {
  const apps = (metadata as { apps?: Record<string, unknown> } | null | undefined)?.apps;
  const mine = apps?.[APP_SLUG];
  if (!mine || typeof mine !== "object") return {};
  // A key that was unset comes back as null.
  return Object.fromEntries(Object.entries(mine).filter(([, v]) => v !== null)) as RecruitSettings;
}

/**
 * Merge `patch` into `metadata.apps.recruit` (unsetting `remove` keys) without
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
  // Null, not delete: the platform keeps a key the body leaves out.
  for (const k of remove) mine[k] = null;
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

/** Who a handoff goes to: the program's counselor, else `fallback`, else the default. */
export function counselorFor(
  settings: RecruitSettings,
  program?: string | null,
  fallback?: number | null,
): number | null {
  const byProgram = settings.counselors?.[(program ?? "").trim().toLowerCase()];
  return byProgram ?? fallback ?? settings.handoffCounselorId ?? null;
}

/** The origins among `list` that are safe to name in a header: `https://host`, or localhost. */
export function cleanOrigins(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const ok = (value: unknown) => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      return url.origin === value && (url.protocol === "https:" || local);
    } catch {
      return false;
    }
  };
  return [...new Set(list.filter(ok) as string[])].slice(0, 20);
}
