import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelConnections, webhookEvents } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { processInbound } from "@/lib/inbox/dispatch";
import { logger } from "@/lib/logger";
import { validateMetaSignature } from "@/lib/channels/meta-webhook";
import type { ChannelType } from "@/lib/channels/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && env.META_VERIFY_TOKEN && token === env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type MetaEntry = {
  id: string;
  time?: number;
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
      mid: string;
      text?: string;
      attachments?: Array<{ type: string; payload?: { url?: string } }>;
    };
  }>;
  changes?: Array<{
    field: string;
    value: {
      messaging_product?: string;
      metadata?: { phone_number_id?: string };
      contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
      messages?: Array<{
        id: string;
        from: string;
        timestamp: string;
        text?: { body: string };
        type: string;
      }>;
      statuses?: unknown[];
    };
  }>;
};

export async function POST(req: Request) {
  const rawBody = await req.text();

  try {
    if (!validateMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      logger.warn("Meta webhook signature verification failed");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      object: string;
      entry: MetaEntry[];
    };

    const objectType = payload.object;
    const channelType: ChannelType | null =
      objectType === "page"
        ? "facebook"
        : objectType === "instagram"
          ? "instagram"
          : objectType === "whatsapp_business_account"
            ? "whatsapp"
            : null;

    if (!channelType) {
      return NextResponse.json({ ok: true });
    }

    for (const entry of payload.entry ?? []) {
      // Instagram payloads sometimes arrive as "page" object; resolve via the
      // stored connection external id rather than trusting the payload type.
      const connections = await db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.type, channelType));

      const whatsappPhoneId = entry.changes?.[0]?.value?.metadata?.phone_number_id;
      const recipientPageId = entry.id;

      const channel = connections.find((c) => {
        if (channelType === "whatsapp") {
          return c.externalId === whatsappPhoneId;
        }
        return c.externalId === recipientPageId;
      });

      if (!channel) {
        logger.warn(
          { channelType, entryId: entry.id },
          "Meta webhook has no matching channel connection",
        );
        continue;
      }

      if (channelType === "whatsapp") {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          const contactName = value.contacts?.[0]?.profile?.name;
          for (const msg of value.messages ?? []) {
            const text = msg.text?.body ?? "";
            if (!text.trim()) continue;
            const eventId = `wa_${msg.id}`;
            const isNew = await recordEvent({
              organizationId: channel.organizationId,
              channelConnectionId: channel.id,
              provider: "whatsapp",
              eventId,
              payload: msg as unknown as Record<string, unknown>,
            });
            if (!isNew) continue;

            await processInbound({
              organizationId: channel.organizationId,
              channelConnectionId: channel.id,
              channelType: "whatsapp",
              externalConversationId: msg.from,
              externalContactId: msg.from,
              contactName,
              text,
              externalMessageId: msg.id,
              timestamp: new Date(Number(msg.timestamp) * 1000),
              rawPayload: msg,
            });
          }
        }
        continue;
      }

      for (const event of entry.messaging ?? []) {
        const msg = event.message;
        if (!msg) continue;
        const text = msg.text ?? "";
        if (!text.trim() && !msg.attachments?.length) continue;

        const eventId = `meta_${msg.mid}`;
        const isNew = await recordEvent({
          organizationId: channel.organizationId,
          channelConnectionId: channel.id,
          provider: channelType,
          eventId,
          payload: event as unknown as Record<string, unknown>,
        });
        if (!isNew) continue;

        await processInbound({
          organizationId: channel.organizationId,
          channelConnectionId: channel.id,
          channelType,
          externalConversationId: event.sender.id,
          externalContactId: event.sender.id,
          text,
          externalMessageId: msg.mid,
          timestamp: new Date(event.timestamp),
          rawPayload: event,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Meta webhook processing error");
    // Always return 200 so the provider does not retry indefinitely on
    // malformed events; genuine failures are recorded in webhook_events.
    return NextResponse.json({ ok: true });
  }
}

async function recordEvent(params: {
  organizationId: string;
  channelConnectionId: string;
  provider: string;
  eventId: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await db.insert(webhookEvents).values({
      organizationId: params.organizationId,
      channelConnectionId: params.channelConnectionId,
      provider: params.provider,
      externalEventId: params.eventId,
      eventType: "message",
      payload: params.payload,
      signatureValid: true,
      processedAt: new Date(),
      attempts: 1,
    });
    return true;
  } catch {
    return false;
  }
}
