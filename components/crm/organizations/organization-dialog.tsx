"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { InfoTip } from "@/components/crm/info-tip";
import { OwnerSelect } from "@/components/crm/owner-select";
import { SimpleSelect } from "@/components/crm/simple-select";
import { SCHOOL_TYPE_FIELD } from "@/components/crm/organizations/school-type";
import { toastApiError } from "@/components/crm/people/crm-error";
import { useSession } from "@/hooks/use-session";
import { useCreateOrganizationMutation } from "@/lib/crm/api";
import type { Address, Organization } from "@/lib/crm/types";
import { withMeta } from "@/lib/recruit/fields";
import { VOCAB } from "@/lib/recruit/vocabulary";

const EMPTY = { street: "", city: "", state: "", postal_code: "", country: "" };

const labelClass = "flex items-center gap-1";

/**
 * Create a school or partner (a CRM organization) — the high school, college,
 * CBO, agency or employer a prospect comes from. The type is kept in
 * `metadata.school_type`.
 */
export function OrganizationDialog({
  open,
  onOpenChange,
  navigateOnCreate = true,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigateOnCreate?: boolean;
  onCreated?: (organization: Organization) => void;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const { href, userId } = useSession();
  const [createOrganization, { isLoading }] = useCreateOrganizationMutation();

  const [name, setName] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [address, setAddress] = useState({ ...EMPTY });
  const [owner, setOwner] = useState<number | null>(userId ?? null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setSchoolType("");
    setAddress({ ...EMPTY });
    setOwner(userId ?? null);
  }, [open, userId]);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setAddress((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cleaned: Address = {};
    for (const [key, value] of Object.entries(address)) {
      if (value.trim()) cleaned[key] = value.trim();
    }
    const metadata = withMeta({}, SCHOOL_TYPE_FIELD, schoolType);
    try {
      const organization = await createOrganization({
        name: trimmed,
        address: Object.keys(cleaned).length ? cleaned : undefined,
        owner: owner ?? null,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }).unwrap();
      toast.success(`${organization.name} added`);
      onOpenChange(false);
      onCreated?.(organization);
      if (navigateOnCreate) router.push(href(`/schools/${organization.id}`));
    } catch (err) {
      toastApiError(err, `Could not create this ${VOCAB.school.lower}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>New {VOCAB.school.lower}</DialogTitle>
          <DialogDescription>
            A high school, community college, community organization, agency or employer. Schools
            group the {VOCAB.prospect.lowerMany} who come from them and the counselors you work with
            there.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
            <div className="grid gap-1.5">
              <Label htmlFor="org-name" className={labelClass}>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="org-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lincoln High School"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label className={labelClass}>
                {SCHOOL_TYPE_FIELD.label}
                {SCHOOL_TYPE_FIELD.hint ? (
                  <InfoTip label={`About ${SCHOOL_TYPE_FIELD.label.toLowerCase()}`}>
                    {SCHOOL_TYPE_FIELD.hint}
                  </InfoTip>
                ) : null}
              </Label>
              <SimpleSelect
                value={schoolType}
                onChange={setSchoolType}
                options={SCHOOL_TYPE_FIELD.options ?? []}
                allowEmpty
                emptyLabel="Not set"
                placeholder="Not set"
                aria-label={`${VOCAB.school.one} type`}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="org-street" className={labelClass}>
              Street
            </Label>
            <Input
              id="org-street"
              value={address.street}
              onChange={(e) => set("street", e.target.value)}
              placeholder="1200 Lincoln Ave"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="org-city" className={labelClass}>
                City
              </Label>
              <Input
                id="org-city"
                value={address.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Austin"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-state" className={labelClass}>
                State / region
              </Label>
              <Input
                id="org-state"
                value={address.state}
                onChange={(e) => set("state", e.target.value)}
                placeholder="TX"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-postal" className={labelClass}>
                Postal code
              </Label>
              <Input
                id="org-postal"
                value={address.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                placeholder="78701"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-country" className={labelClass}>
                Country
              </Label>
              <Input
                id="org-country"
                value={address.country}
                onChange={(e) => set("country", e.target.value)}
                placeholder="United States"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className={labelClass}>
              {VOCAB.counselor.one}
              <InfoTip label={`About ${VOCAB.counselor.lower}`}>
                The admissions counselor who covers this {VOCAB.school.lower}.
              </InfoTip>
            </Label>
            <OwnerSelect value={owner} onChange={setOwner} />
          </div>

          <DialogFooter className="mt-1">
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="submit"
              className="ibl-button-primary"
              disabled={!name.trim() || isLoading}
            >
              {isLoading ? <Spinner data-icon="inline-start" /> : null}
              Create {VOCAB.school.lower}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
