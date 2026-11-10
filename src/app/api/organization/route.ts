import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { orgSettingsSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";
import { z } from "zod";

const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  timezone: z.string().max(60).optional(),
  locale: z.enum(["en", "bn"]).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  complete: z.boolean().optional(),
});

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .limit(1);
    if (!org) return jsonError("Workspace not found", 404);
    return NextResponse.json({ organization: org });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "org.manage");

    const raw = await req.json().catch(() => null);
    const onboarding = onboardingSchema.safeParse(raw);
    const input = onboarding.success
      ? onboarding.data
      : orgSettingsSchema.parse(raw);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if ("name" in input && input.name) updates.name = input.name;
    if ("website" in input && input.website !== undefined) {
      updates.website = input.website || null;
    }
    if ("timezone" in input && input.timezone) updates.timezone = input.timezone;
    if ("locale" in input && input.locale) updates.locale = input.locale;
    if ("brandColor" in input && input.brandColor) {
      updates.brandColor = input.brandColor;
    }
    if ("logoUrl" in input && input.logoUrl !== undefined) {
      updates.logoUrl = input.logoUrl || null;
    }
    if ("complete" in input && input.complete) {
      updates.onboardingCompleted = true;
    }

    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, ctx.organization.id))
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "org.update",
      resourceType: "organization",
      resourceId: ctx.organization.id,
    });

    return NextResponse.json({ organization: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
