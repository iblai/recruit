import type { MetaField } from "@/lib/recruit/fields";

/**
 * What kind of school or partner a CRM organization record is. Stored in
 * `organization.metadata.school_type`; the API has no column for it.
 */
export const SCHOOL_TYPE_OPTIONS = [
  { value: "high_school", label: "High school" },
  { value: "community_college", label: "Community college" },
  { value: "university", label: "University" },
  { value: "community_organization", label: "Community organization" },
  { value: "agency", label: "Agency" },
  { value: "employer", label: "Employer" },
  { value: "other", label: "Other" },
];

export const SCHOOL_TYPE_FIELD: MetaField = {
  key: "school_type",
  label: "Type",
  type: "select",
  hint: "High school, community college, CBO, agency or employer — where your prospects come from.",
  options: SCHOOL_TYPE_OPTIONS,
};
