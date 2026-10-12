"use client";

import { useParams } from "next/navigation";
import { Bell } from "lucide-react";
import { NotificationDisplay } from "@iblai/iblai-js/web-containers";
import { PageHeader } from "@/components/crm/page-header";
import { useSession } from "@/hooks/use-session";

export default function NotificationsPage() {
  const params = useParams<{ id?: string[] }>();
  const notificationId = params?.id?.[0];
  const { tenantKey, username, isAdmin } = useSession();

  return (
    <>
      <PageHeader
        icon={<Bell />}
        title="Notifications"
        description="CRM events and platform alerts for you"
      />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-white">
          <NotificationDisplay
            org={tenantKey}
            userId={username}
            isAdmin={isAdmin}
            selectedNotificationId={notificationId}
          />
        </div>
      </div>
    </>
  );
}
