import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  payments,
  plans,
  subscriptions,
  usageRecords,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getPaymentProvider, type PaymentProvider } from "./providers";
import { audit, notify } from "@/lib/api/audit";
import { ValidationError } from "@/lib/auth/permissions";

export function intervalDays(interval: string): number {
  return interval === "yearly" ? 365 : interval === "lifetime" ? 3650 : 30;
}

export function invoiceNumber(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${y}${m}-${rand}`;
}

export async function createCheckout(params: {
  organizationId: string;
  planId: string;
  providerId: string;
  userId: string;
  customer: { name: string; email: string };
}): Promise<{ redirectUrl: string; paymentId: string; manual: boolean }> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, params.planId), eq(plans.isActive, true)))
    .limit(1);
  if (!plan) throw new ValidationError("Selected plan is not available");

  const amount = Number(plan.price);

  if (params.providerId === "manual") {
    if (env.NODE_ENV === "production") {
      throw new ValidationError(
        "Manual payments are disabled in production. Choose SSLCOMMERZ, bKash, or Nagad.",
      );
    }
    // Dev/test only: create a pending payment that an admin can confirm.
    const [payment] = await db
      .insert(payments)
      .values({
        organizationId: params.organizationId,
        provider: "manual",
        amount: String(amount),
        currency: plan.currency,
        status: "pending",
        invoiceNumber: invoiceNumber(),
        metadata: { planId: plan.id, planName: plan.name },
      })
      .returning();
    return {
      redirectUrl: `/dashboard/billing?payment=${payment!.id}&manual=1`,
      paymentId: payment!.id,
      manual: true,
    };
  }

  const provider = getPaymentProvider(params.providerId);
  if (!provider) throw new ValidationError("Unknown payment provider");
  if (!provider.configured) {
    throw new ValidationError(
      `${provider.label} is not configured on this server. Add the merchant credentials to environment variables.`,
    );
  }

  const [payment] = await db
    .insert(payments)
    .values({
      organizationId: params.organizationId,
      provider: provider.id,
      amount: String(amount),
      currency: plan.currency,
      status: "pending",
      invoiceNumber: invoiceNumber(),
      metadata: { planId: plan.id, planName: plan.name },
    })
    .returning();

  const appUrl = env.APP_URL;
  const cbBase = `${appUrl}/api/billing/callback/${provider.id}`;

  const result = await provider.initPayment({
    amount,
    currency: plan.currency,
    orderId: payment!.id,
    customer: params.customer,
    callbackUrls: {
      success: `${cbBase}?status=success&payment=${payment!.id}`,
      fail: `${cbBase}?status=fail&payment=${payment!.id}`,
      cancel: `${cbBase}?status=cancel&payment=${payment!.id}`,
      ipn: `${appUrl}/api/billing/ipn/${provider.id}`,
    },
  });

  await db
    .update(payments)
    .set({
      providerTransactionId: result.providerRef,
      metadata: {
        planId: plan.id,
        planName: plan.name,
        providerRef: result.providerRef,
      },
    })
    .where(eq(payments.id, payment!.id));

  await audit({
    organizationId: params.organizationId,
    actorId: params.userId,
    action: "billing.checkout_started",
    resourceType: "payment",
    resourceId: payment!.id,
    metadata: { provider: provider.id, planId: plan.id },
  });

  return {
    redirectUrl: result.redirectUrl,
    paymentId: payment!.id,
    manual: false,
  };
}

export async function completePayment(params: {
  paymentId: string;
  providerId: string;
  providerRef: string;
}): Promise<{ ok: boolean; error?: string }> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, params.paymentId))
    .limit(1);

  if (!payment) return { ok: false, error: "Payment not found" };
  if (payment.organizationId === undefined) return { ok: false, error: "Invalid payment" };

  // Idempotency: already completed payments are never re-processed.
  if (payment.status === "completed") return { ok: true };
  if (payment.status === "refunded") return { ok: false, error: "Payment was refunded" };

  const provider = getPaymentProvider(params.providerId);
  if (!provider) return { ok: false, error: "Unknown provider" };
  if (provider.id !== payment.provider) {
    return { ok: false, error: "Provider mismatch" };
  }

  const amount = Number(payment.amount);
  const verification = await provider.verifyPayment({
    providerRef: params.providerRef,
    amount,
    orderId: payment.id,
  });

  if (!verification.success) {
    await db
      .update(payments)
      .set({
        status: "failed",
        metadata: { ...(payment.metadata ?? {}), verify: verification.raw },
      })
      .where(eq(payments.id, payment.id));
    await notify({
      organizationId: payment.organizationId,
      type: "billing.payment_failed",
      title: "Payment failed",
      body: verification.error ?? "The payment could not be verified.",
      link: "/dashboard/billing",
    });
    return { ok: false, error: verification.error ?? "Verification failed" };
  }

  const planId = (payment.metadata as Record<string, unknown>)?.planId as
    | string
    | undefined;
  if (!planId) return { ok: false, error: "Payment has no plan reference" };

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) return { ok: false, error: "Plan no longer exists" };

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "completed",
        paidAt: new Date(),
        providerTransactionId: verification.transactionId ??
          (payment.metadata as Record<string, unknown>)?.providerRef as string ??
          payment.id,
        metadata: {
          ...(payment.metadata ?? {}),
          verify: verification.raw,
        },
      })
      .where(eq(payments.id, payment.id));

    const now = new Date();
    const periodEnd = new Date(now.getTime() + intervalDays(plan.interval) * 86400_000);

    const [existing] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, payment.organizationId))
      .limit(1);

    if (existing) {
      await tx
        .update(subscriptions)
        .set({
          planId: plan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.id));

      await tx
        .update(payments)
        .set({ subscriptionId: existing.id })
        .where(eq(payments.id, payment.id));
    } else {
      const [sub] = await tx
        .insert(subscriptions)
        .values({
          organizationId: payment.organizationId,
          planId: plan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .returning();
      await tx
        .update(payments)
        .set({ subscriptionId: sub!.id })
        .where(eq(payments.id, payment.id));
    }

    await tx
      .update(organizations)
      .set({ trialEndsAt: null, updatedAt: now })
      .where(eq(organizations.id, payment.organizationId));

    await tx.insert(usageRecords).values({
      organizationId: payment.organizationId,
      metric: "revenue",
      quantity: Math.round(amount),
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      metadata: { paymentId: payment.id, provider: provider.id },
    });
  });

  await notify({
    organizationId: payment.organizationId,
    type: "billing.payment_success",
    title: "Payment received",
    body: `${plan.name} is now active. Thank you!`,
    link: "/dashboard/billing",
  });

  return { ok: true };
}

export async function recordManualPayment(params: {
  paymentId: string;
  adminId: string;
  approve: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, params.paymentId))
    .limit(1);
  if (!payment) return { ok: false, error: "Payment not found" };
  if (payment.status !== "pending") {
    return { ok: false, error: "Payment is not pending" };
  }

  if (!params.approve) {
    await db
      .update(payments)
      .set({ status: "failed", metadata: { ...(payment.metadata ?? {}), rejectedBy: params.adminId } })
      .where(eq(payments.id, payment.id));
    return { ok: true };
  }

  const planId = (payment.metadata as Record<string, unknown>)?.planId as string;
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) return { ok: false, error: "Plan not found" };

  const now = new Date();
  const periodEnd = new Date(now.getTime() + intervalDays(plan.interval) * 86400_000);

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "completed",
        paidAt: now,
        providerTransactionId: `manual_${params.adminId}_${Date.now()}`,
        metadata: { ...(payment.metadata ?? {}), approvedBy: params.adminId },
      })
      .where(eq(payments.id, payment.id));

    const [existing] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, payment.organizationId))
      .limit(1);

    if (existing) {
      await tx
        .update(subscriptions)
        .set({
          planId: plan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.id));
      await tx
        .update(payments)
        .set({ subscriptionId: existing.id })
        .where(eq(payments.id, payment.id));
    } else {
      const [sub] = await tx
        .insert(subscriptions)
        .values({
          organizationId: payment.organizationId,
          planId: plan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        })
        .returning();
      await tx
        .update(payments)
        .set({ subscriptionId: sub!.id })
        .where(eq(payments.id, payment.id));
    }
  });

  return { ok: true };
}

export async function listPayments(organizationId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, organizationId))
    .orderBy(desc(payments.createdAt))
    .limit(50);
}

export async function setCancelAtPeriodEnd(
  organizationId: string,
  cancel: boolean,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      cancelAtPeriodEnd: cancel,
      cancelledAt: cancel ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.organizationId, organizationId));
}

/**
 * Downgrades/expires subscriptions whose period has ended and are not set to
 * renew. Called by the worker on a schedule.
 */
export async function expireLapsedSubscriptions(): Promise<number> {
  const now = new Date();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        sql`${subscriptions.currentPeriodEnd} < ${now}`,
      ),
    );

  let count = 0;
  for (const sub of rows) {
    try {
      if (sub.cancelAtPeriodEnd) {
        const [starter] = await db
          .select()
          .from(plans)
          .where(eq(plans.slug, "starter"))
          .limit(1);
        await db
          .update(subscriptions)
          .set({
            status: "cancelled",
            planId: starter?.id ?? sub.planId,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, sub.id));
      } else {
        await db
          .update(subscriptions)
          .set({ status: "past_due", updatedAt: now })
          .where(eq(subscriptions.id, sub.id));
        await notify({
          organizationId: sub.organizationId,
          type: "billing.past_due",
          title: "Subscription renewal failed",
          body: "Your subscription is past due. Update payment to keep premium features.",
          link: "/dashboard/billing",
        });
      }
      count += 1;
    } catch (err) {
      logger.error({ err, subscriptionId: sub.id }, "Failed to expire subscription");
    }
  }
  return count;
}

export type ProviderPublic = PaymentProvider;
