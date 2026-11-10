import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse, jsonError } from "@/lib/api/response";
import { planSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder));
    return NextResponse.json({ plans: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const input = planSchema.parse(await req.json().catch(() => null));

    const [created] = await db
      .insert(plans)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description,
        price: String(input.price),
        currency: input.currency,
        interval: input.interval,
        trialDays: input.trialDays,
        maxAgents: input.maxAgents,
        maxConversations: input.maxConversations,
        maxChannels: input.maxChannels,
        maxKnowledgeMb: input.maxKnowledgeMb,
        maxAiReplies: input.maxAiReplies,
        features: input.features,
        isActive: input.isActive,
        isPublic: input.isPublic,
        sortOrder: input.sortOrder,
      })
      .returning();

    await audit({
      actorId: admin.id,
      action: "admin.plan_create",
      resourceType: "plan",
      resourceId: created!.id,
      metadata: { slug: input.slug },
    });

    return NextResponse.json({ plan: created }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchSchema = planSchema.partial().extend({ id: z.string().uuid() });

export async function PATCH(req: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const input = patchSchema.parse(await req.json().catch(() => null));
    const { id, price, ...rest } = input;

    const updates: Record<string, unknown> = { ...rest };
    if (price !== undefined) updates.price = String(price);

    const [updated] = await db
      .update(plans)
      .set(updates)
      .where(eq(plans.id, id))
      .returning();

    if (!updated) return jsonError("Plan not found", 404);

    await audit({
      actorId: admin.id,
      action: "admin.plan_update",
      resourceType: "plan",
      resourceId: id,
      metadata: { fields: Object.keys(updates) },
    });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
