import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { OnboardingWizard } from "@/components/dashboard/onboarding-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding" };

export default async function DashboardOnboardingPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, ctx.organization.id))
    .limit(1);
  if (!org) redirect("/login");

  return (
    <OnboardingWizard
      initial={{
        name: org.name,
        website: org.website,
        timezone: org.timezone,
        locale: org.locale,
        brandColor: org.brandColor,
      }}
    />
  );
}
