import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns, workflows } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission, NotFoundError } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { workflowSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";

async function scopedWorkflow(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(workflows)
    .where(
      and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Workflow not found");
  return row;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "workflow.manage");

    const { id } = await params;
    const workflow = await scopedWorkflow(ctx.organization.id, id);

    const runs = await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workflowId, id),
          eq(workflowRuns.organizationId, ctx.organization.id),
        ),
      )
      .orderBy(desc(workflowRuns.startedAt))
      .limit(25);

    return NextResponse.json({ workflow, runs });
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
    assertPermission(ctx.permissions, "workflow.manage");

    const { id } = await params;
    await scopedWorkflow(ctx.organization.id, id);

    const body = await req.json().catch(() => null);
    const partial = workflowSchema.partial().parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "name",
      "description",
      "enabled",
      "trigger",
      "conditions",
      "actions",
    ] as const) {
      if (partial[key] !== undefined) updates[key] = partial[key];
    }

    const [updated] = await db
      .update(workflows)
      .set(updates)
      .where(
        and(eq(workflows.id, id), eq(workflows.organizationId, ctx.organization.id)),
      )
      .returning();

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "workflow.update",
      resourceType: "workflow",
      resourceId: id,
    });

    return NextResponse.json({ workflow: updated });
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
    assertPermission(ctx.permissions, "workflow.manage");

    const { id } = await params;
    await scopedWorkflow(ctx.organization.id, id);

    await db
      .delete(workflows)
      .where(
        and(eq(workflows.id, id), eq(workflows.organizationId, ctx.organization.id)),
      );

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "workflow.delete",
      resourceType: "workflow",
      resourceId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
