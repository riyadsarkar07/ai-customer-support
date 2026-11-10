import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contactIdentities, contacts, liveChatSessions } from "@/lib/db/schema";
import { websiteChatInitSchema } from "@/lib/validation";
import { jsonError, toErrorResponse, getRequestIp } from "@/lib/api/response";
import { rateLimit } from "@/lib/api/rate-limit";
import { resolveWebsiteChannel, checkOrigin } from "@/lib/channels/website-session";
import { findOrCreateContact, findOrCreateConversation, addInboundMessage } from "@/lib/inbox/service";
import { randomToken } from "@/lib/crypto";
import { enforceConversationLimit } from "@/lib/tenant";
import { processInbound } from "@/lib/inbox/dispatch";

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);
    const rl = rateLimit(`chat-init:${ip}`, 20, 60_000);
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const body = await req.json().catch(() => null);
    const input = websiteChatInitSchema.parse(body);

    const { channel, organization } = await resolveWebsiteChannel(input.publicKey);
    checkOrigin(channel, req.headers.get("origin"));

    const visitorToken = randomToken(24);

    const contact = await findOrCreateContact({
      organizationId: organization.id,
      channelConnectionId: channel.id,
      channelType: "website",
      externalId: visitorToken,
      displayName: input.name || "Website visitor",
      email: input.email || undefined,
      metadata: input.metadata ?? {},
    });

    const conv = await findOrCreateConversation({
      organizationId: organization.id,
      contactId: contact.contactId,
      channelConnectionId: channel.id,
      channelType: "website",
    });

    await db.insert(liveChatSessions).values({
      organizationId: organization.id,
      contactId: contact.contactId,
      conversationId: conv.id,
      visitorToken,
      metadata: input.metadata ?? {},
    });

    if (input.message) {
      await enforceConversationLimit(organization.id);
      await processInbound({
        organizationId: organization.id,
        channelConnectionId: channel.id,
        channelType: "website",
        externalConversationId: conv.id,
        externalContactId: visitorToken,
        contactName: input.name || "Website visitor",
        text: input.message,
        timestamp: new Date(),
        rawPayload: { source: "website_widget" },
      });
    }

    return NextResponse.json({
      visitorToken,
      conversationId: conv.id,
      organization: { name: organization.name, brandColor: organization.brandColor },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
