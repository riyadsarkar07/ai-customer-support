import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { AiSettingsClient } from "@/components/dashboard/ai-settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Settings" };

export default async function AiSettingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("ai.manage")) redirect("/dashboard");
  return <AiSettingsClient />;
}
