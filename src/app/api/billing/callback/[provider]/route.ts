import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { completePayment } from "@/lib/billing/service";
import { logger } from "@/lib/logger";
import { assertPaymentProvider } from "@/lib/billing/callback-guard";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(
  req: Request,
  providerId: string,
): Promise<NextResponse> {
  const url = new URL(req.url);
  let paymentId = url.searchParams.get("payment");
  let providerRef =
    url.searchParams.get("val_id") ??
    url.searchParams.get("paymentID") ??
    url.searchParams.get("payment_ref_id") ??
    "";
  let status = url.searchParams.get("status") ?? "";

  // SSLCOMMERZ IPN and bKash redirect POST form-encoded bodies.
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      paymentId = paymentId ?? (form.get("tran_id") as string | null);
      providerRef =
        providerRef ||
        ((form.get("val_id") as string | null) ??
          (form.get("paymentID") as string | null) ??
          "");
      status = status || String(form.get("status") ?? "");
    } else if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      paymentId = paymentId ?? (body.tran_id as string | undefined) ?? null;
      providerRef =
        providerRef ||
        ((body.val_id as string | undefined) ??
          (body.paymentID as string | undefined) ??
          "");
    }
  }

  if (!paymentId || !providerRef) {
    logger.warn({ providerId, paymentId, providerRef }, "Callback missing parameters");
    return NextResponse.redirect(
      `${env.APP_URL}/dashboard/billing?payment_status=invalid`,
    );
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment) {
    return NextResponse.redirect(
      `${env.APP_URL}/dashboard/billing?payment_status=not_found`,
    );
  }

  if (payment.provider !== providerId) {
    logger.warn({ paymentId, providerId }, "Callback provider mismatch");
    return NextResponse.redirect(
      `${env.APP_URL}/dashboard/billing?payment_status=provider_mismatch`,
    );
  }

  if (status === "fail" || status === "cancel" || status === "FAILED") {
    await db
      .update(payments)
      .set({ status: status === "cancel" ? "failed" : "failed" })
      .where(eq(payments.id, paymentId));
    return NextResponse.redirect(
      `${env.APP_URL}/dashboard/billing?payment=${paymentId}&payment_status=${status}`,
    );
  }

  const result = await completePayment({
    paymentId,
    providerId,
    providerRef,
  });

  return NextResponse.redirect(
    `${env.APP_URL}/dashboard/billing?payment=${paymentId}&payment_status=${result.ok ? "success" : "failed"}`,
  );
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!assertPaymentProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  return handle(req, provider);
}
