import { NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversations,
  liveChatSessions,
  messages,
} from "@/lib/db/schema";
import { websiteChatMessageSchema } from "@/lib/validation";
import { jsonError, toErrorResponse, getRequestIp } from "@/lib/api/response";
import { rateLimit } from "@/lib/api/rate-limit";
import { resolveWebsiteChannel, checkOrigin } from "@/lib/channels/website-session";
import { processInbound } from "@/lib/inbox/dispatch";
import { enforceConversationLimit } from "@/lib/tenant";

async function resolveSession(publicKey: string, visitorToken: string) {
  const { channel, organization } = await resolveWebsiteChannel(publicKey);
  const [session] = await db
    .select()
    .from(liveChatSessions)
    .where(
      and(
        eq(liveChatSessions.visitorToken, visitorToken),
        eq(liveChatSessions.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  return { channel, organization, session };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const publicKey = searchParams.get("key") ?? "";
    const visitorToken = searchParams.get("token") ?? "";
    if (!publicKey || !visitorToken) {
      return jsonError("Missing key or token", 400);
    }

    const { channel, organization, session } = await resolveSession(
      publicKey,
      visitorToken,
    );
    checkOrigin(channel, req.headers.get("origin"));

    const since = searchParams.get("since");
    const rows = await db
      .select({
        id: messages.id,
        direction: messages.direction,
        senderType: messages.senderType,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, session.conversationId),
          eq(messages.organizationId, organization.id),
          since ? gt(messages.createdAt, new Date(since)) : undefined,
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(100);

    const [conv] = await db
      .select({
        status: conversations.status,
        aiEnabled: conversations.aiEnabled,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, session.conversationId),
          eq(conversations.organizationId, organization.id),
        ),
      )
      .limit(1);

    return NextResponse.json({
      messages: rows,
      status: conv?.status ?? "open",
      aiEnabled: conv?.aiEnabled ?? false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return jsonError("Chat session not found", 404);
    }
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);
    const rl = rateLimit(`chat-msg:${ip}`, 40, 60_000);
    if (!rl.allowed) return jsonError("Too many messages. Slow down.", 429);

    const body = await req.json().catch(() => null);
    const input = websiteChatMessageSchema.parse(body);

    const { channel, organization, session } = await resolveSession(
      input.publicKey,
      input.visitorToken,
    );
    checkOrigin(channel, req.headers.get("origin"));

    await enforceConversationLimit(organization.id);

    await processInbound({
      organizationId: organization.id,
      channelConnectionId: channel.id,
      channelType: "website",
      externalConversationId: session.conversationId,
      externalContactId: session.visitorToken,
      contactName: "Website visitor",
      text: input.message,
      timestamp: new Date(),
      rawPayload: { source: "website_widget" },
    });

    await db
      .update(liveChatSessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(liveChatSessions.id, session.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return jsonError("Chat session not found", 404);
    }
    return toErrorResponse(error);
  }
}
