/**
 * Decide the post-SSO landing path.
 *
 * The path SsoLogin resolved from localStorage (`redirect-to`) wins; an
 * explicit same-origin `?redirect-path=` on the URL is honored only when it
 * is a plain path (one leading slash, no `//` or `/\` authority — otherwise it
 * would be an open redirect). Finally, a path scoped to `/platform/<org>` for
 * an org other than the one just authenticated is stale — reset to `/`, which
 * resolves the session's org.
 */
export function resolveSsoRedirectPath(
  resolvedPath: string,
  parsedData: Record<string, string>,
  search: string,
): string {
  let redirectPath = resolvedPath || "/";

  const explicit = new URLSearchParams(search).get("redirect-path");
  if (explicit && /^\/(?![/\\])/.test(explicit)) {
    redirectPath = explicit;
  }

  const match = redirectPath.match(/^\/platform\/([^/]+)/);
  if (match) {
    const pathTenant = decodeURIComponent(match[1]);
    const authenticated = parsedData?.tenant;
    if (authenticated && pathTenant !== authenticated) {
      redirectPath = "/";
    }
  }

  return redirectPath;
}
