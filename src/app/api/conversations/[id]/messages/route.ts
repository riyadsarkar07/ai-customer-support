import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedConversation } from "@/lib/inbox/access";
import { sendMessageToChannel } from "@/lib/inbox/dispatch";
import { messageSendSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "conversation.manage");

    const { id } = await params;
    const conv = await scopedConversation(ctx.organization.id, id);

    const input = messageSendSchema.parse(await req.json().catch(() => null));

    if (input.internal) {
      const [note] = await db
        .insert(notes)
        .values({
          organizationId: ctx.organization.id,
          conversationId: id,
          authorId: ctx.user.id,
          body: input.body,
        })
        .returning();
      return NextResponse.json({ note, internal: true }, { status: 201 });
    }

    const result = await sendMessageToChannel({
      organizationId: ctx.organization.id,
      conversationId: id,
      channelConnectionId: conv.channelConnectionId,
      text: input.body,
      senderType: "agent",
      senderId: ctx.user.id,
    });

    if (!result) return jsonError("Conversation channel unavailable", 409);

    return NextResponse.json(
      {
        messageId: result.messageId,
        status: result.status,
        error: result.error,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
