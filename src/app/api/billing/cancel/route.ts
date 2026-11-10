import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { setCancelAtPeriodEnd } from "@/lib/billing/service";
import { getActiveSubscription } from "@/lib/tenant";

const schema = z.object({ cancel: z.boolean() });

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "billing.manage");

    const input = schema.parse(await req.json().catch(() => null));
    const active = await getActiveSubscription(ctx.organization.id);
    if (!active) return jsonError("No active subscription", 400);

    await setCancelAtPeriodEnd(ctx.organization.id, input.cancel);
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: input.cancel });
  } catch (error) {
    return toErrorResponse(error);
  }
}
