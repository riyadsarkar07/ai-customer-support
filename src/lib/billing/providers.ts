import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { randomToken } from "@/lib/crypto";

export type PaymentInitResult = {
  redirectUrl: string;
  providerRef: string;
};

export type PaymentVerifyResult = {
  success: boolean;
  transactionId: string | null;
  amount: number | null;
  raw: Record<string, unknown>;
  error?: string;
};

export interface PaymentProvider {
  id: "sslcommerz" | "bkash" | "nagad";
  label: string;
  configured: boolean;
  initPayment(params: {
    amount: number;
    currency: string;
    orderId: string;
    customer: { name: string; email: string };
    callbackUrls: { success: string; fail: string; cancel: string; ipn: string };
  }): Promise<PaymentInitResult>;
  verifyPayment(params: {
    providerRef: string;
    amount: number;
    orderId: string;
  }): Promise<PaymentVerifyResult>;
}

// ---------------------------- SSLCOMMERZ ----------------------------

const sslcommerz: PaymentProvider = {
  id: "sslcommerz",
  label: "SSLCOMMERZ",
  configured: Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD),
  async initPayment({ amount, currency, orderId, customer, callbackUrls }) {
    const base = env.SSLCOMMERZ_SANDBOX
      ? "https://sandbox.sslcommerz.com"
      : "https://securepay.sslcommerz.com";
    const body = new URLSearchParams({
      store_id: env.SSLCOMMERZ_STORE_ID ?? "",
      store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? "",
      total_amount: amount.toFixed(2),
      currency,
      tran_id: orderId,
      success_url: callbackUrls.success,
      fail_url: callbackUrls.fail,
      cancel_url: callbackUrls.cancel,
      ipn_url: callbackUrls.ipn,
      cus_name: customer.name,
      cus_email: customer.email,
      cus_add1: "Dhaka",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      cus_phone: "01700000000",
      shipping_method: "NO",
      product_name: "SupportPilot subscription",
      product_category: "SaaS",
      product_profile: "general",
    });
    const res = await fetch(`${base}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as {
      status?: string;
      GatewayPageURL?: string;
      failedreason?: string;
    };
    if (!res.ok || data.status !== "SUCCESS" || !data.GatewayPageURL) {
      throw new Error(data.failedreason ?? "SSLCOMMERZ could not start payment");
    }
    return { redirectUrl: data.GatewayPageURL, providerRef: orderId };
  },
  async verifyPayment({ providerRef, amount, orderId }) {
    const base = env.SSLCOMMERZ_SANDBOX
      ? "https://sandbox.sslcommerz.com"
      : "https://securepay.sslcommerz.com";
    const url = `${base}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(providerRef)}&store_id=${encodeURIComponent(env.SSLCOMMERZ_STORE_ID ?? "")}&store_passwd=${encodeURIComponent(env.SSLCOMMERZ_STORE_PASSWORD ?? "")}&format=json`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      status?: string;
      amount?: string;
      tran_id?: string;
      bank_tran_id?: string;
    };
    const valid =
      res.ok &&
      data.status === "VALID" &&
      data.tran_id === orderId &&
      Number(data.amount) >= amount - 0.01;
    return {
      success: valid,
      transactionId: data.bank_tran_id ?? null,
      amount: data.amount ? Number(data.amount) : null,
      raw: data as Record<string, unknown>,
      error: valid ? undefined : "SSLCOMMERZ validation failed",
    };
  },
};

// ------------------------------ bKash ------------------------------

async function bkashToken(): Promise<string> {
  const base = env.BKASH_BASE_URL;
  const res = await fetch(`${base}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: env.BKASH_USERNAME ?? "",
      password: env.BKASH_PASSWORD ?? "",
    },
    body: JSON.stringify({
      app_key: env.BKASH_APP_KEY,
      app_secret: env.BKASH_APP_SECRET,
    }),
  });
  const data = (await res.json()) as {
    id_token?: string;
    statusMessage?: string;
  };
  if (!data.id_token) {
    throw new Error(data.statusMessage ?? "bKash authentication failed");
  }
  return data.id_token;
}

