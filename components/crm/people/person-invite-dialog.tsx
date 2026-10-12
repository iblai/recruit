"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/crm/confirm-dialog";
import { toastApiError } from "@/components/crm/people/crm-error";
import { errorStatus, useInvitePersonMutation } from "@/lib/crm/api";
import type { Person } from "@/lib/crm/types";

/**
 * Invite a prospect to the platform: sends the ibl.ai invitation to their
 * primary email and links the account back to this record once accepted.
 */
export function PersonInviteDialog({
  open,
  onOpenChange,
  person,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person;
}) {
  const [invite, { isLoading }] = useInvitePersonMutation();
  const [asAdmin, setAsAdmin] = useState(false);

  useEffect(() => {
    if (open) setAsAdmin(false);
  }, [open]);

  const confirm = async () => {
    try {
      const res = await invite({ id: person.id, body: { is_admin: asAdmin } }).unwrap();
      onOpenChange(false);
      toast.success(`Invitation sent to ${res.invitation_email || person.primary_email}`);
    } catch (err) {
      const status = errorStatus(err);
      if (status === 409) {
        toast.error("An invitation already exists for this prospect");
        return;
      }
      if (status === 422) {
        toast.error("This prospect is already linked to a platform user");
        return;
      }
      toastApiError(err, "Could not send the invitation");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Invite ${person.name} to the platform?`}
      description={
        <>
          <span className="block">
            We&rsquo;ll email an invitation to{" "}
            <span className="font-medium text-gray-900">{person.primary_email}</span>. When they
            accept, their account is linked to this record so you can see their learning activity.
          </span>
          <label
            htmlFor="invite-as-admin"
            className="mt-3 inline-flex items-center gap-2 text-sm text-gray-900"
          >
            <Checkbox
              id="invite-as-admin"
              checked={asAdmin}
              onCheckedChange={(checked) => setAsAdmin(checked)}
              disabled={isLoading}
            />
            Invite as admin
          </label>
        </>
      }
      confirmLabel="Send invitation"
      loading={isLoading}
      onConfirm={confirm}
    />
  );
}
