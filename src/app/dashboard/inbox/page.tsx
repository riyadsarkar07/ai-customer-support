import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/auth/session";
import { InboxClient } from "@/components/dashboard/inbox-client";
import { Spinner } from "@/components/ui/misc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  const canManage = ctx.permissions.includes("conversation.manage");

  return (
    <Suspense fallback={<Spinner />}>
      <InboxClient canManage={canManage} />
    </Suspense>
  );
}
