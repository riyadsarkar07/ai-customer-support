import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { channelConnections } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedChannel } from "@/lib/inbox/access";
import { audit } from "@/lib/api/audit";
import { deleteTelegramWebhook } from "@/lib/channels/telegram";
import { decryptSecret } from "@/lib/crypto";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  aiEnabled: z.boolean().optional(),
  allowedOrigins: z.string().max(1000).optional(),
  status: z.enum(["connected", "disconnected", "error"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "channel.manage");

    const { id } = await params;
    const channel = await scopedChannel(ctx.organization.id, id);
    const input = patchSchema.parse(await req.json().catch(() => null));

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.aiEnabled !== undefined) updates.aiEnabled = input.aiEnabled;
    if (input.status !== undefined) updates.status = input.status;

    if (input.allowedOrigins !== undefined) {
      updates.config = {
        ...(channel.config as Record<string, unknown>),
        allowedOrigins: input.allowedOrigins,
      };
    }

    const [updated] = await db
      .update(channelConnections)
      .set(updates)
      .where(
        and(
          eq(channelConnections.id, id),
          eq(channelConnections.organizationId, ctx.organization.id),
        ),
      )
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "channel.update",
      resourceType: "channel",
      resourceId: id,
    });

    return NextResponse.json({ channel: { id: updated!.id } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "channel.manage");

    const { id } = await params;
    const channel = await scopedChannel(ctx.organization.id, id);

    if (channel.type === "telegram" && channel.accessToken) {
      const token = decryptSecret(channel.accessToken);
      if (token) await deleteTelegramWebhook(token);
    }

    await db
      .delete(channelConnections)
      .where(
        and(
          eq(channelConnections.id, id),
          eq(channelConnections.organizationId, ctx.organization.id),
        ),
      );

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "channel.disconnect",
      resourceType: "channel",
      resourceId: id,
      metadata: { type: channel.type },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
