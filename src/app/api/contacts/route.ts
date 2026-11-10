import { NextResponse } from "next/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contactIdentities, contacts, conversations } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { contactSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";

export async function GET(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "contact.view");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const tag = searchParams.get("tag")?.trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Number(searchParams.get("limit") ?? 25));
    const offset = (page - 1) * limit;

    const conditions = [eq(contacts.organizationId, ctx.organization.id)];
    if (q) {
      conditions.push(
        or(
          ilike(contacts.name, `%${q}%`),
          ilike(contacts.email, `%${q}%`),
          ilike(contacts.phone, `%${q}%`),
        )!,
      );
    }
    if (tag) {
      conditions.push(sql`${contacts.tags} @> ${JSON.stringify([tag])}::jsonb`);
    }
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ value: count() })
      .from(contacts)
      .where(where);

    const contactIds = rows.map((r) => r.id);
    const convCounts =
      contactIds.length > 0
        ? await db
            .select({
              contactId: conversations.contactId,
              value: count(),
            })
            .from(conversations)
            .where(
              and(
                eq(conversations.organizationId, ctx.organization.id),
                inArray(conversations.contactId, contactIds),
              ),
            )
            .groupBy(conversations.contactId)
        : [];

    const identities =
      contactIds.length > 0
        ? await db
            .select({
              contactId: contactIdentities.contactId,
              channelType: contactIdentities.channelType,
            })
            .from(contactIdentities)
            .where(
              and(
                eq(contactIdentities.organizationId, ctx.organization.id),
                inArray(contactIdentities.contactId, contactIds),
              ),
            )
        : [];

    const countMap = Object.fromEntries(
      convCounts.map((c) => [c.contactId, Number(c.value)]),
    );
    const channelMap = new Map<string, string[]>();
    for (const i of identities) {
      const arr = channelMap.get(i.contactId) ?? [];
      if (!arr.includes(i.channelType)) arr.push(i.channelType);
      channelMap.set(i.contactId, arr);
    }

    return NextResponse.json({
      contacts: rows.map((c) => ({
        ...c,
        conversationCount: countMap[c.id] ?? 0,
        channelTypes: channelMap.get(c.id) ?? [],
      })),
      total: Number(totalRow?.value ?? 0),
      page,
      limit,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "contact.manage");

    const input = contactSchema.parse(await req.json().catch(() => null));
    const [contact] = await db
      .insert(contacts)
      .values({
        organizationId: ctx.organization.id,
        name: input.name ?? null,
        email: input.email || null,
        phone: input.phone ?? null,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
      })
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "contact.create",
      resourceType: "contact",
      resourceId: contact!.id,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