const bkash: PaymentProvider = {
  id: "bkash",
  label: "bKash",
  configured: Boolean(
    env.BKASH_APP_KEY &&
      env.BKASH_APP_SECRET &&
      env.BKASH_USERNAME &&
      env.BKASH_PASSWORD,
  ),
  async initPayment({ amount, currency, orderId, callbackUrls }) {
    void currency;
    const token = await bkashToken();
    const res = await fetch(
      `${env.BKASH_BASE_URL}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token,
          "X-App-Key": env.BKASH_APP_KEY ?? "",
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: orderId,
          callbackURL: callbackUrls.success,
          amount: amount.toFixed(2),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: orderId,
        }),
      },
    );
    const data = (await res.json()) as {
      bkashURL?: string;
      paymentID?: string;
      statusMessage?: string;
    };
    if (!data.bkashURL || !data.paymentID) {
      throw new Error(data.statusMessage ?? "bKash could not start payment");
    }
    return { redirectUrl: data.bkashURL, providerRef: data.paymentID };
  },
  async verifyPayment({ providerRef, amount, orderId }) {
    const token = await bkashToken();
    const res = await fetch(
      `${env.BKASH_BASE_URL}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token,
          "X-App-Key": env.BKASH_APP_KEY ?? "",
        },
        body: JSON.stringify({ paymentID: providerRef }),
      },
    );
    const data = (await res.json()) as {
      statusCode?: string;
      trxID?: string;
      amount?: string;
      merchantInvoiceNumber?: string;
      statusMessage?: string;
    };
    const valid =
      data.statusCode === "0000" &&
      data.merchantInvoiceNumber === orderId &&
      Number(data.amount) >= amount - 0.01;
    return {
      success: valid,
      transactionId: data.trxID ?? null,
      amount: data.amount ? Number(data.amount) : null,
      raw: data as Record<string, unknown>,
      error: valid ? undefined : data.statusMessage ?? "bKash verification failed",
    };
  },
};

// ------------------------------ Nagad ------------------------------

const nagad: PaymentProvider = {
  id: "nagad",
  label: "Nagad",
  configured: Boolean(env.NAGAD_MERCHANT_ID && env.NAGAD_MERCHANT_PRIVATE_KEY),
  async initPayment({ amount, orderId, callbackUrls }) {
    // Nagad's merchant API requires RSA signing with the merchant private key
    // and a two-step initialize/complete flow. We perform step 1 here using the
    // documented sandbox endpoint and return the redirect URL.
    const base = env.NAGAD_BASE_URL;
    const challenge = randomToken(12);
    const res = await fetch(
      `${base}/check-out/initialize/${env.NAGAD_MERCHANT_ID}/${orderId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-KM-Api-Version": "v-0.2.0",
          "X-KM-IP-V4": "127.0.0.1",
          "X-KM-Client-Type": "PC_WEB",
        },
        body: JSON.stringify({
          accountNumber: orderId,
          dateTime: new Date().toISOString(),
          challenge,
        }),
      },
    );
    const data = (await res.json()) as {
      callBackUrl?: string;
      sensitiveData?: string;
      status?: string;
      message?: string;
    };
    if (!res.ok || !data.callBackUrl) {
      throw new Error(
        data.message ??
          "Nagad could not start payment. The Nagad merchant API requires RSA-signed requests configured on your server.",
      );
    }
    void amount;
    void callbackUrls;
    return { redirectUrl: data.callBackUrl, providerRef: orderId };
  },
  async verifyPayment() {
    return {
      success: false,
      transactionId: null,
      amount: null,
      raw: {},
      error:
        "Nagad verification requires the signed merchant handshake. Configure NAGAD_MERCHANT_PRIVATE_KEY and complete the server verification callback.",
    };
  },
};

// ------------------------------ Registry ------------------------------

export const paymentProviders: Record<string, PaymentProvider> = {
  sslcommerz,
  bkash,
  nagad,
};

export function getPaymentProvider(id: string): PaymentProvider | null {
  return paymentProviders[id] ?? null;
}

export function availableProviders(): Array<{
  id: string;
  label: string;
  configured: boolean;
}> {
  return Object.values(paymentProviders).map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.configured,
  }));
}

export function isPaymentProviderId(
  id: string,
): id is PaymentProvider["id"] {
  return Object.prototype.hasOwnProperty.call(paymentProviders, id);
}

void logger;
