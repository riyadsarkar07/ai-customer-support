import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations, memberships } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  assertPermission,
  ValidationError,
} from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedConversation } from "@/lib/inbox/access";
import { audit } from "@/lib/api/audit";
import { publish } from "@/lib/realtime/bus";

const patchSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "archived"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  aiEnabled: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "conversation.manage");

    const { id } = await params;
    const conversation = await scopedConversation(ctx.organization.id, id);

    const body = await req.json().catch(() => null);
    const input = patchSchema.parse(body);

    if (input.assigneeId) {
      const [member] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, ctx.organization.id),
            eq(memberships.userId, input.assigneeId),
            eq(memberships.status, "active"),
          ),
        )
        .limit(1);
      if (!member) {
        throw new ValidationError("Assignee is not a member of this workspace");
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;
    if (input.aiEnabled !== undefined) {
      updates.aiEnabled = input.aiEnabled;
      updates.aiPausedUntil = input.aiEnabled ? null : new Date(Date.now() + 86400_000);
    }
    if (input.tags !== undefined) {
      updates.tags = sql`${JSON.stringify(input.tags)}::jsonb`;
    }

    const [updated] = await db
      .update(conversations)
      .set(updates)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.organizationId, ctx.organization.id),
        ),
      )
      .returning();

    publish({
      type: "conversation.updated",
      organizationId: ctx.organization.id,
      conversationId: id,
    });

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "conversation.update",
      resourceType: "conversation",
      resourceId: id,
      metadata: { changes: Object.keys(input) },
    });

    void conversation;
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
