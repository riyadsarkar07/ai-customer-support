import { NextResponse } from "next/server";
import { and, eq, isNull, or, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { jsonError, toErrorResponse } from "@/lib/api/response";

export async function POST() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.organizationId, ctx.organization.id),
          or(
            eq(notifications.userId, ctx.user.id),
            isNull(notifications.userId),
          ),
          isNull(notifications.readAt),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
