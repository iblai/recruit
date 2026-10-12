/**
 * ibl.ai runtime configuration for ibl.ai/recruit.
 *
 * Hosted-iblai.app defaults live in code: with no env vars at all, every
 * service routes through https://api.iblai.app and sign-in goes through
 * https://login.iblai.app. `.env.local` (copied from `.env.example`) holds
 * the optional overrides for self-hosted deployments and the server secrets.
 *
 * Priority: runtime window.__ENV__ → build-time process.env → fallback.
 *
 * This is a MULTI-ORGANIZATION app (the os.ibl.ai model): the organization
 * comes from the URL (`/platform/[tenantKey]/…`), `NEXT_PUBLIC_MAIN_TENANT_KEY`
 * is only the community org used as the last-resort default. Most
 * institutions deploy it for one organization and give the server that
 * organization's Platform API Token (`IBLAI_API_KEY`).
 */

// Static env declarations — Next.js inlines NEXT_PUBLIC_* values at build
// time only when they appear as literal process.env.NEXT_PUBLIC_* references.
const env = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
  NEXT_PUBLIC_BASE_WS_URL: process.env.NEXT_PUBLIC_BASE_WS_URL,
  NEXT_PUBLIC_LEGACY_LMS_URL: process.env.NEXT_PUBLIC_LEGACY_LMS_URL,
  NEXT_PUBLIC_PLATFORM_BASE_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN,
  NEXT_PUBLIC_MAIN_TENANT_KEY: process.env.NEXT_PUBLIC_MAIN_TENANT_KEY,
  NEXT_PUBLIC_IBL_PLATFORM: process.env.NEXT_PUBLIC_IBL_PLATFORM,
  NEXT_PUBLIC_TAURI_CUSTOM_SCHEME: process.env.NEXT_PUBLIC_TAURI_CUSTOM_SCHEME,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_HELP_CENTER_URL: process.env.NEXT_PUBLIC_HELP_CENTER_URL,
  NEXT_PUBLIC_DOCUMENTATION_URL: process.env.NEXT_PUBLIC_DOCUMENTATION_URL,
  NEXT_PUBLIC_OS_URL: process.env.NEXT_PUBLIC_OS_URL,
  NEXT_PUBLIC_ENABLE_RBAC: process.env.NEXT_PUBLIC_ENABLE_RBAC,
  NEXT_PUBLIC_ENABLE_GRAVATAR_ON_PROFILE_PIC:
    process.env.NEXT_PUBLIC_ENABLE_GRAVATAR_ON_PROFILE_PIC,
  NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
  NEXT_PUBLIC_DEFAULT_AGENT_ID: process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID,
};

declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

const runtimeEnv = () => (typeof window !== "undefined" ? window.__ENV__ || {} : {});

/** First non-empty value wins: runtime env.js → build-time env → fallback. */
const getEnv = (key: keyof typeof env, fallback = ""): string => {
  const runtime = runtimeEnv()[key];
  if (runtime !== undefined && runtime !== null && runtime !== "") return runtime;
  const build = env[key];
  if (build !== undefined && build !== null && build !== "") return build;
  return fallback;
};

const domain = () => getEnv("NEXT_PUBLIC_PLATFORM_BASE_DOMAIN", "iblai.app");

// With no explicit NEXT_PUBLIC_API_BASE_URL, hosted iblai.app always routes
// through the consolidated API — its per-service subdomains reject the
// session tokens the Auth SPA issues. A non-iblai.app domain with no API
// base opts into distributed mode.
const apiBase = () => {
  const explicit = getEnv("NEXT_PUBLIC_API_BASE_URL");
  if (explicit) return explicit;
  return domain() === "iblai.app" ? "https://api.iblai.app" : "";
};

