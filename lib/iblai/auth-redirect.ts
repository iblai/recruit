import config from "./config";

/** The login page with this app nested inside — where the platform returns a user after a checkout. */
export function loginReturnUrl(target: string): string {
  return `${config.authUrl()}/login?app=${encodeURIComponent(config.iblPlatform())}&redirect-to=${encodeURIComponent(target)}`;
}

/** ibl.ai's direct $0 join checkout, back to `origin` through the login page, cancelled or not. */
export function createOrganizationUrl(origin: string, email = ""): string {
  const back = loginReturnUrl(origin);
  const params = new URLSearchParams({ redirect_url: back, cancel_url: back });
  // Prefills (and locks) the Checkout email, so the new organization attaches to this account.
  if (email) params.set("email", email);
  return `${config.dmUrl()}/api/service/stripe/checkout/redirect/credits-free-plan/?${params}`;
}
