import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";

describe("secret encryption", () => {
  it("round-trips a secret", () => {
    const plaintext = "telegram-bot-token-1234567890";
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext for the same input (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-value");
    expect(decryptSecret(b)).toBe("same-value");
  });

  it("returns null for tampered ciphertext", () => {
    const ciphertext = encryptSecret("secret");
    const parts = ciphertext.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(decryptSecret(null)).toBeNull();
  });

  it("passes through legacy plaintext values", () => {
    expect(decryptSecret("legacy-plain-token")).toBe("legacy-plain-token");
  });

  it("masks secrets for display", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("abc...mnop");
    expect(maskSecret("short")).toBe("******");
    expect(maskSecret(null)).toBeNull();
  });
});
