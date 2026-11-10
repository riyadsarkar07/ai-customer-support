import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  channelConnections,
  contactIdentities,
  contacts,
  conversations,
  messages,
  organizations,
} from "@/lib/db/schema";
import { publish } from "@/lib/realtime/bus";
import { logger } from "@/lib/logger";

export async function findOrCreateContact(params: {
  organizationId: string;
  channelConnectionId: string;
  channelType: "website" | "telegram" | "facebook" | "instagram" | "whatsapp" | "gmail" | "outlook";
  externalId: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ contactId: string; isNew: boolean }> {
  const existing = await db
    .select({ contactId: contactIdentities.contactId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.organizationId, params.organizationId),
        eq(contactIdentities.channelType, params.channelType),
        eq(contactIdentities.externalId, params.externalId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(contacts)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, existing[0].contactId),
          eq(contacts.organizationId, params.organizationId),
        ),
      );
    return { contactId: existing[0].contactId, isNew: false };
  }

  const [contact] = await db
    .insert(contacts)
    .values({
      organizationId: params.organizationId,
      name: params.displayName ?? null,
      email: params.email ?? null,
      avatarUrl: params.avatarUrl ?? null,
      lastSeenAt: new Date(),
    })
    .returning({ id: contacts.id });

  await db.insert(contactIdentities).values({
    organizationId: params.organizationId,
    contactId: contact!.id,
    channelType: params.channelType,
    channelConnectionId: params.channelConnectionId,
    externalId: params.externalId,
    displayName: params.displayName,
    metadata: params.metadata ?? {},
  });

  return { contactId: contact!.id, isNew: true };
}

export async function findOrCreateConversation(params: {
  organizationId: string;
  contactId: string;
  channelConnectionId: string;
  channelType: "website" | "telegram" | "facebook" | "instagram" | "whatsapp" | "gmail" | "outlook";
  subject?: string;
}): Promise<{ id: string; isNew: boolean }> {
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, params.organizationId),
        eq(conversations.contactId, params.contactId),
        eq(conversations.channelConnectionId, params.channelConnectionId),
        sql`${conversations.status} <> 'archived'`,
      ),
    )
    .orderBy(sql`${conversations.lastMessageAt} desc`)
    .limit(1);

  if (existing[0]) return { id: existing[0].id, isNew: false };

  const [created] = await db
    .insert(conversations)
    .values({
      organizationId: params.organizationId,
      contactId: params.contactId,
      channelConnectionId: params.channelConnectionId,
      channelType: params.channelType,
      subject: params.subject,
      status: "open",
    })
    .returning({ id: conversations.id });

  publish({
    type: "conversation.created",
    organizationId: params.organizationId,
    conversationId: created!.id,
  });

  return { id: created!.id, isNew: true };
}

export async function addInboundMessage(params: {
  organizationId: string;
  conversationId: string;
  body: string;
  externalMessageId?: string;
  attachments?: Array<{ url: string; type: string; name: string }>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}): Promise<{ messageId: string; isDuplicate: boolean }> {
  if (params.externalMessageId) {
    const dup = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, params.conversationId),
          eq(messages.externalMessageId, params.externalMessageId),
        ),
      )
      .limit(1);
    if (dup[0]) return { messageId: dup[0].id, isDuplicate: true };
  }

  const [msg] = await db
    .insert(messages)
    .values({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      direction: "inbound",
      senderType: "contact",
      body: params.body,
      attachments: params.attachments ?? [],
      status: "delivered",
      externalMessageId: params.externalMessageId ?? null,
      metadata: params.metadata ?? {},
      createdAt: params.createdAt ?? new Date(),
    })
    .returning({ id: messages.id });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: params.body.slice(0, 160),
      unreadCount: sql`${conversations.unreadCount} + 1`,
      status: sql`CASE WHEN ${conversations.status} = 'resolved' THEN 'open' ELSE ${conversations.status} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, params.conversationId),
        eq(conversations.organizationId, params.organizationId),
      ),
    );

  publish({
    type: "message.created",
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    messageId: msg!.id,
  });
  publish({
    type: "conversation.updated",
    organizationId: params.organizationId,
    conversationId: params.conversationId,
  });

  return { messageId: msg!.id, isDuplicate: false };
}

export async function addOutboundMessage(params: {
  organizationId: string;
  conversationId: string;
  body: string;
  senderType: "agent" | "ai" | "system";
  senderId?: string | null;
  status?: "queued" | "sent" | "failed";
  externalMessageId?: string | null;
  attachments?: Array<{ url: string; type: string; name: string }>;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [msg] = await db
    .insert(messages)
    .values({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      direction: "outbound",
      senderType: params.senderType,
      senderId: params.senderId ?? null,
      body: params.body,
      attachments: params.attachments ?? [],
      status: params.status ?? "sent",
      externalMessageId: params.externalMessageId ?? null,
      metadata: params.metadata ?? {},
    })
    .returning({ id: messages.id });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: params.body.slice(0, 160),
      unreadCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, params.conversationId),
        eq(conversations.organizationId, params.organizationId),
      ),
    );

  publish({
    type: "message.created",
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    messageId: msg!.id,
  });

  return msg!.id;
}

export async function getChannelForSend(params: {
  organizationId: string;
  channelConnectionId: string;
}) {
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, params.channelConnectionId),
        eq(channelConnections.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getOrganizationPublicInfo(organizationId: string) {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      brandColor: organizations.brandColor,
      logoUrl: organizations.logoUrl,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org ?? null;
}

export function logInboxError(context: Record<string, unknown>, message: string) {
  logger.error(context, message);
}
