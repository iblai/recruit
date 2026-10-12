import { NextResponse } from "next/server";

/**
 * Same-origin hop to the Auth SPA. The SDK's redirectToAuthSpa routes through
 * this proxy (`/api/auth-redirect?to=https://login.…`) so the navigation
 * starts from our own origin — the desktop shell's navigation filter relies
 * on that. Only absolute http(s) targets are accepted.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("to");

  if (!target?.startsWith("http://") && !target?.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid redirect URL" }, { status: 400 });
  }

  return NextResponse.redirect(target);
}
