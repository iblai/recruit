"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/loading-screen";
import { resolveDefaultTenant, tenantHref } from "@/lib/iblai/tenant";

/**
 * `/` names no organization: send the signed-in user to their org's CRM home
 * (`/platform/<org>`). AuthProvider has already made sure they are signed in.
 */
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(tenantHref(resolveDefaultTenant()));
  }, [router]);
  return <LoadingScreen />;
}
