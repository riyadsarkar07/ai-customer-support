import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse, jsonError } from "@/lib/api/response";
import { listTenants, getTenantDetail } from "@/lib/admin";
import { audit } from "@/lib/api/audit";

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(req.url);
    const detailId = url.searchParams.get("id");
    if (detailId) {
      const detail = await getTenantDetail(detailId);
      if (!detail) return jsonError("Workspace not found", 404);
      return NextResponse.json(detail);
    }
    const result = await listTenants({
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "20"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "suspended", "deleted"]).optional(),
  name: z.string().trim().min(2).max(120).optional(),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const input = patchSchema.parse(await req.json().catch(() => null));

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status) updates.status = input.status;
    if (input.name) updates.name = input.name;

    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, input.id))
      .returning();

    if (!updated) return jsonError("Workspace not found", 404);

    await audit({
      organizationId: updated.id,
      actorId: admin.id,
      action: "admin.tenant_update",
      resourceType: "organization",
      resourceId: updated.id,
      metadata: { status: input.status, name: input.name },
    });

    return NextResponse.json({ organization: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
