import type { ReactNode } from "react";

/**
 * Public, prospect-facing pages (`/p/<org>/<slug>`): no sign-in, no SDK, no
 * Redux — plain server-rendered React so a landing page loads fast on a
 * phone from a QR code at a college fair.
 */
export default function PublicGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
