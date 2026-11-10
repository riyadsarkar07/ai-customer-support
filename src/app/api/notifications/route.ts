import { NextResponse } from "next/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { jsonError, toErrorResponse } from "@/lib/api/response";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, ctx.organization.id),
          or(
            eq(notifications.userId, ctx.user.id),
            isNull(notifications.userId),
          ),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(30);

    return NextResponse.json({ notifications: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}
