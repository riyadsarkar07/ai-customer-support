import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiSettings,
  channelConnections,
  contactIdentities,
  conversations,
  messages,
} from "@/lib/db/schema";
import { getProvider } from "@/lib/channels/registry";
import type { ChannelType } from "@/lib/channels/registry";
import { generateReply, isAiActive } from "@/lib/ai/reply";
import { enforceAiLimit } from "@/lib/tenant";
import {
  addInboundMessage,
  addOutboundMessage,
  findOrCreateContact,
  findOrCreateConversation,
  getChannelForSend,
} from "@/lib/inbox/service";
import { decryptSecret } from "@/lib/crypto";
import { runWorkflowsForMessage } from "@/lib/workflows/runner";
import { notify } from "@/lib/api/audit";
import { logger } from "@/lib/logger";

export type InboundEvent = {
  organizationId: string;
  channelConnectionId: string;
  channelType: ChannelType;
  externalConversationId: string;
  externalContactId: string;
  contactName?: string;
  contactEmail?: string;
  contactAvatar?: string;
  text: string;
  attachments?: Array<{ url: string; type: string; name: string }>;
  externalEventId?: string;
  externalMessageId?: string;
  timestamp?: Date;
  rawPayload?: unknown;
};

export async function processInbound(event: InboundEvent): Promise<{
  conversationId: string;
  duplicate: boolean;
}> {
  const { organizationId, channelConnectionId, channelType } = event;

  const { contactId } = await findOrCreateContact({
    organizationId,
    channelConnectionId,
    channelType,
    externalId: event.externalContactId,
    displayName: event.contactName,
    email: event.contactEmail,
    avatarUrl: event.contactAvatar,
  });

  const { id: conversationId } = await findOrCreateConversation({
    organizationId,
    contactId,
    channelConnectionId,
    channelType,
  });

  const { isDuplicate } = await addInboundMessage({
    organizationId,
    conversationId,
    body: event.text,
    externalMessageId: event.externalMessageId,
    attachments: event.attachments,
    metadata: { raw: event.rawPayload },
    createdAt: event.timestamp,
  });

  if (isDuplicate) return { conversationId, duplicate: true };

  await db
    .update(channelConnections)
    .set({ lastEventAt: new Date() })
    .where(
      and(
        eq(channelConnections.id, channelConnectionId),
        eq(channelConnections.organizationId, organizationId),
      ),
    );

  // Run automations (non-blocking failures)
  runWorkflowsForMessage({
    organizationId,
    conversationId,
    text: event.text,
    channelType,
  }).catch((err) => logger.error({ err, conversationId }, "Workflow run failed"));

  // AI auto reply
  void maybeAutoReply({
    organizationId,
    conversationId,
    channelConnectionId,
    text: event.text,
    channelType,
  }).catch((err) =>
    logger.error({ err, conversationId }, "AI auto-reply failed"),
  );

  return { conversationId, duplicate: false };
}

async function maybeAutoReply(params: {
  organizationId: string;
  conversationId: string;
  channelConnectionId: string;
  text: string;
  channelType: ChannelType;
}) {
  const [settings] = await db
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.organizationId, params.organizationId))
    .limit(1);

  if (!settings || !settings.enabled || settings.aiPaused) return;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, params.conversationId),
        eq(conversations.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!conv) return;

  const [channel] = await db
    .select({ aiEnabled: channelConnections.aiEnabled })
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, params.channelConnectionId),
        eq(channelConnections.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (channel && !channel.aiEnabled) return;

  if (
    !isAiActive(settings, {
      aiEnabled: conv.aiEnabled,
      aiPausedUntil: conv.aiPausedUntil,
    })
  ) {
    return;
  }

  try {
    await enforceAiLimit(params.organizationId);
  } catch {
    return;
  }

  const decision = await generateReply({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    incomingText: params.text,
    channelType: params.channelType,
  });

  if (decision.action === "reply" && decision.reply) {
    const sent = await sendMessageToChannel({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      channelConnectionId: params.channelConnectionId,
      text: decision.reply,
      senderType: "ai",
    });
    if (sent) {
      await db
        .update(messages)
        .set({ status: "sent" })
        .where(eq(messages.id, sent.messageId));
    }
  } else if (decision.action === "handover") {
    await db
      .update(conversations)
      .set({ status: "pending", aiEnabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(conversations.id, params.conversationId),
          eq(conversations.organizationId, params.organizationId),
        ),
      );
    await addOutboundMessage({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      body: "I'm connecting you with a member of our team who can help with this.",
      senderType: "system",
      status: "sent",
    });
    await notify({
      organizationId: params.organizationId,
      type: "conversation.handover",
      title: "AI needs a human",
      body: "A conversation was escalated because the AI could not answer confidently.",
      link: `/dashboard/inbox?conversation=${params.conversationId}`,
    });
  }
}

export async function sendMessageToChannel(params: {
  organizationId: string;
  conversationId: string;
  channelConnectionId: string;
  text: string;
  senderType: "agent" | "ai" | "system";
  senderId?: string | null;
}): Promise<{ messageId: string; status: string; error?: string } | null> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, params.conversationId),
        eq(conversations.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!conv) return null;

  const channel = await getChannelForSend({
    organizationId: params.organizationId,
    channelConnectionId: params.channelConnectionId,
  });
  if (!channel) return null;

  const identity = await db
    .select({ externalId: contactIdentities.externalId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.organizationId, params.organizationId),
        eq(contactIdentities.contactId, conv.contactId),
        eq(contactIdentities.channelConnectionId, channel.id),
      ),
    )
    .limit(1);

  const recipient = identity[0]?.externalId;
  if (!recipient) {
    const messageId = await addOutboundMessage({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      body: params.text,
      senderType: params.senderType,
      senderId: params.senderId,
      status: "failed",
    });
    return { messageId, status: "failed", error: "Missing channel identity" };
  }

  const provider = getProvider(channel.type as ChannelType);
  const result = await provider.send({
    connection: {
      accessToken: decryptSecret(channel.accessToken),
      secret: decryptSecret(channel.secret),
      externalId: channel.externalId,
      config: channel.config ?? {},
    },
    message: { externalRecipientId: recipient, text: params.text },
  });

  const messageId = await addOutboundMessage({
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    body: params.text,
    senderType: params.senderType,
    senderId: params.senderId,
    status: result.status === "failed" ? "failed" : "sent",
    externalMessageId: result.externalMessageId,
    metadata: result.error ? { error: result.error } : {},
  });

  if (result.status === "failed") {
    await db
      .update(channelConnections)
      .set({ lastError: result.error ?? "Send failed", updatedAt: new Date() })
      .where(
        and(
          eq(channelConnections.id, channel.id),
          eq(channelConnections.organizationId, params.organizationId),
        ),
      );
  }

  return { messageId, status: result.status, error: result.error };
}
