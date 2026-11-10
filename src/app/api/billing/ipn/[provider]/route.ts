import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { completePayment } from "@/lib/billing/service";
import { assertPaymentProvider } from "@/lib/billing/callback-guard";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-to-server payment notification (SSLCOMMERZ IPN, bKash, Nagad).
 * Always verifies the payment with the provider before activating a plan.
 */
async function handle(req: Request, providerId: string): Promise<NextResponse> {
  const url = new URL(req.url);
  let paymentId = url.searchParams.get("payment") ?? "";
  let providerRef = url.searchParams.get("val_id") ?? "";
  let status = url.searchParams.get("status") ?? "";

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    paymentId = paymentId || String(form.get("tran_id") ?? "");
    providerRef =
      providerRef ||
      String(form.get("val_id") ?? "") ||
      String(form.get("paymentID") ?? "") ||
      String(form.get("payment_ref_id") ?? "");
    status = status || String(form.get("status") ?? "");
  } else if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    paymentId = paymentId || String(body.tran_id ?? "");
    providerRef =
      providerRef ||
      String(body.val_id ?? "") ||
      String(body.paymentID ?? "") ||
      String(body.payment_ref_id ?? "");
    status = status || String(body.status ?? "");
  }

  if (!paymentId || !providerRef) {
    logger.warn({ providerId }, "IPN missing required parameters");
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment || payment.provider !== providerId) {
    logger.warn({ paymentId, providerId }, "IPN payment not found or mismatched");
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (status === "fail" || status === "cancel" || status === "FAILED") {
    if (payment.status === "pending") {
      await db
        .update(payments)
        .set({ status: "failed" })
        .where(eq(payments.id, paymentId));
    }
    return NextResponse.json({ received: true });
  }

  const result = await completePayment({ paymentId, providerId, providerRef });
  if (!result.ok) {
    logger.warn({ paymentId, providerId, error: result.error }, "IPN verification failed");
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!assertPaymentProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  void env;
  return handle(req, provider);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!assertPaymentProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  return handle(req, provider);
}