const config = {
  authUrl: () => getEnv("NEXT_PUBLIC_AUTH_URL", `https://login.${domain()}`),

  lmsUrl: () => {
    const base = apiBase();
    if (base) return `${base}/lms`;
    return `https://learn.${domain()}`;
  },

  /** Data Manager — the CRM API lives here (`/api/crm/…`). */
  dmUrl: () => {
    const base = apiBase();
    if (base) return `${base}/dm`;
    return `https://base.manager.${domain()}`;
  },

  axdUrl: () => {
    const base = apiBase();
    if (base) return `${base}/axd`;
    return `https://base.manager.${domain()}`;
  },

  legacyLmsUrl: () => getEnv("NEXT_PUBLIC_LEGACY_LMS_URL", `https://learn.${domain()}`),

  baseWsUrl: () => getEnv("NEXT_PUBLIC_BASE_WS_URL", `wss://asgi.data.${domain()}`),

  /** The community organization — the default when nothing else resolves. */
  mainTenantKey: () => getEnv("NEXT_PUBLIC_MAIN_TENANT_KEY", "main"),

  /** `app=` sent to the Auth SPA — same as the OS so every org signs in. */
  iblPlatform: () => getEnv("NEXT_PUBLIC_IBL_PLATFORM", "mentor"),

  tauriCustomScheme: () => getEnv("NEXT_PUBLIC_TAURI_CUSTOM_SCHEME", "iblai-recruit"),
  platformBaseDomain: () => domain(),

  appName: () => getEnv("NEXT_PUBLIC_APP_NAME", "ibl.ai/recruit"),
  /**
   * The public origin this deployment is reachable at (`https://recruit.example.edu`).
   * Used for landing-page links and for the URL the platform's agent runtime
   * calls back on. In the browser it falls back to `window.location.origin`.
   */
  appUrl: () => {
    const explicit = getEnv("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
    if (explicit) return explicit;
    return typeof window !== "undefined" ? window.location.origin : "";
  },
  supportEmail: () => getEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@ibl.ai"),
  helpCenterUrl: () => getEnv("NEXT_PUBLIC_HELP_CENTER_URL", "https://ibl.ai/support"),
  documentationUrl: () =>
    getEnv("NEXT_PUBLIC_DOCUMENTATION_URL", "https://github.com/iblai/recruit#readme"),
  /** The Agentic OS — where agents, billing and org admin live. */
  osUrl: () => getEnv("NEXT_PUBLIC_OS_URL", "https://os.ibl.ai"),

  enableRBAC: () => getEnv("NEXT_PUBLIC_ENABLE_RBAC", "false") === "true",
  enableGravatarOnProfilePic: () =>
    getEnv("NEXT_PUBLIC_ENABLE_GRAVATAR_ON_PROFILE_PIC", "true") !== "false",
  defaultCurrency: () => getEnv("NEXT_PUBLIC_DEFAULT_CURRENCY", "USD"),

  /**
   * A Chief of Staff agent pinned at build time. When empty (the default) the
   * agent an admin set up is read from the organization's metadata.
   */
  defaultAgentId: () => getEnv("NEXT_PUBLIC_DEFAULT_AGENT_ID", ""),

  // ---------------------------------------------------------------- server
  // Secrets are not NEXT_PUBLIC_*, so Next.js never inlines them into the
  // client bundle — in the browser every one of these returns "".

  /** The org's Platform API Token (see `apiKeyFor` in lib/iblai/platform.ts). */
  apiKey: () => process.env.IBLAI_API_KEY ?? "",
  /** JSON map `{ "<org key>": "<Platform API Token>" }` for multi-institution deployments. */
  apiKeys: () => process.env.IBLAI_API_KEYS ?? "",
  /** The platform username whose authority the server uses for agent setup. */
  apiUsername: () => process.env.IBLAI_USERNAME ?? "",
  /** Shared secret the platform's agent runtime presents to `/api/mcp/<org>`. */
  mcpToken: () => process.env.RECRUIT_MCP_TOKEN ?? "",
};

export default config;
export { getEnv };
