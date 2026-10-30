import { isSampleOrg } from "../../iblai/house-journeys";
import {
  readCurrentTenantKey,
  readUserData,
  readUserId,
  readUsername,
  tenantKeyFromPath,
} from "../../iblai/tenant";
import type { SampleVisitor } from "./data";

/** Whether this tab browses the sample: the community organization, for everyone. */
export function sampleSession(pathname: string): boolean {
  return isSampleOrg(tenantKeyFromPath(pathname) ?? readCurrentTenantKey());
}

/** The signed-in user, who owns part of the sample. */
export function sampleVisitor(): SampleVisitor {
  const user = readUserData();
  const name = [user?.user_fullname, user?.user_display_name]
    .map((v) => String(v ?? "").trim())
    .find(Boolean);
  return { id: readUserId() ?? 9101, username: readUsername() || "you", name };
}
