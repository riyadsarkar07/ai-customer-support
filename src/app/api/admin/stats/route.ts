import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/api/response";
import { getPlatformOverview } from "@/lib/admin";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const data = await getPlatformOverview();
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
