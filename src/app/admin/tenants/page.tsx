import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { TenantsClient } from "@/components/admin/tenants-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspaces - Super Admin" };

export default async function AdminTenantsPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");
  return <TenantsClient />;
}
