import type { ReactNode } from "react";
import { IblaiProviders } from "@/providers/iblai-providers";

/** Everything a signed-in member sees runs inside the ibl.ai provider chain. */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <IblaiProviders>{children}</IblaiProviders>;
}
