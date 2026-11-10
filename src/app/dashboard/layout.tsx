import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard/shell";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  let notice: { title: string; body: string; level: string } | null = null;
  try {
    const rows = await db
      .select()
      .from(announcements)
      .where(eq(announcements.active, true))
      .orderBy(desc(announcements.createdAt))
      .limit(1);
    if (rows[0]) {
      notice = { title: rows[0].title, body: rows[0].body, level: rows[0].level };
    }
  } catch {
    notice = null;
  }

  return (
    <DashboardShell
      user={ctx.user}
      organization={ctx.organization}
      membership={ctx.membership}
      permissions={ctx.permissions}
      announcement={notice}
    >
      {children}
    </DashboardShell>
  );
}
