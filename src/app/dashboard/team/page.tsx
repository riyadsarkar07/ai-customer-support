import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { TeamClient } from "@/components/dashboard/team-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("team.manage")) redirect("/dashboard");
  return <TeamClient isOwner={ctx.membership.role === "owner"} />;
}
