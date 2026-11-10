import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { AuditClient } from "@/components/admin/audit-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log - Super Admin" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");
  const { organizationId } = await searchParams;
  return <AuditClient initialOrgId={organizationId} />;
}
