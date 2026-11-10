import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/api/response";
import { audit } from "@/lib/api/audit";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt))
      .limit(50);
    return NextResponse.json({ announcements: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  level: z.enum(["info", "warning", "success"]).default("info"),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const input = createSchema.parse(await req.json().catch(() => null));

    const [created] = await db
      .insert(announcements)
      .values({
        title: input.title,
        body: input.body,
        level: input.level,
        createdBy: admin.id,
      })
      .returning();

    await audit({
      actorId: admin.id,
      action: "admin.announcement_create",
      resourceType: "announcement",
      resourceId: created!.id,
    });

    return NextResponse.json({ announcement: created }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const input = patchSchema.parse(await req.json().catch(() => null));
    const [updated] = await db
      .update(announcements)
      .set({ active: input.active })
      .where(eq(announcements.id, input.id))
      .returning();
    await audit({
      actorId: admin.id,
      action: "admin.announcement_toggle",
      resourceType: "announcement",
      resourceId: input.id,
      metadata: { active: input.active },
    });
    return NextResponse.json({ announcement: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
