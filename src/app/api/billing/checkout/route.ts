import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { checkoutSchema } from "@/lib/validation";
import { createCheckout } from "@/lib/billing/service";
import { rateLimit } from "@/lib/api/rate-limit";

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "billing.manage");

    const rl = rateLimit(`checkout:${ctx.organization.id}`, 10, 60_000);
    if (!rl.allowed) return jsonError("Too many checkout attempts", 429);

    const input = checkoutSchema.parse(await req.json().catch(() => null));

    const result = await createCheckout({
      organizationId: ctx.organization.id,
      planId: input.planId,
      providerId: input.provider,
      userId: ctx.user.id,
      customer: { name: ctx.user.name, email: ctx.user.email },
    });

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
