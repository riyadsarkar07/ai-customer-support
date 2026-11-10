import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows, workflowRuns } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { workflowSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "workflow.manage");

    const list = await db
      .select()
      .from(workflows)
      .where(eq(workflows.organizationId, ctx.organization.id))
      .orderBy(desc(workflows.createdAt));

    const recentRuns = await db
      .select({
        id: workflowRuns.id,
        workflowId: workflowRuns.workflowId,
        status: workflowRuns.status,
        startedAt: workflowRuns.startedAt,
        error: workflowRuns.error,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.organizationId, ctx.organization.id))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(10);

    const [runsToday] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.organizationId, ctx.organization.id),
          gte(workflowRuns.startedAt, new Date(Date.now() - 86400_000)),
        ),
      );

    return NextResponse.json({
      workflows: list,
      recentRuns,
      runsLast24h: Number(runsToday?.value ?? 0),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "workflow.manage");

    const input = workflowSchema.parse(await req.json().catch(() => null));
    const [workflow] = await db
      .insert(workflows)
      .values({
        organizationId: ctx.organization.id,
        name: input.name,
        description: input.description,
        enabled: input.enabled ?? true,
        trigger: input.trigger,
        conditions: input.conditions,
        actions: input.actions,
        createdBy: ctx.user.id,
      })
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "workflow.create",
      resourceType: "workflow",
      resourceId: workflow!.id,
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
