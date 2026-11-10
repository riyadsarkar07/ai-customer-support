import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { AutomationsClient } from "@/components/dashboard/automations-client";
import { listAssignableMembers } from "@/lib/inbox/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("workflow.manage")) redirect("/dashboard");
  const members = await listAssignableMembers(ctx.organization.id);
  return (
    <AutomationsClient
      members={members.map((m) => ({ id: m.id, name: m.name }))}
    />
  );
}
