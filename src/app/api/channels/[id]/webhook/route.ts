import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelConnections } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedChannel } from "@/lib/inbox/access";
import { decryptSecret } from "@/lib/crypto";
import { setTelegramWebhook } from "@/lib/channels/telegram";
import { env } from "@/lib/env";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "channel.manage");

    const { id } = await params;
    const channel = await scopedChannel(ctx.organization.id, id);

    if (channel.type !== "telegram") {
      return jsonError("Webhook re-registration is only supported for Telegram", 400);
    }

    const token = decryptSecret(channel.accessToken);
    const secret = decryptSecret(channel.secret);
    if (!token || !secret) {
      return jsonError("Channel credentials are missing. Reconnect the bot.", 409);
    }

    const result = await setTelegramWebhook({
      token,
      url: `${env.APP_URL}/api/webhooks/telegram/${channel.id}`,
      secret,
    });

    if (!result.ok) {
      await db
        .update(channelConnections)
        .set({ status: "error", lastError: result.description, updatedAt: new Date() })
        .where(eq(channelConnections.id, id));
      return jsonError(result.description ?? "Failed to register webhook", 502);
    }

    await db
      .update(channelConnections)
      .set({ status: "connected", lastError: null, updatedAt: new Date() })
      .where(eq(channelConnections.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
