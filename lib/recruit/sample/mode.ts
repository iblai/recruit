import config from "../../iblai/config";
import {
  isTenantAdmin,
  readCurrentTenantKey,
  readUserData,
  readUserId,
  readUsername,
  tenantKeyFromPath,
} from "../../iblai/tenant";
import type { SampleVisitor } from "./data";

/** Whether this tab browses the sample: the community organization, for anyone who does not administer it. */
export function sampleSession(pathname: string): boolean {
  const main = config.mainTenantKey();
  const org = tenantKeyFromPath(pathname) ?? readCurrentTenantKey();
  return org === main && !isTenantAdmin(main);
}

/** The signed-in user, who owns part of the sample. */
export function sampleVisitor(): SampleVisitor {
  const user = readUserData();
  const name = [user?.user_fullname, user?.user_display_name]
    .map((v) => String(v ?? "").trim())
    .find(Boolean);
  return { id: readUserId() ?? 9101, username: readUsername() || "you", name };
}
