import { toast } from "sonner";
import { errorMessage, errorStatus } from "@/lib/crm/api";

/**
 * Toast an API failure the way the CRM talks about them: permission errors
 * read as permission errors, everything else falls back to the API's detail.
 */
export function toastApiError(err: unknown, fallback?: string) {
  if (errorStatus(err) === 403) {
    toast.error("You don't have permission to do that");
    return;
  }
  toast.error(errorMessage(err, fallback));
}
