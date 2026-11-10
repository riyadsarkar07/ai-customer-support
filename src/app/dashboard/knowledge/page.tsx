import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { KnowledgeClient } from "@/components/dashboard/knowledge-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Knowledge Base" };

export default async function KnowledgePage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("knowledge.manage")) redirect("/dashboard");
  return <KnowledgeClient />;
}
