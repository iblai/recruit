import { toast } from "sonner";
import { errorMessage, errorStatus } from "@/lib/crm/api";

/** `Fall 2027 Undergraduate` → `fall-2027-undergraduate`. */
export function slugify(value: string, max = 50): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/**
 * Only CRM Managers (org admins) may change funnels, stages and sources —
 * say so plainly instead of leaking the API's 403 body.
 */
export function settingsError(err: unknown, fallback = "Something went wrong"): string {
  if (errorStatus(err) === 403) return "You don't have permission to do that";
  return errorMessage(err, fallback);
}

export function toastSettingsError(err: unknown, fallback?: string) {
  toast.error(settingsError(err, fallback));
}
