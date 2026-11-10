import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

export function validateMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) {
    // Not configured: reject to avoid accepting unverified webhooks in prod.
    return false;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
