"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingScreen } from "@/components/loading-screen";
import { resolveSsoRedirectPath } from "@/lib/iblai/sso-redirect";

export const dynamic = "force-dynamic";

/**
 * Native (Tauri) SSO landing. Mobile WebViews are refused by SSO providers,
 * so the shell opens the Auth SPA in the system browser and returns through
 * `<scheme>://mobile-sso-login?data=…`, which the Rust side turns into this
 * route. Same storage contract as /sso-login-complete.
 */
function MobileSsoLoginContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const data = searchParams.get("data");
    if (!data) return;
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(data);
    } catch {
      window.location.href = "/error/400";
      return;
    }
    Object.entries(parsed).forEach(([key, value]) => {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    });
    const saved = localStorage.getItem("redirect-to") || "/";
    localStorage.removeItem("redirect-to");
    const target = resolveSsoRedirectPath(saved, parsed, window.location.search);
    window.location.href = `${window.location.origin}${target}`;
  }, [searchParams]);

  return <LoadingScreen message="Completing sign-in…" />;
}

export default function MobileSsoLoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MobileSsoLoginContent />
    </Suspense>
  );
}
