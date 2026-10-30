import { TenantRedirect } from "@/components/tenant-redirect";

/** `/` names no organization: send the user to `/platform/<their organization>`. */
export default function RootPage() {
  return <TenantRedirect />;
}
