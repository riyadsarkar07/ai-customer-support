import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  channelConnections,
  contactIdentities,
  contacts,
  conversations,
  messages,
  notes,
  users,
} from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedConversation, listAssignableMembers } from "@/lib/inbox/access";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "conversation.view");

    const { id } = await params;
    const conv = await scopedConversation(ctx.organization.id, id);

    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, conv.contactId),
          eq(contacts.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);

    const [channel] = await db
      .select({
        id: channelConnections.id,
        name: channelConnections.name,
        type: channelConnections.type,
        status: channelConnections.status,
      })
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, conv.channelConnectionId),
          eq(channelConnections.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);

    const msgs = await db
      .select({
        id: messages.id,
        direction: messages.direction,
        senderType: messages.senderType,
        senderId: messages.senderId,
        body: messages.body,
        attachments: messages.attachments,
        status: messages.status,
        createdAt: messages.createdAt,
        senderName: users.name,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.conversationId, id),
          eq(messages.organizationId, ctx.organization.id),
        ),
      )
      .orderBy(asc(messages.createdAt));

    const internalNotes = await db
      .select({
        id: notes.id,
        body: notes.body,
        createdAt: notes.createdAt,
        authorName: users.name,
        authorId: notes.authorId,
      })
      .from(notes)
      .leftJoin(users, eq(users.id, notes.authorId))
      .where(
        and(
          eq(notes.conversationId, id),
          eq(notes.organizationId, ctx.organization.id),
        ),
      )
      .orderBy(desc(notes.createdAt));

    const identities = await db
      .select({
        channelType: contactIdentities.channelType,
        externalId: contactIdentities.externalId,
        displayName: contactIdentities.displayName,
      })
      .from(contactIdentities)
      .where(
        and(
          eq(contactIdentities.contactId, conv.contactId),
          eq(contactIdentities.organizationId, ctx.organization.id),
        ),
      );

    const members = await listAssignableMembers(ctx.organization.id);

    if (conv.unreadCount > 0) {
      await db
        .update(conversations)
        .set({ unreadCount: 0 })
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.organizationId, ctx.organization.id),
          ),
        );
    }

    return NextResponse.json({
      conversation: conv,
      contact,
      channel,
      messages: msgs,
      notes: internalNotes,
      identities,
      members,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
