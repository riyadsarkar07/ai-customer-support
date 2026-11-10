import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelConnections, webhookEvents } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { processInbound } from "@/lib/inbox/dispatch";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: { id: number; type: string; first_name?: string; username?: string };
    date: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_size?: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
  edited_message?: TelegramUpdate["message"];
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;

  try {
    const [channel] = await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, channelId),
          eq(channelConnections.type, "telegram"),
        ),
      )
      .limit(1);

    if (!channel) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    // Verify Telegram's secret token header against the encrypted secret we
    // generated when the channel was connected.
    const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    const expected = decryptSecret(channel.secret) ?? "";
    if (!expected || !provided || !safeEqual(provided, expected)) {
      logger.warn({ channelId }, "Telegram webhook rejected: bad secret token");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = (await req.json()) as TelegramUpdate;
    const message = update.message ?? update.edited_message;
    if (!message || !message.chat) {
      return NextResponse.json({ ok: true });
    }

    const text = message.text ?? message.caption ?? "";
    if (!text.trim()) {
      return NextResponse.json({ ok: true });
    }

    const externalEventId = `tg_${update.update_id}`;

    // Dedupe via the unique index on (provider, externalEventId)
    try {
      await db.insert(webhookEvents).values({
        organizationId: channel.organizationId,
        channelConnectionId: channel.id,
        provider: "telegram",
        externalEventId,
        eventType: "message",
        payload: update as unknown as Record<string, unknown>,
        signatureValid: true,
        attempts: 1,
      });
    } catch {
      // Already processed - idempotent
      return NextResponse.json({ ok: true });
    }

    const contactName =
      [message.from?.first_name, message.from?.last_name]
        .filter(Boolean)
        .join(" ") ||
      message.from?.username ||
      message.chat.first_name ||
      "Telegram user";

    await processInbound({
      organizationId: channel.organizationId,
      channelConnectionId: channel.id,
      channelType: "telegram",
      externalConversationId: String(message.chat.id),
      externalContactId: String(message.from?.id ?? message.chat.id),
      contactName,
      text,
      externalMessageId: String(message.message_id),
      timestamp: new Date(message.date * 1000),
      rawPayload: update,
    });

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(
        and(
          eq(webhookEvents.provider, "telegram"),
          eq(webhookEvents.externalEventId, externalEventId),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error, channelId }, "Telegram webhook error");
    return NextResponse.json({ ok: true });
  }
}
