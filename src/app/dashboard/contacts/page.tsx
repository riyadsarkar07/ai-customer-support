import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { ContactsClient } from "@/components/dashboard/contacts-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("contact.view")) redirect("/dashboard");
  return (
    <ContactsClient canManage={ctx.permissions.includes("contact.manage")} />
  );
}
