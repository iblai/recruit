"use client";

/**
 * The app's organization settings (`metadata.apps.recruit`) in the browser,
 * for the organization in the URL. Any member can read (public metadata);
 * writes need an org admin — the platform answers 403 otherwise — and always
 * GET → merge → PUT so the OS's own keys and other apps' namespaces survive.
 */
import { useCallback, useMemo } from "react";
import {
  useGetTenantMetadataQuery,
  useUpdateTenantMetadataMutation,
} from "@iblai/iblai-js/data-layer";
import { useSession } from "@/hooks/use-session";
import config from "@/lib/iblai/config";
import {
  mergeRecruitSettings,
  readRecruitSettings,
  institutionBranding,
  type RecruitSettings,
} from "@/lib/recruit/org-settings";

type OrgMetadataResponse = { metadata?: Record<string, unknown>; [k: string]: unknown };
type PlatformPublicMetadataBody = NonNullable<
  Parameters<ReturnType<typeof useUpdateTenantMetadataMutation>[0]>[0][0]["requestBody"]
>;

export function useRecruitSettings() {
  const { tenantKey: org } = useSession();
  // The tenant slice takes its args as a one-element tuple.
  const query = useGetTenantMetadataQuery([{ org }], { skip: !org });
  const [mutate, mutation] = useUpdateTenantMetadataMutation();
  const current = query.data as OrgMetadataResponse | undefined;

  const settings = useMemo<RecruitSettings>(
    () => readRecruitSettings(current?.metadata),
    [current],
  );
  const branding = useMemo(() => institutionBranding(current?.metadata, org), [current, org]);
  /** The Chief of Staff: pinned by env, else what an admin set up. */
  const agentId = config.defaultAgentId() || settings.agentId || "";

  const update = useCallback(
    async (patch: Partial<RecruitSettings>, remove: string[] = []) => {
      // Re-read right before writing: PUT replaces the object, and another
      // admin (or the Chief of Staff) may have changed it since this page loaded.
      const latest = (await query.refetch().unwrap()) as OrgMetadataResponse;
      const metadata = mergeRecruitSettings(latest?.metadata, patch, remove);
      await mutate([
        { org, requestBody: { metadata } as unknown as PlatformPublicMetadataBody },
      ]).unwrap();
    },
    [mutate, org, query],
  );

  return {
    settings,
    branding,
    agentId,
    update,
    isLoading: query.isLoading,
    isSaving: mutation.isLoading,
    error: query.error ?? mutation.error,
    refetch: query.refetch,
  };
}
