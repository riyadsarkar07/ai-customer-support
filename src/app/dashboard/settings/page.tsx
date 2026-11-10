import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { SettingsClient } from "@/components/dashboard/settings-client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const org = ctx.organization;
  const snippet = `<script src="${env.APP_URL}/widget.js" data-org="${org.id}" async></script>`;

  return (
    <SettingsClient
      canManage={ctx.permissions.includes("org.manage")}
      widgetSnippet={snippet}
      initial={{
        id: org.id,
        name: org.name,
        slug: org.slug,
        website: org.website,
        logoUrl: org.logoUrl,
        timezone: org.timezone,
        locale: org.locale,
        currency: org.currency,
        brandColor: org.brandColor,
        status: org.status,
      }}
    />
  );
}
