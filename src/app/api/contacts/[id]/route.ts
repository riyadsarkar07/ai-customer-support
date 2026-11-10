import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contactIdentities,
  contacts,
  conversations,
} from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { scopedContact } from "@/lib/inbox/access";
import { contactSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "contact.view");

    const { id } = await params;
    const contact = await scopedContact(ctx.organization.id, id);

    const identities = await db
      .select()
      .from(contactIdentities)
      .where(
        and(
          eq(contactIdentities.contactId, id),
          eq(contactIdentities.organizationId, ctx.organization.id),
        ),
      );

    const convs = await db
      .select({
        id: conversations.id,
        status: conversations.status,
        channelType: conversations.channelType,
        lastMessagePreview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.contactId, id),
          eq(conversations.organizationId, ctx.organization.id),
        ),
      )
      .orderBy(asc(conversations.lastMessageAt));

    return NextResponse.json({ contact, identities, conversations: convs });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "contact.manage");

    const { id } = await params;
    await scopedContact(ctx.organization.id, id);

    const input = contactSchema.partial().parse(await req.json().catch(() => null));

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.email !== undefined) updates.email = input.email || null;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.tags !== undefined) updates.tags = input.tags;
    if (input.notes !== undefined) updates.notes = input.notes;

    const [contact] = await db
      .update(contacts)
      .set(updates)
      .where(
        and(eq(contacts.id, id), eq(contacts.organizationId, ctx.organization.id)),
      )
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "contact.update",
      resourceType: "contact",
      resourceId: id,
    });

    return NextResponse.json({ contact });
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
    assertPermission(ctx.permissions, "contact.manage");

    const { id } = await params;
    await scopedContact(ctx.organization.id, id);

    await db
      .delete(contacts)
      .where(
        and(eq(contacts.id, id), eq(contacts.organizationId, ctx.organization.id)),
      );

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "contact.delete",
      resourceType: "contact",
      resourceId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
