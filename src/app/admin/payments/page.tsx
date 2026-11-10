import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { AdminPaymentsClient } from "@/components/admin/payments-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments - Super Admin" };

export default async function AdminPaymentsPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");
  return <AdminPaymentsClient />;
}
