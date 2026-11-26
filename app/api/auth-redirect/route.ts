import { NextResponse } from "next/server";

import config from "@/lib/iblai/config";
import { isAuthSpaTarget } from "@/lib/iblai/sso-redirect";

/**
 * Same-origin hop to the Auth SPA. The SDK's redirectToAuthSpa routes through
 * this proxy (`/api/auth-redirect?to=https://login.…`) so the navigation
 * starts from our own origin — the desktop shell's navigation filter relies
 * on that. Only the Auth SPA's own origin is accepted.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("to");

  if (!isAuthSpaTarget(target, config.authUrl())) {
    return NextResponse.json({ error: "Invalid redirect URL" }, { status: 400 });
  }

  return NextResponse.redirect(target);
}
