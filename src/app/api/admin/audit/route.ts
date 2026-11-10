import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/api/response";
import { listAuditLogs } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(req.url);
    const result = await listAuditLogs({
      organizationId: url.searchParams.get("organizationId") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "30"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
