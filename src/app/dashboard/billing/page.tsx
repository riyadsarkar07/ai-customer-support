import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/auth/session";
import { BillingClient, BillingUnavailable } from "@/components/dashboard/billing-client";
import { Spinner } from "@/components/ui/misc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissions.includes("billing.manage")) {
    return <BillingUnavailable />;
  }
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      }
    >
      <BillingClient />
    </Suspense>
  );
}
