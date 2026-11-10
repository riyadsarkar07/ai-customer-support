import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { AnalyticsClient } from "@/components/dashboard/analytics-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("analytics.view")) redirect("/dashboard");
  return <AnalyticsClient />;
}
