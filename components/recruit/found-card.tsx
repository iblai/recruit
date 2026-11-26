"use client";

import { useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldRow } from "@/components/crm/inline-field";
import { useSession } from "@/hooks/use-session";
import { crmApi, errorMessage } from "@/lib/crm/api";
import { formatDateTime, formatRelative } from "@/lib/crm/format";
import type { Person } from "@/lib/crm/types";
import { adminFetch } from "@/lib/recruit/admin-client";
import { CHANNELS, foundOf } from "@/lib/recruit/found";
import type { IblaiAppDispatch } from "@/store/iblai-store";

const LINK = "break-all text-gray-900 underline-offset-4 hover:underline";

/** Where a found prospect came from, what their public profile showed, and the button that reads it again. */
export function FoundCard({ person }: { person: Person }) {
  const tf = useTranslations("recruit.found");
  const { tenantKey } = useSession();
  const dispatch = useDispatch<IblaiAppDispatch>();
  const [reading, setReading] = useState(false);
  const found = foundOf(person);
  if (!found) return null;
  const channel = found.platform ? CHANNELS[found.platform].label : "";
  const profile = found.profile;
  const optedOut = person.metadata?.opted_out === true;

  // The Chief of Staff reads the profile through its connector and saves it with its own tool.
  const enrich = async () => {
    setReading(true);
    try {
      await adminFetch("/api/admin/prospects/enrich", {
        method: "POST",
        json: { org: tenantKey, personId: person.id },
      });
      toast.success(tf("enriched"));
      dispatch(crmApi.util.invalidateTags(["Person", "Activity"]));
    } catch (e) {
      toast.error(tf("enrichFailed", { detail: errorMessage(e) }));
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <h2 className="text-muted-foreground mt-5 mb-2 text-xs font-semibold tracking-wide uppercase">
        {tf("title")}
      </h2>
      <dl data-testid="found-card" className="divide-y divide-gray-100">
        {found.platform && found.handle && found.profile_url ? (
          <FieldRow label={channel}>
            <a href={found.profile_url} target="_blank" rel="noopener noreferrer" className={LINK}>
              @{found.handle}
            </a>
          </FieldRow>
        ) : null}
        {found.said ? (
          <FieldRow label={tf("said")}>
            <span className="text-gray-700">“{found.said}”</span>
            {found.post_url ? (
              <a
                href={found.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1.5 text-xs text-gray-500 hover:underline"
              >
                {tf("openPost")}
              </a>
            ) : null}
          </FieldRow>
        ) : null}
        {found.criteria ? <FieldRow label={tf("criteria")}>{found.criteria}</FieldRow> : null}
        <FieldRow label={tf("source")}>{found.source}</FieldRow>
        <FieldRow label={tf("basis")}>{found.basis}</FieldRow>
        <FieldRow label={tf("when")}>
          <span className="text-muted-foreground" title={formatDateTime(found.at)}>
            {formatRelative(found.at)}
          </span>
        </FieldRow>
        {profile?.bio || found.bio ? (
          <FieldRow label={tf("bio")}>
            <span className="break-words text-gray-700">{profile?.bio || found.bio}</span>
          </FieldRow>
        ) : null}
        {profile?.website ? (
          <FieldRow label={tf("website")}>
            {/* Their own link, so it carries no referrer and no ranking. */}
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={LINK}
            >
              {new URL(profile.website).hostname}
            </a>
          </FieldRow>
        ) : null}
        {profile?.school ? <FieldRow label={tf("school")}>{profile.school}</FieldRow> : null}
        {profile?.interests?.length ? (
          <FieldRow label={tf("interests")}>{profile.interests.join(", ")}</FieldRow>
        ) : null}
        {profile?.posts?.length ? (
          <FieldRow label={tf("posts")}>
            <ul className="grid gap-1.5">
              {profile.posts.map((p, i) => (
                <li key={i} className="break-words text-gray-700">
                  “{p.said}”
                  {p.post_url ? (
                    <a
                      href={p.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 text-xs text-gray-500 hover:underline"
                    >
                      {tf("openPost")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </FieldRow>
        ) : null}
        {profile?.at ? (
          <FieldRow label={tf("profileRead")}>
            <span className="text-muted-foreground" title={formatDateTime(profile.at)}>
              {formatRelative(profile.at)}
            </span>
          </FieldRow>
        ) : null}
      </dl>
      {found.platform ? (
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={reading || optedOut}
            title={optedOut ? tf("enrichOptedOut") : undefined}
            onClick={enrich}
          >
            {reading ? tf("enriching", { channel }) : tf("enrich", { channel })}
          </Button>
        </div>
      ) : null}
    </>
  );
}
