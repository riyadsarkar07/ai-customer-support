import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { IntegrationsClient } from "@/components/dashboard/integrations-client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("channel.manage")) redirect("/dashboard");
  return <IntegrationsClient appUrl={env.APP_URL} />;
}
