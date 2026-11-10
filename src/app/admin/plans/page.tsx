import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { PlansClient } from "@/components/admin/plans-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans - Super Admin" };

export default async function AdminPlansPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");
  return <PlansClient />;
}
