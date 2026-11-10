import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { getActiveSubscription, getUsage } from "@/lib/tenant";
import { availableProviders } from "@/lib/billing/providers";
import { listPayments } from "@/lib/billing/service";
import { env } from "@/lib/env";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "billing.manage");

    const [allPlans, active, usage, payments] = await Promise.all([
      db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder)),
      getActiveSubscription(ctx.organization.id),
      getUsage(ctx.organization.id),
      listPayments(ctx.organization.id),
    ]);

    return NextResponse.json({
      plans: allPlans,
      subscription: active?.subscription ?? null,
      currentPlan: active?.plan ?? null,
      usage,
      payments,
      providers: availableProviders(),
      sandbox: env.SSLCOMMERZ_SANDBOX,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
