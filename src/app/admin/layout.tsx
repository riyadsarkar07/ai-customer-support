import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Super Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");

  return <AdminShell user={{ name: admin.name, email: admin.email }}>{children}</AdminShell>;
}
