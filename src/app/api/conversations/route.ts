import { NextResponse } from "next/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  channelConnections,
  contacts,
  conversations,
  messages,
} from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { listAssignableMembers } from "@/lib/inbox/access";

export async function GET(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "conversation.view");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");
    const assignee = searchParams.get("assignee");
    const q = searchParams.get("q")?.trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(50, Number(searchParams.get("limit") ?? 30));
    const offset = (page - 1) * limit;

    const conditions = [eq(conversations.organizationId, ctx.organization.id)];
    if (status && ["open", "pending", "resolved", "archived"].includes(status)) {
      conditions.push(
        eq(
          conversations.status,
          status as "open" | "pending" | "resolved" | "archived",
        ),
      );
    }
    if (channel) {
      conditions.push(eq(conversations.channelType, channel as "website"));
    }
    if (assignee === "me") {
      conditions.push(eq(conversations.assigneeId, ctx.user.id));
    } else if (assignee === "unassigned") {
      conditions.push(sql`${conversations.assigneeId} IS NULL`);
    } else if (assignee) {
      conditions.push(eq(conversations.assigneeId, assignee));
    }
    if (q) {
      conditions.push(
        or(
          ilike(contacts.name, `%${q}%`),
          ilike(contacts.email, `%${q}%`),
          ilike(conversations.lastMessagePreview, `%${q}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const rows = await db
      .select({
        id: conversations.id,
        status: conversations.status,
        priority: conversations.priority,
        channelType: conversations.channelType,
        channelConnectionId: conversations.channelConnectionId,
        lastMessagePreview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
        unreadCount: conversations.unreadCount,
        aiEnabled: conversations.aiEnabled,
        tags: conversations.tags,
        assigneeId: conversations.assigneeId,
        contactId: contacts.id,
        contactName: contacts.name,
        contactEmail: contacts.email,
        contactAvatar: contacts.avatarUrl,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(where)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(where);

    const counts = await db
      .select({
        status: conversations.status,
        value: count(),
      })
      .from(conversations)
      .where(eq(conversations.organizationId, ctx.organization.id))
      .groupBy(conversations.status);

    const channels = await db
      .select({
        id: channelConnections.id,
        name: channelConnections.name,
        type: channelConnections.type,
      })
      .from(channelConnections)
      .where(eq(channelConnections.organizationId, ctx.organization.id));

    const members = await listAssignableMembers(ctx.organization.id);

    return NextResponse.json({
      conversations: rows,
      total: Number(totalRow?.value ?? 0),
      page,
      limit,
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.value)])),
      channels,
      members,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
