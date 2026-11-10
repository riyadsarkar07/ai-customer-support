import { describe, expect, it } from "vitest";
import { intervalDays, invoiceNumber } from "@/lib/billing/service";
import { assertPaymentProvider } from "@/lib/billing/callback-guard";
import { getPaymentProvider, availableProviders } from "@/lib/billing/providers";

describe("billing intervals", () => {
  it("maps plan intervals to day counts", () => {
    expect(intervalDays("monthly")).toBe(30);
    expect(intervalDays("yearly")).toBe(365);
    expect(intervalDays("lifetime")).toBe(3650);
  });

  it("falls back to monthly for unknown intervals", () => {
    expect(intervalDays("weekly")).toBe(30);
  });
});

describe("invoice numbers", () => {
  it("uses an INV-YYYYMM-XXXXXX format", () => {
    expect(invoiceNumber()).toMatch(/^INV-\d{6}-[A-Z0-9]{6}$/);
  });

  it("generates unique identifiers", () => {
    const set = new Set(Array.from({ length: 100 }, () => invoiceNumber()));
    expect(set.size).toBe(100);
  });
});

describe("payment provider registry", () => {
  it("only accepts real gateway ids in callbacks", () => {
    expect(assertPaymentProvider("sslcommerz")).toBe(true);
    expect(assertPaymentProvider("bkash")).toBe(true);
    expect(assertPaymentProvider("nagad")).toBe(true);
    expect(assertPaymentProvider("manual")).toBe(false);
    expect(assertPaymentProvider("unknown")).toBe(false);
  });

  it("resolves providers by id", () => {
    expect(getPaymentProvider("bkash")?.label).toBe("bKash");
    expect(getPaymentProvider("nope")).toBeNull();
  });

  it("lists every provider with a configured flag", () => {
    const providers = availableProviders();
    expect(providers.map((p) => p.id).sort()).toEqual([
      "bkash",
      "nagad",
      "sslcommerz",
    ]);
    for (const provider of providers) {
      expect(typeof provider.configured).toBe("boolean");
    }
  });
});
