import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { aiSettingsSchema } from "@/lib/validation";
import { getOrCreateSettings } from "@/lib/ai/reply";
import { audit } from "@/lib/api/audit";
import { aiConfigured } from "@/lib/ai/provider";
import { env } from "@/lib/env";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "ai.manage");

    const settings = await getOrCreateSettings(ctx.organization.id);
    return NextResponse.json({
      settings,
      providerConfigured: aiConfigured(),
      serverModel: env.OPENAI_CHAT_MODEL,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "ai.manage");

    const input = aiSettingsSchema.parse(await req.json().catch(() => null));
    await getOrCreateSettings(ctx.organization.id);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "enabled",
      "provider",
      "model",
      "personality",
      "tone",
      "languages",
      "autoDetectLanguage",
      "handoverOnLowConfidence",
      "businessRules",
      "greetingMessage",
      "aiPaused",
      "maxContextChunks",
    ] as const) {
      if (input[key] !== undefined) updates[key] = input[key];
    }
    if (input.confidenceThreshold !== undefined) {
      updates.confidenceThreshold = String(input.confidenceThreshold);
    }
    if (input.temperature !== undefined) {
      updates.temperature = String(input.temperature);
    }

    const [updated] = await db
      .update(aiSettings)
      .set(updates)
      .where(eq(aiSettings.organizationId, ctx.organization.id))
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "ai.settings.update",
      resourceType: "ai_settings",
      metadata: { fields: Object.keys(input) },
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
