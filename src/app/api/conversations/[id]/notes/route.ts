import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission, ValidationError } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedConversation } from "@/lib/inbox/access";
import { z } from "zod";

const noteSchema = z.object({ body: z.string().trim().min(1).max(5000) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "conversation.manage");

    const { id } = await params;
    await scopedConversation(ctx.organization.id, id);

    const input = noteSchema.parse(await req.json().catch(() => null));
    const [note] = await db
      .insert(notes)
      .values({
        organizationId: ctx.organization.id,
        conversationId: id,
        authorId: ctx.user.id,
        body: input.body,
      })
      .returning();

    return NextResponse.json({ note });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "conversation.manage");

    const { id } = await params;
    await scopedConversation(ctx.organization.id, id);

    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get("noteId");
    if (!noteId) throw new ValidationError("noteId is required");

    await db
      .delete(notes)
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.organizationId, ctx.organization.id),
          eq(notes.conversationId, id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
