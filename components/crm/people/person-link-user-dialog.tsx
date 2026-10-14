"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SimpleSelect } from "@/components/crm/simple-select";
import { toastApiError } from "@/components/crm/people/crm-error";
import { memberLabel, useMembers } from "@/hooks/use-members";
import { useSession } from "@/hooks/use-session";
import { useLinkPersonUserMutation } from "@/lib/crm/api";
import type { Person } from "@/lib/crm/types";

/**
 * Link a prospect to an existing platform account. Picks from the org's member
 * directory when it is readable, and always accepts a raw user id so members
 * without directory access can still link a known account.
 */
export function PersonLinkUserDialog({
  open,
  onOpenChange,
  person,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person;
}) {
  const { tenantKey } = useSession();
  const { members, isLoading: loadingMembers } = useMembers(tenantKey, { skip: !open });
  const [linkUser, { isLoading }] = useLinkPersonUserMutation();
  const [selected, setSelected] = useState("");
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(person.platform_user ? String(person.platform_user) : "");
    setManualId("");
  }, [open, person.platform_user]);

  const userId = Number(manualId.trim() || selected);
  const valid = Number.isFinite(userId) && userId > 0;

  const submit = async () => {
    if (!valid) return;
    try {
      await linkUser({ id: person.id, user_id: userId }).unwrap();
      onOpenChange(false);
      toast.success(`${person.name} is now linked to user #${userId}`);
    } catch (err) {
      toastApiError(err, "Could not link this prospect");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to a platform user</DialogTitle>
          <DialogDescription>
            Connect {person.name} to an account that already exists on this organization.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label>Member</Label>
            <SimpleSelect
              value={selected}
              onChange={(v) => {
                setSelected(v);
                setManualId("");
              }}
              options={members.map((m) => ({ value: String(m.id), label: memberLabel(m) }))}
              allowEmpty
              emptyLabel="Choose a member…"
              placeholder={loadingMembers ? "Loading members…" : "Choose a member…"}
              aria-label="Member"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="link-user-id">…or enter a user id</Label>
            <Input
              id="link-user-id"
              inputMode="numeric"
              value={manualId}
              onChange={(e) => setManualId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 4821"
            />
            <p className="text-muted-foreground text-xs">
              Use this when the member directory is not available to you.
            </p>
          </div>

          <DialogFooter className="mt-1">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" className="ibl-button-primary" disabled={!valid || isLoading}>
              {isLoading ? <Spinner data-icon="inline-start" /> : null}
              Link user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
