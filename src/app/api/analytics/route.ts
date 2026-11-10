import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { getAnalytics, type AnalyticsRange } from "@/lib/analytics";

export async function GET(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "analytics.view");

    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("range") ?? "30");
    const range: AnalyticsRange = raw === 7 || raw === 90 ? raw : 30;

    const data = await getAnalytics(ctx.organization.id, range);

    const ids = data.agents.map((a) => a.agentId).filter(Boolean);
    const names =
      ids.length > 0
        ? await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, ids))
        : [];
    const nameMap = new Map(names.map((n) => [n.id, n.name]));

    return NextResponse.json({
      ...data,
      agents: data.agents.map((a) => ({
        ...a,
        name: nameMap.get(a.agentId) ?? "Unknown",
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
