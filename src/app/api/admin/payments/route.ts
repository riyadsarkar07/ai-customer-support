import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse, jsonError } from "@/lib/api/response";
import { listAllPayments } from "@/lib/admin";
import { recordManualPayment } from "@/lib/billing/service";
import { audit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(req.url);
    const result = await listAllPayments({
      status: url.searchParams.get("status") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

const actionSchema = z.object({
  paymentId: z.string().uuid(),
  action: z.enum(["approve", "reject", "refund"]),
});

export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const input = actionSchema.parse(await req.json().catch(() => null));

    if (input.action === "refund") {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, input.paymentId))
        .limit(1);
      if (!payment) return jsonError("Payment not found", 404);
      if (payment.status !== "completed") {
        return jsonError("Only completed payments can be refunded", 400);
      }
      const [updated] = await db
        .update(payments)
        .set({
          status: "refunded",
          metadata: {
            ...(payment.metadata ?? {}),
            refundedBy: admin.id,
            refundedAt: new Date().toISOString(),
          },
        })
        .where(eq(payments.id, payment.id))
        .returning();

      await audit({
        organizationId: payment.organizationId,
        actorId: admin.id,
        action: "admin.payment_refund",
        resourceType: "payment",
        resourceId: payment.id,
      });

      return NextResponse.json({ payment: updated });
    }

    if (input.action === "reject") {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, input.paymentId))
        .limit(1);
      if (!payment) return jsonError("Payment not found", 404);
      const result = await recordManualPayment({
        paymentId: input.paymentId,
        adminId: admin.id,
        approve: false,
      });
      if (!result.ok) return jsonError(result.error ?? "Could not reject payment", 400);
      await audit({
        organizationId: payment.organizationId,
        actorId: admin.id,
        action: "admin.payment_reject",
        resourceType: "payment",
        resourceId: payment.id,
      });
      return NextResponse.json({ ok: true });
    }

    const result = await recordManualPayment({
      paymentId: input.paymentId,
      adminId: admin.id,
      approve: true,
    });
    if (!result.ok) return jsonError(result.error ?? "Could not approve payment", 400);

    await audit({
      actorId: admin.id,
      action: "admin.payment_approve",
      resourceType: "payment",
      resourceId: input.paymentId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
