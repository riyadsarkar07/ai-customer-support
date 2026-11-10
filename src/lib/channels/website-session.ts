import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelConnections, organizations } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "@/lib/auth/permissions";

export async function resolveWebsiteChannel(publicKey: string) {
  const [row] = await db
    .select({
      channel: channelConnections,
      organization: {
        id: organizations.id,
        name: organizations.name,
        brandColor: organizations.brandColor,
        logoUrl: organizations.logoUrl,
        status: organizations.status,
      },
    })
    .from(channelConnections)
    .innerJoin(organizations, eq(organizations.id, channelConnections.organizationId))
    .where(
      and(
        eq(channelConnections.type, "website"),
        eq(channelConnections.externalId, publicKey),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError("Chat widget not found");
  if (row.organization.status !== "active") {
    throw new NotFoundError("Chat widget unavailable");
  }
  return row;
}

export function checkOrigin(
  channel: { config: Record<string, unknown> | null },
  origin: string | null,
): void {
  const allowed = String(
    (channel.config as Record<string, unknown> | null)?.allowedOrigins ?? "",
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return;
  if (!origin) return;
  const ok = allowed.some((a) => {
    try {
      return new URL(a).origin === new URL(origin).origin;
    } catch {
      return a === origin;
    }
  });
  if (!ok) throw new ValidationError("This origin is not allowed to use this widget");
}
