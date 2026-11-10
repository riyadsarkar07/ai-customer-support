import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { AnnouncementsClient } from "@/components/admin/announcements-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Announcements - Super Admin" };

export default async function AdminAnnouncementsPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");
  return <AnnouncementsClient />;
}
